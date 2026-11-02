import { transfer } from 'comlink';

import { BaseOPFS } from './BaseOPFS';
import { WatchEventType } from '../types';
import {
    AlreadyExistsError,
    OPFSError,
    ValidationError,
    createFDError,
    mapDomError
} from '../utils/errors';

import {
    calculateReadLength,
    createSyncHandleSafe,
    normalizePath,
    resolvePath,
    safeCloseSyncHandle,
    validateReadWriteArgs
} from '../utils/helpers';

import type { FileOpenOptions, FileStat, OPFSOptions } from '../types';

/** One sync access handle shared by every descriptor open on a path */
interface SharedHandle {
    syncHandle: FileSystemSyncAccessHandle;
    refCount: number;
}

/** The path lock held by a group of descriptors from the first `open()` until the last `close()` */
interface DescriptorLock {
    /** Descriptors (open or opening) that hold this lock */
    refCount: number;
    /** Resolves once the lock is held */
    acquired: Promise<void>;
    /** Lets the lock go */
    release: () => void;
    /** Runs exclusive creates one at a time, so their exists-check and create are atomic */
    exclusiveCreates: Promise<unknown>;
}

interface FileDescriptor {
    path: string;
    /** The sync handle shared with the other descriptors open on the path */
    handle: SharedHandle;
    position: number;
    /** Set for descriptors from the public `open()`; internal ones run under the caller's lock */
    lock?: DescriptorLock;
}

/**
 * Sync OPFS backend using `FileSystemSyncAccessHandle` (dedicated worker only).
 *
 * Provides high-level file I/O and Node-like file descriptors.
 *
 * @example
 * ```typescript
 * import { OPFSSync } from 'opfs-worker/pure';
 *
 * const fs = new OPFSSync();
 * await fs.writeFile('/data/config.json', new TextEncoder().encode(JSON.stringify({ theme: 'dark' })));
 * const config = await fs.readFile('/data/config.json');
 * ```
 */
export class OPFSSync extends BaseOPFS {
    /** Shared sync handles per path (OPFS allows only one handle per file) */
    private openHandles = new Map<string, SharedHandle>();

    /** In-flight sync handle creation per path, so concurrent opens don't each create one */
    private pendingHandles = new Map<string, { promise: Promise<void>; create: boolean }>();

    /** Path locks that more descriptors may join, per path (see `open()`) */
    private sharedLocks = new Map<string, DescriptorLock>();

    /** Map of open file descriptors to their metadata */
    private openFiles = new Map<number, FileDescriptor>();

    /** Next available file descriptor number */
    private nextFd = 1;

    constructor(options?: OPFSOptions) {
        super(options);
    }

    /**
     * Get file info by descriptor with validation
     * @private
     */
    private _getFileDescriptor(fd: number): FileDescriptor {
        const fileInfo = this.openFiles.get(fd);

        if (!fileInfo) {
            throw new ValidationError('descriptor', `Invalid file descriptor: ${ fd }`);
        }

        return fileInfo;
    }

    async readFile(path: string): Promise<Uint8Array> {
        await this.mount();

        try {
            return await this.withPathLock(path, async() => {
                const fd = await this._openInLock(path, false, false);

                try {
                    const { size } = await this.fstat(fd);
                    const buffer = new Uint8Array(size);

                    if (size > 0) {
                        await this.read(fd, buffer, 0, size, 0);
                    }

                    return transfer(buffer, [buffer.buffer]);
                }
                finally {
                    await this.close(fd);
                }
            });
        }
        catch (err) {
            if (err instanceof OPFSError) {
                throw err;
            }

            throw mapDomError(err, { path, isDirectory: false });
        }
    }

    async writeFile(
        path: string,
        data: Uint8Array | ArrayBuffer
    ): Promise<void> {
        await this.mount();

        const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);

