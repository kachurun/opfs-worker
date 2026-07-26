import { proxy, transfer } from 'comlink';

import { decodeBuffer, encodeString, isBinaryFileExtension } from '../utils/encoder';
import { OperationNotSupportedError } from '../utils/errors';
import { matchMinimatch, normalizeMinimatch } from '../utils/helpers';
import { expandImportFilesSource, isFileSystemFileHandle } from '../utils/importSources';

import type {
    BinaryEncoding,
    DirentData,
    Encoding,
    FileOpenOptions,
    FileStat,
    ImportFilesProgress,
    ImportFilesResult,
    ImportFilesSource,
    ImportStreamProgress,
    OPFSApi,
    OPFSOptions,
    PathLike,
    RenameOptions,
    StringEncoding,
    WatchEvent,
    WatchListener,
    WatchOptions,
    WatchSnapshot
} from '../types';

/**
 * Utility function to convert a PathLike to a string path
 * If it's a URI, extracts the pathname; otherwise returns the string as-is
 */
function normalizePath(path: PathLike): string {
    if (path instanceof URL) {
        return path.pathname;
    }

    return path;
}

function toWatchSnapshot(path: string, options?: WatchOptions): WatchSnapshot {
    return {
        pattern: normalizeMinimatch(path, options?.recursive ?? true),
        include: Array.isArray(options?.include) ? options.include : [options?.include ?? '**'],
        exclude: Array.isArray(options?.exclude) ? options.exclude : [options?.exclude ?? ''],
    };
}

function matchesWatch(path: string, snapshot: WatchSnapshot): boolean {
    return (
        matchMinimatch(path, snapshot.pattern)
        && snapshot.include.some(include => include && matchMinimatch(path, include))
        && !snapshot.exclude.some(exclude => exclude && matchMinimatch(path, exclude))
    );
}

let createIndexWarned = false;

function warnCreateIndexDeprecated(): void {
    if (createIndexWarned) {
        return;
    }

    createIndexWarned = true;
    console.warn('[opfs-worker] createIndex() is deprecated; use importFiles() instead');
}

/** Backend the facade talks to: an fs implementation plus its cleanup. */
export interface OPFSBackend {
    fs: OPFSApi;
    /** Underlying Worker / SharedWorker when the backend lives off-thread */
    worker?: Worker | SharedWorker;
    dispose: () => void;
}

interface LocalWatch {
    snapshot: WatchSnapshot;
    listener?: WatchListener;
}

/**
 * Node-like facade with encoding helpers and string/binary auto-detection.
 *
 * Transport-agnostic: works over any {@link OPFSBackend} — a Comlink proxy to
 * a worker (`createOPFSDedicated`) or an in-process instance (`createOPFSAsync`).
 *
 * Escape hatch: {@link backend} is the raw bytes API; {@link worker} is the
 * browser Worker / SharedWorker when one was created (undefined for async).
 */
export class OPFSFacade {
    #fs: OPFSApi;
    #dispose: () => void;
    /** Raw backend (`OPFSApi`) — bytes in / bytes out, no encoding helpers */
    readonly backend: OPFSApi;
    /** Dedicated Worker or SharedWorker, if this facade was created with one */
    readonly worker: Worker | SharedWorker | undefined;
    promises: OPFSFacade = this;

    #channelName: string | null = 'opfs-worker';
    #namespace = '';
    #watches = new Map<string, LocalWatch>();
    #channel: BroadcastChannel | null = null;

    constructor(backend: OPFSBackend, options?: OPFSOptions) {
        this.#fs = backend.fs;
        this.backend = backend.fs;
        this.worker = backend.worker;
        this.#dispose = backend.dispose;
        this.#applyLocalOptions(options);
    }

    #applyLocalOptions(options?: OPFSOptions): void {
        if (!options) {
            return;
        }

        // Mirror BaseOPFS.setOptions so event.namespace filtering stays in sync
        if (options.namespace) {
            this.#namespace = options.namespace;
        }

        if (options.root != null && !this.#namespace) {
            this.#namespace = `opfs-worker:${ normalizePath(options.root) }`;
        }

