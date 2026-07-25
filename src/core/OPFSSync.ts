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
    validateReadWriteArgs,
    withLock
} from '../utils/helpers';

import type { FileOpenOptions, FileStat, OPFSOptions } from '../types';

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
    private openHandles = new Map<string, {
        fileHandle: FileSystemFileHandle;
        syncHandle: FileSystemSyncAccessHandle;
        refCount: number;
    }>();

    /** Map of open file descriptors to their metadata */
    private openFiles = new Map<number, {
        path: string;
        fileHandle: FileSystemFileHandle;
        syncHandle: FileSystemSyncAccessHandle;
        position: number;
    }>();

    /** Next available file descriptor number */
    private nextFd = 1;

    constructor(options?: OPFSOptions) {
        super(options);
    }

    /**
     * Get file info by descriptor with validation
     * @private
     */
    private _getFileDescriptor(fd: number): { path: string; fileHandle: FileSystemFileHandle; syncHandle: FileSystemSyncAccessHandle; position: number } {
        const fileInfo = this.openFiles.get(fd);

        if (!fileInfo) {
            throw new ValidationError('descriptor', `Invalid file descriptor: ${ fd }`);
        }

        return fileInfo;
    }

    async readFile(path: string): Promise<Uint8Array> {
        await this.mount();

        try {
            return await withLock(path, async() => {
                const fd = await this.open(path);

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

        await withLock(path, async() => {
            const existed = await this.exists(path);
            const fd = await this.open(path, { create: true, truncate: true });

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

        await withLock(path, async() => {
            const fd = await this.open(path, { create: true });

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

        return withLock(path, async() => {
            const existed = await this.exists(path);
            const fd = await this.open(path, { create: true, truncate: true });
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
                    await onProgress?.(totalBytes);
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

    async open(path: string, options?: FileOpenOptions): Promise<number> {
        await this.mount();

        const { create = false, exclusive = false, truncate = false } = options || {};

        // Normalize path to prevent path-related issues
        const normalizedPath = normalizePath(resolvePath(path));

        try {
            // Use lock for atomic operations when creating files
            if (create && exclusive) {
                return await withLock(normalizedPath, async() => {
                    const exists = await this.exists(normalizedPath);

                    if (exists) {
                        throw new AlreadyExistsError(normalizedPath);
                    }

                    return this._openFile(normalizedPath, create, truncate);
                });
            }

            return await this._openFile(normalizedPath, create, truncate);
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }

            // TypeMismatchError here means the path actually refers to a directory
            // so we map it as a directory-type error (EISDIR) for better Node.js parity.
            const isTypeMismatchDirectory = error && error.name === 'TypeMismatchError';

            throw mapDomError(error, {
                path: normalizedPath,
                isDirectory: !!isTypeMismatchDirectory,
            });
        }
    }

    /**
     * Internal method to open a file (without locking)
     *
     * Multiple FDs for the same path share one sync access handle (OPFS limit),
     * with independent per-FD positions — similar to Node.js.
     * @private
     */
    private async _openFile(path: string, create: boolean, truncate: boolean): Promise<number> {
        let shared = this.openHandles.get(path);

        if (!shared) {
            const fileHandle = await this.getFileHandle(path, create);

            // Verify that we got a file handle, not a directory
            try {
                await fileHandle.getFile();
            }
            catch (error: any) {
                throw mapDomError(error, { path, isDirectory: true });
            }

            const syncHandle = await createSyncHandleSafe(fileHandle, path);

            shared = { fileHandle, syncHandle, refCount: 0 };
            this.openHandles.set(path, shared);
        }

        shared.refCount++;

        if (truncate) {
            shared.syncHandle.truncate(0);
            shared.syncHandle.flush();
        }

        const fd = this.nextFd++;

        this.openFiles.set(fd, {
            path,
            fileHandle: shared.fileHandle,
            syncHandle: shared.syncHandle,
            position: 0,
        });

        return fd;
    }

    async close(fd: number): Promise<void> {
        const fileInfo = this._getFileDescriptor(fd);

        this.openFiles.delete(fd);

        const shared = this.openHandles.get(fileInfo.path);

        if (!shared) {
            return;
        }

        shared.refCount--;

        // Only close the underlying sync handle when the last FD for this path is gone
        if (shared.refCount <= 0) {
            safeCloseSyncHandle(fd, shared.syncHandle, fileInfo.path);
            this.openHandles.delete(fileInfo.path);
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
            const fileSize = fileInfo.syncHandle.getSize();
            const { isEOF, actualLength } = calculateReadLength(readPosition, length, fileSize);

            if (isEOF) {
                return transfer({ bytesRead: 0, buffer }, [buffer.buffer]); // End of file
            }

            // Create a subarray view for the read operation
            const targetBuffer = buffer.subarray(offset, offset + actualLength);

            // Perform efficient positioned read
            const bytesRead = fileInfo.syncHandle.read(targetBuffer, { at: readPosition });

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
            const bytesWritten = fileInfo.syncHandle.write(sourceBuffer, { at: writePosition });

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
            fileInfo.syncHandle.truncate(size);
            fileInfo.syncHandle.flush();

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
            fileInfo.syncHandle.flush();
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

        this.openHandles.clear();
        this.openFiles.clear();
        this.nextFd = 1;

        super.dispose();
    }
}