        await this.withPathLock(path, async() => {
            const existed = await this.exists(path);
            const fd = await this._openInLock(path, true, true);

            try {
                await this.write(fd, buffer, 0, buffer.length, null, false);
                await this.fsync(fd);
            }
            finally {
                await this.close(fd);
            }

            await this.notifyChange({ path, type: existed ? WatchEventType.Changed : WatchEventType.Added, isDirectory: false });
        });
    }

    async appendFile(
        path: string,
        data: Uint8Array | ArrayBuffer
    ): Promise<void> {
        await this.mount();

        const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);

        await this.withPathLock(path, async() => {
            const fd = await this._openInLock(path, true, false);

            try {
                const { size } = await this.fstat(fd);

                await this.write(fd, buffer, 0, buffer.length, size, false);
                await this.fsync(fd);
            }
            finally {
                await this.close(fd);
            }

            await this.notifyChange({ path, type: WatchEventType.Changed, isDirectory: false });
        });
    }

    async writeStream(
        path: string,
        stream: ReadableStream<Uint8Array>,
        onProgress?: (bytesWritten: number) => unknown
    ): Promise<number> {
        await this.mount();

        return this.withPathLock(path, async() => {
            const existed = await this.exists(path);
            const fd = await this._openInLock(path, true, true);
            const reader = stream.getReader();
            let totalBytes = 0;

            try {
                while (true) {
                    const { done, value: chunk } = await reader.read();

                    if (done) {
                        break;
                    }

                    let offset = 0;

                    while (offset < chunk.byteLength) {
                        offset += await this.write(
                            fd,
                            chunk,
                            offset,
                            chunk.byteLength - offset,
                            null,
                            false
                        );
                    }

                    totalBytes += chunk.byteLength;
                    // Don't await — progress often crosses a worker boundary (Comlink),
                    // and awaiting each chunk serializes I/O behind UI round-trips.
                    void onProgress?.(totalBytes);
                }

                await this.fsync(fd);
            }
            catch (error) {
                await reader.cancel(error).catch(() => {});

                throw error;
            }
            finally {
                reader.releaseLock();
                await this.close(fd);
            }

            await this.notifyChange({
                path,
                type: existed ? WatchEventType.Changed : WatchEventType.Added,
                isDirectory: false,
            });

            return totalBytes;
        });
    }

    /**
     * Open a file descriptor.
     *
     * The descriptor holds the path lock (the one `readFile` / `writeFile` take) until
     * `close()`, so whole-file operations on the path wait for it. Descriptors opened
     * without `truncate` share that lock with each other, including while another access
     * waits for it. A `truncate` open waits for the other descriptors to close and keeps
     * new ones out until it closes, so no reader sees a write half done.
     */
    async open(path: string, options?: FileOpenOptions): Promise<number> {
        await this.mount();

        const { create = false, exclusive = false, truncate = false } = options || {};

        // Normalize path to prevent path-related issues
        const normalizedPath = normalizePath(resolvePath(path));
        const lock = this._lockDescriptorPath(normalizedPath, !truncate);

        try {
            await lock.acquired;

            return (create && exclusive)
                ? await this._createExclusive(normalizedPath, truncate, lock)
                : await this._openFile(normalizedPath, create, truncate, lock);
        }
        catch (error) {
            this._unlockDescriptorPath(normalizedPath, lock);

            throw this._mapOpenError(error, normalizedPath);
        }
    }

    /**
     * Create a file that must not exist yet, after the exclusive creates queued before it
     * @private
     */
    private async _createExclusive(path: string, truncate: boolean, lock: DescriptorLock): Promise<number> {
        const created = lock.exclusiveCreates.then(async() => {
            if (await this.exists(path)) {
                throw new AlreadyExistsError(path);
            }

            return this._openFile(path, true, truncate, lock);
        });

        lock.exclusiveCreates = created.catch(() => {});

        return created;
    }

    /**
     * Open a descriptor for an operation that already holds the path lock
     * (Web Locks aren't reentrant, so going through `open()` would deadlock)
     * @private
     */
    private async _openInLock(path: string, create: boolean, truncate: boolean): Promise<number> {
        const normalizedPath = normalizePath(resolvePath(path));

        try {
            return await this._openFile(normalizedPath, create, truncate);
        }
        catch (error) {
            throw this._mapOpenError(error, normalizedPath);
        }
    }

    /** @private */
    private _mapOpenError(error: any, path: string): OPFSError {
        if (error instanceof OPFSError) {
            return error;
        }

        // TypeMismatchError here means the path actually refers to a directory
        // so we map it as a directory-type error (EISDIR) for better Node.js parity.
        return mapDomError(error, { path, isDirectory: error?.name === 'TypeMismatchError' });
    }

    /**
     * Take a reference to the path lock for a new descriptor. A shareable request joins
     * the shareable lock already held or requested for the path; otherwise a new lock
     * is requested, which waits for the current holders.
     * @private
     */
    private _lockDescriptorPath(path: string, shareable: boolean): DescriptorLock {
        const shared = shareable ? this.sharedLocks.get(path) : undefined;

        if (shared) {
            shared.refCount++;

            return shared;
        }

        let release!: () => void;
        const released = new Promise<void>(resolve => (release = resolve));
        const acquired = new Promise<void>((resolve, reject) => {
            this.withPathLock(path, async() => {
                resolve();
                await released;
            }).catch(reject);
        });
        const lock: DescriptorLock = { refCount: 1, acquired, release, exclusiveCreates: Promise.resolve() };

        if (shareable) {
            this.sharedLocks.set(path, lock);
        }

        return lock;
    }

    /**
     * Drop a descriptor's reference to the path lock; the last one lets the lock go
     * @private
     */
    private _unlockDescriptorPath(path: string, lock: DescriptorLock): void {
        if (--lock.refCount > 0) {
            return;
        }

        if (this.sharedLocks.get(path) === lock) {
            this.sharedLocks.delete(path);
        }

        lock.release();
    }

    /**
     * Open a descriptor; the caller takes care of the path lock.
     *
     * Multiple FDs for the same path share one sync access handle (OPFS limit),
     * with independent per-FD positions — similar to Node.js.
     * @param lock - The path lock the descriptor holds until `close()` (public `open()` only)
     * @private
     */
    private async _openFile(path: string, create: boolean, truncate: boolean, lock?: DescriptorLock): Promise<number> {
        const shared = await this._acquireSharedHandle(path, create);

        if (truncate) {
            shared.syncHandle.truncate(0);
            shared.syncHandle.flush();
        }

        const fd = this.nextFd++;

        this.openFiles.set(fd, { path, handle: shared, position: 0, lock });

        return fd;
    }

    /**
     * Take a reference to the shared sync handle for a path, creating it if needed.
     *
     * Concurrent callers wait for the same creation instead of each calling
     * `createSyncAccessHandle()` (the second call would fail). Descriptors that join
     * one path lock open concurrently, and without Web Locks nothing serializes opens,
     * so the path lock alone doesn't prevent this. After waiting, the loop looks the
     * handle up again, since `dispose()` may have dropped it in the meantime.
     * @private
     */
    private async _acquireSharedHandle(path: string, create: boolean): Promise<SharedHandle> {
        while (true) {
            const shared = this.openHandles.get(path);

            if (shared) {
                shared.refCount++;

                return shared;
            }

            let pending = this.pendingHandles.get(path);

            if (!pending) {
                const promise = this._createSharedHandle(path, create).finally(() => {
                    this.pendingHandles.delete(path);
                });

                pending = { promise, create };
                this.pendingHandles.set(path, pending);
            }

            try {
                await pending.promise;
            }
            catch (error) {
                // A creation started without `create` may fail only because the file
                // doesn't exist yet — retry with our own flag instead of sharing that error
                if (!create || pending.create) {
                    throw error;
                }
            }
        }
    }

    /**
     * Create the sync handle for a path and register it with no references yet
     * @private
     */
    private async _createSharedHandle(path: string, create: boolean): Promise<void> {
        const fileHandle = await this.getFileHandle(path, create);

        // Verify that we got a file handle, not a directory
        try {
            await fileHandle.getFile();
        }
        catch (error: any) {
            throw mapDomError(error, { path, isDirectory: true });
        }

        const syncHandle = await createSyncHandleSafe(fileHandle, path);

        this.openHandles.set(path, { syncHandle, refCount: 0 });
    }

    async close(fd: number): Promise<void> {
        const fileInfo = this._getFileDescriptor(fd);

        this.openFiles.delete(fd);

        const { handle } = fileInfo;

        // Only close the underlying sync handle when the last FD for this path is gone
        if (--handle.refCount <= 0) {
            safeCloseSyncHandle(fd, handle.syncHandle, fileInfo.path);

            // A dispose() mid-open can leave a newer handle registered for the path — keep it
            if (this.openHandles.get(fileInfo.path) === handle) {
                this.openHandles.delete(fileInfo.path);
            }
        }

        // After the handle is closed, so the next lock holder can create its own
        if (fileInfo.lock) {
            this._unlockDescriptorPath(fileInfo.path, fileInfo.lock);
        }
    }

    async read(
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null | undefined
    ): Promise<{ bytesRead: number; buffer: Uint8Array }> {
        const fileInfo = this._getFileDescriptor(fd);

        // Validate arguments
        validateReadWriteArgs(buffer.length, offset, length, position);

        try {
            const readPosition = position ?? fileInfo.position;

            // Get file size and calculate read length
            const fileSize = fileInfo.handle.syncHandle.getSize();
            const { isEOF, actualLength } = calculateReadLength(readPosition, length, fileSize);

            if (isEOF) {
                return transfer({ bytesRead: 0, buffer }, [buffer.buffer]); // End of file
            }

            // Create a subarray view for the read operation
            const targetBuffer = buffer.subarray(offset, offset + actualLength);

            // Perform efficient positioned read
            const bytesRead = fileInfo.handle.syncHandle.read(targetBuffer, { at: readPosition });

            // Update position if position was not explicitly specified (null means use current position)
            if (position == null) {
                fileInfo.position = readPosition + bytesRead;
            }

            return transfer({ bytesRead, buffer }, [buffer.buffer]);
        }
        catch (error) {
            throw createFDError('read', fd, fileInfo.path, error);
        }
    }

    async write(
        fd: number,
        buffer: Uint8Array,
        offset: number = 0,
        length?: number,
        position?: number | null | undefined,
        emitEvent: boolean = true
    ): Promise<number> {
        const fileInfo = this._getFileDescriptor(fd);

        // Calculate actual length to write
        const actualLength = length ?? (buffer.length - offset);

        // Validate arguments using helper
        validateReadWriteArgs(buffer.length, offset, actualLength, position);

        try {
            // Determine write position: use specified position, or current position if null/undefined
            const writePosition = position ?? fileInfo.position;

            // Create a subarray view for the write operation
            const sourceBuffer = buffer.subarray(offset, offset + actualLength);

            // Perform efficient positioned write
            const bytesWritten = fileInfo.handle.syncHandle.write(sourceBuffer, { at: writePosition });

            // Update position if position was null or undefined (i.e., use current position)
            // Also update position when writing at current position (position === fileInfo.position)
            if (position == null || position === fileInfo.position) {
                fileInfo.position = writePosition + bytesWritten;
            }

            if (emitEvent) {
                await this.notifyChange({ path: fileInfo.path, type: WatchEventType.Changed, isDirectory: false });
            }

            return bytesWritten;
        }
        catch (error) {
            throw createFDError('write', fd, fileInfo.path, error);
        }
    }

    async fstat(fd: number): Promise<FileStat> {
        const fileInfo = this._getFileDescriptor(fd);

        // Simply reuse existing stat() method with the file path
        return this.stat(fileInfo.path);
    }

    async ftruncate(fd: number, size: number = 0): Promise<void> {
        const fileInfo = this._getFileDescriptor(fd);

        // Validate size parameter
        if (size < 0 || !Number.isInteger(size)) {
            throw new ValidationError('argument', 'Invalid size');
        }

        try {
            fileInfo.handle.syncHandle.truncate(size);
            fileInfo.handle.syncHandle.flush();

            // Adjust position if it's beyond the new file size
            if (fileInfo.position > size) {
                fileInfo.position = size;
            }

            await this.notifyChange({ path: fileInfo.path, type: WatchEventType.Changed, isDirectory: false });
        }
        catch (error) {
            throw createFDError('truncate', fd, fileInfo.path, error);
        }
    }

    async fsync(fd: number): Promise<void> {
        const fileInfo = this._getFileDescriptor(fd);

        try {
            fileInfo.handle.syncHandle.flush();
        }
        catch (error) {
            throw createFDError('sync', fd, fileInfo.path, error);
        }
    }

    override dispose(): void {
        // Close each shared sync handle once (not per FD)
        for (const [path, shared] of this.openHandles) {
            safeCloseSyncHandle(-1, shared.syncHandle, path);
        }

        // Let go of the path locks still held by open descriptors (release is idempotent)
        for (const { lock } of this.openFiles.values()) {
            lock?.release();
        }

        this.openHandles.clear();
        this.sharedLocks.clear();
        this.openFiles.clear();
        this.nextFd = 1;

        // pendingHandles is left alone: in-flight creations can't be cancelled and remove
        // their own entry when done. Clearing it would let a later open start a second
        // createSyncAccessHandle() for the same path and fail with EBUSY.

        super.dispose();
    }
}