        if (options.broadcastChannel != null) {
            const bc = options.broadcastChannel;

            this.#channelName = bc == null ? null : typeof bc === 'string' ? bc : bc.name;
        }
    }

    #onMessage = (event: MessageEvent<WatchEvent>): void => {
        const data = event.data;

        if (!data?.path || !data?.type || data.namespace !== this.#namespace) {
            return;
        }

        for (const { snapshot, listener } of this.#watches.values()) {
            if (listener && matchesWatch(data.path, snapshot)) {
                listener(data);
            }
        }
    };

    #bindChannel(): void {
        if (this.#channel || !this.#channelName) {
            return;
        }

        this.#channel = new BroadcastChannel(this.#channelName);
        this.#channel.addEventListener('message', this.#onMessage);
    }

    #unbindChannel(): void {
        this.#channel?.removeEventListener('message', this.#onMessage);
        this.#channel?.close();
        this.#channel = null;
    }

    /**
     * Start watching a file or directory for changes.
     *
     * Node-style: `watch(path[, options][, listener])`. Pass a `listener` to get
     * events directly (BroadcastChannel is handled for you, including other tabs).
     * Without a listener, only stores local filters (useful with `unwatch`); prefer
     * passing a listener for real subscriptions.
     */
    watch(path: PathLike, listener: WatchListener): () => void;
    watch(path: PathLike, options?: WatchOptions, listener?: WatchListener): () => void;
    watch(
        path: PathLike,
        optionsOrListener?: WatchOptions | WatchListener,
        listener?: WatchListener
    ): () => void {
        if (this.#channelName == null) {
            throw new OperationNotSupportedError(
                'Watching requires options.broadcastChannel (pass a channel name, or omit the option to use the default).'
            );
        }

        const options = typeof optionsOrListener === 'function' ? undefined : optionsOrListener;
        const cb = typeof optionsOrListener === 'function' ? optionsOrListener : listener;
        const normalizedPath = normalizePath(path);
        const snapshot = toWatchSnapshot(normalizedPath, options);

        this.#watches.set(normalizedPath, { snapshot, listener: cb });

        if (cb) {
            this.#bindChannel();
        }
        else if (![...this.#watches.values()].some(w => w.listener)) {
            this.#unbindChannel();
        }

        return () => {
            if (this.#watches.get(normalizedPath)?.snapshot !== snapshot) {
                return;
            }

            this.unwatch(normalizedPath);
        };
    }

    /**
     * Stop watching a previously watched path
     */
    unwatch(path: PathLike) {
        const normalizedPath = normalizePath(path);

        this.#watches.delete(normalizedPath);

        if (![...this.#watches.values()].some(w => w.listener)) {
            this.#unbindChannel();
        }
    }

    /**
     * Update configuration options
     */
    async setOptions(options: OPFSOptions) {
        const prevName = this.#channelName;

        this.#applyLocalOptions(options);

        if (this.#channel && this.#channelName !== prevName) {
            this.#unbindChannel();

            if ([...this.#watches.values()].some(w => w.listener)) {
                this.#bindChannel();
            }
        }

        return this.#fs.setOptions(options);
    }

    /**
     * Get a complete index of all files and directories in the file system
     */
    async index(): Promise<Map<string, FileStat>> {
        return this.#fs.index();
    }

    /**
     * Read a file from the file system
     */
    // Overload for explicit string encoding - returns string
    async readFile(path: PathLike, encoding: StringEncoding): Promise<string>;
    // Overload for explicit binary encoding - returns Uint8Array
    async readFile(path: PathLike, encoding: BinaryEncoding): Promise<Uint8Array>;
    // Overload for options object with string encoding - returns string
    async readFile(path: PathLike, options: { encoding: StringEncoding }): Promise<string>;
    // Overload for options object with binary encoding - returns Uint8Array
    async readFile(path: PathLike, options: { encoding: BinaryEncoding }): Promise<Uint8Array>;
    // Overload for no encoding (auto-detected) - returns string | Uint8Array based on file extension
    async readFile(path: PathLike): Promise<string | Uint8Array>;
    // Implementation
    async readFile(
        path: PathLike,
        optionsOrEncoding?: Encoding | { encoding?: Encoding }
    ): Promise<string | Uint8Array> {
        const normalizedPath = normalizePath(path);

        // Handle both options object and direct encoding parameter for backward compatibility
        let encoding: Encoding | undefined;

        if (typeof optionsOrEncoding === 'string') {
            encoding = optionsOrEncoding;
        }
        else if (optionsOrEncoding && typeof optionsOrEncoding === 'object') {
            encoding = optionsOrEncoding.encoding;
        }

        // Same-path reads are serialized by the worker's exclusive path lock
        const buffer = await this.#fs.readFile(normalizedPath);

        // If no encoding specified, auto-detect based on file extension
        if (!encoding) {
            encoding = isBinaryFileExtension(normalizedPath) ? 'binary' : 'utf-8';
        }

        return (encoding === 'binary') ? buffer : decodeBuffer(buffer, encoding);
    }

    /**
     * Normalize writable data into a Uint8Array.
     *
     * Accepts strings (encoded via `encoding`, auto-detected from the file
     * extension when omitted), raw binary (`Uint8Array` / `ArrayBuffer`), and
     * `Blob`/`File` sources (read via `arrayBuffer()`).
     */
    async #toBuffer(
        path: string,
        data: string | Uint8Array | ArrayBuffer | Blob,
        encoding?: Encoding
    ): Promise<Uint8Array> {
        if (data instanceof Blob) {
            return new Uint8Array(await data.arrayBuffer());
        }

        // If no encoding specified, auto-detect based on file extension
        if (!encoding) {
            encoding = (typeof data !== 'string' || isBinaryFileExtension(path)) ? 'binary' : 'utf-8';
        }

        if (typeof data === 'string') {
            return encodeString(data, encoding);
        }

        return data instanceof Uint8Array ? data : new Uint8Array(data);
    }

    /**
     * Write data to a file
     */
    async writeFile(
        path: PathLike,
        data: string | Uint8Array | ArrayBuffer | Blob,
        options?: { encoding?: Encoding } | Encoding
    ): Promise<void> {
        const normalizedPath = normalizePath(path);

        let encoding: Encoding | undefined;

        if (typeof options === 'string') {
            encoding = options;
        }
        else if (options && typeof options === 'object') {
            encoding = options.encoding;
        }

        const buffer = await this.#toBuffer(normalizedPath, data, encoding);

        return this.#fs.writeFile(normalizedPath, buffer);
    }

    /**
     * Append data to a file
     */
    async appendFile(
        path: PathLike,
        data: string | Uint8Array | ArrayBuffer | Blob,
        encoding?: Encoding
    ): Promise<void> {
        const normalizedPath = normalizePath(path);

        const buffer = await this.#toBuffer(normalizedPath, data, encoding);

        return this.#fs.appendFile(normalizedPath, buffer);
    }

    /**
     * Create or overwrite a file from a byte stream without buffering the
     * complete source in memory.
     *
     * Accepts a `ReadableStream`, `Blob` / `File`, or a `FileSystemFileHandle`
     * (from `showOpenFilePicker` — we call `getFile()` for you).
     *
     * Returns the total number of bytes written.
     */
    async importStream(
        path: PathLike,
        source: ReadableStream<Uint8Array> | Blob | FileSystemFileHandle,
        options?: { onProgress?: (progress: ImportStreamProgress) => void }
    ): Promise<number> {
        const normalizedPath = normalizePath(path);
        const resolved = isFileSystemFileHandle(source) ? await source.getFile() : source;
        const bytesTotal = resolved instanceof Blob ? resolved.size : undefined;
        const stream = resolved instanceof Blob ? resolved.stream() : resolved;
        const transferredStream = transfer(stream, [stream]) as unknown as ReadableStream<Uint8Array>;
        const onProgress = options?.onProgress
            ? proxy((bytesWritten: number) =>
                options.onProgress!({ path: normalizedPath, bytesWritten, bytesTotal }))
            : undefined;

        return this.#fs.writeStream(normalizedPath, transferredStream, onProgress);
    }

    /**
     * Create a directory
     */
    async mkdir(path: PathLike, mode?: number | { recursive?: boolean }): Promise<void> {
        const normalizedPath = normalizePath(path);

        let options: { recursive?: boolean } | undefined;

        // OPFS doesn't support file modes, so we ignore the mode parameter
        if (typeof mode === 'number') {
            options = { recursive: false };
        }
        else {
            options = mode;
        }

        return this.#fs.mkdir(normalizedPath, options);
    }

    /**
     * Get file or directory statistics
     */
    async stat(path: PathLike): Promise<FileStat> {
        const normalizedPath = normalizePath(path);

        return this.#fs.stat(normalizedPath);
    }

    /**
     * Read a directory's contents
     */
    async readDir(path: PathLike): Promise<DirentData[]> {
        const normalizedPath = normalizePath(path);

        return this.#fs.readDir(normalizedPath);
    }

    /**
     * Check if a file or directory exists
     */
    async exists(path: PathLike): Promise<boolean> {
        const normalizedPath = normalizePath(path);

        return this.#fs.exists(normalizedPath);
    }

    /**
     * Clear all contents of a directory without removing the directory itself
     */
    async clear(path?: PathLike): Promise<void> {
        const normalizedPath = path ? normalizePath(path) : undefined;

        return this.#fs.clear(normalizedPath);
    }

    /**
     * Remove files and directories
     */
    async remove(path: PathLike, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
        const normalizedPath = normalizePath(path);

        return this.#fs.remove(normalizedPath, options);
    }

    /**
     * Alias for remove() for NodeJS like API compatibility
     */
    async unlink(path: PathLike): Promise<void> {
        return this.remove(path);
    }

    /**
     * Alias for remove() for NodeJS like API compatibility
     */
    async rm(path: PathLike, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
        return this.remove(path, options);
    }

    /**
     * Alias for remove() for NodeJS like API compatibility
     */
    async rmdir(path: PathLike): Promise<void> {
        return this.remove(path);
    }

    /**
     * Alias for readDir() for NodeJS like API compatibility
     */
    async readdir(path: PathLike, _options?: unknown): Promise<DirentData[]> {
        return this.readDir(path);
    }

    /**
     * Alias for stat() for NodeJS like API compatibility
     */
    async lstat(path: PathLike): Promise<FileStat> {
        return this.stat(path);
    }

    /**
     * Note: OPFS doesn't support file modes, so this is a no-op and exists only for compatibility with tools like isomorphic-git
     */
    async chmod(_path: PathLike, _mode: number): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Resolve a path to an absolute path
     */
    async realpath(path: PathLike): Promise<string> {
        const normalizedPath = normalizePath(path);

        return this.#fs.realpath(normalizedPath);
    }

    /**
     * Rename a file or directory
     */
    async rename(oldPath: PathLike, newPath: PathLike, options?: RenameOptions): Promise<void> {
        const normalizedOldPath = normalizePath(oldPath);
        const normalizedNewPath = normalizePath(newPath);

        return this.#fs.rename(normalizedOldPath, normalizedNewPath, options);
    }

    /**
     * Copy files and directories
     */
    async copy(source: PathLike, destination: PathLike, options?: { recursive?: boolean; overwrite?: boolean }): Promise<void> {
        const normalizedSource = normalizePath(source);
        const normalizedDestination = normalizePath(destination);

        return this.#fs.copy(normalizedSource, normalizedDestination, options);
    }

    /**
     * Open a file and return a file descriptor
     */
    async open(path: PathLike, options?: FileOpenOptions): Promise<number> {
        const normalizedPath = normalizePath(path);

        return this.#fs.open(normalizedPath, options);
    }

    /**
     * Close a file descriptor
     */
    async close(fd: number): Promise<void> {
        return this.#fs.close(fd);
    }

    /**
     * Read data from a file descriptor
     * 
     * This method requires special handling due to Comlink transfer requirements.
     * The buffer is transferred to the worker and back, so the original buffer
     * becomes unusable after the call.
     */
    async read(
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position?: number | null | undefined
    ): Promise<{ bytesRead: number; buffer: Uint8Array }> {
        const { bytesRead, buffer: transferred } = await this.#fs.read(
            fd,
            // Temp buffer to preserve the original buffer
            new Uint8Array(length),
            0,
            length,
            position
        );

        // Copy the data from the transferred buffer to the original buffer
        if (bytesRead > 0) {
            buffer.set(transferred.subarray(0, bytesRead), offset);
        }

        return { bytesRead, buffer };
    }

    /**
     * Write data to a file descriptor
     */
    async write(
        fd: number,
        buffer: Uint8Array,
        offset?: number,
        length?: number,
        position?: number | null | undefined,
        emitEvent?: boolean
    ): Promise<number> {
        return this.#fs.write(fd, buffer, offset, length, position, emitEvent);
    }

    /**
     * Get file status information by file descriptor
     */
    async fstat(fd: number): Promise<FileStat> {
        return this.#fs.fstat(fd);
    }

    /**
     * Truncate file to specified size
     */
    async ftruncate(fd: number, size?: number): Promise<void> {
        return this.#fs.ftruncate(fd, size);
    }

    /**
     * Synchronize file data to storage (fsync equivalent)
     */
    async fsync(fd: number): Promise<void> {
        return this.#fs.fsync(fd);
    }

    /**
     * Read a file as a lazy, disk-backed `Blob` without copying the data to memory.
     *
     * Ideal for `URL.createObjectURL()`: the browser streams `<video>` / `<audio>`
     * on demand instead of loading the whole file first.
     */
    async readBlob(path: PathLike): Promise<Blob> {
        return this.#fs.readBlob(normalizePath(path));
    }

    /**
     * Bulk-import files from `[path, data]` entries, a `FileSystemDirectoryHandle`,
     * or one / many `FileSystemFileHandle`s. Handles are resolved via `getFile()`
     * here (where permission was granted), then each entry is streamed so large
     * Blobs/Files are not fully buffered in memory.
     *
     * For a directory handle, pass `{ prefix }` to place files under a path
     * (default `/` → `/readme.txt`, `/src/a.ts`, …).
     */
    async importFiles(
        entries: ImportFilesSource,
        options?: { onProgress?: (progress: ImportFilesProgress) => void; prefix?: string }
    ): Promise<ImportFilesResult> {
        const list = await expandImportFilesSource(entries, options?.prefix ?? '/');

        const onProgress = options?.onProgress
            ? proxy((progress: ImportFilesProgress) => options.onProgress!(progress))
            : undefined;

        return this.#fs.importFiles(list, onProgress);
    }

    /**
     * @deprecated Use {@link importFiles} instead.
     */
    async createIndex(entries: ImportFilesSource): Promise<void> {
        warnCreateIndexDeprecated();
        await this.importFiles(entries);
    }

    /**
     * Read a file as text with automatic encoding detection
     */
    async readText(path: PathLike, encoding: Encoding = 'utf-8'): Promise<string> {
        const normalizedPath = normalizePath(path);
        const buffer = await this.#fs.readFile(normalizedPath);

        return decodeBuffer(buffer, encoding);
    }

    /**
     * Write text to a file with specified encoding
     */
    async writeText(path: PathLike, text: string, encoding: Encoding = 'utf-8'): Promise<void> {
        const normalizedPath = normalizePath(path);
        const buffer = encodeString(text, encoding);

        return this.#fs.writeFile(normalizedPath, buffer);
    }

    /**
     * Append text to a file with specified encoding
     */
    async appendText(path: PathLike, text: string, encoding: Encoding = 'utf-8'): Promise<void> {
        const normalizedPath = normalizePath(path);
        const buffer = encodeString(text, encoding);

        return this.#fs.appendFile(normalizedPath, buffer);
    }

    /**
     * Dispose of resources, detach the backend and clean up the file system instance
     */
    dispose() {
        this.#watches.clear();
        this.#unbindChannel();
        this.#dispose();
    }
}
