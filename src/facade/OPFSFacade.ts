import { proxy, transfer } from 'comlink';

import { decodeBuffer, encodeString, isBinaryFileExtension } from '../utils/encoder';

import type {
    BinaryEncoding,
    DirentData,
    Encoding,
    FileOpenOptions,
    FileStat,
    OPFSApi,
    OPFSOptions,
    PathLike,
    RenameOptions,
    StringEncoding,
    WatchOptions
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

/** Backend the facade talks to: an fs implementation plus its cleanup. */
export interface OPFSBackend {
    fs: OPFSApi;
    /** Underlying Worker / SharedWorker when the backend lives off-thread */
    worker?: Worker | SharedWorker;
    dispose: () => void;
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

    constructor(backend: OPFSBackend) {
        this.#fs = backend.fs;
        this.backend = backend.fs;
        this.worker = backend.worker;
        this.#dispose = backend.dispose;
    }

    /**
     * Start watching a file or directory for changes
     */
    watch(path: PathLike, options?: WatchOptions): () => void {
        const normalizedPath = normalizePath(path);

        void this.#fs.watch(normalizedPath, options);

        return () => this.unwatch(normalizedPath);
    }

    /**
     * Stop watching a previously watched path
     */
    unwatch(path: PathLike) {
        const normalizedPath = normalizePath(path);

        void this.#fs.unwatch(normalizedPath);
    }

    /**
     * Update configuration options
     */
    async setOptions(options: OPFSOptions) {
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
     * Returns the total number of bytes written.
     */
    async importStream(
        path: PathLike,
        source: ReadableStream<Uint8Array> | Blob,
        options?: { onProgress?: (bytesWritten: number) => void }
    ): Promise<number> {
        const normalizedPath = normalizePath(path);
        const stream = source instanceof Blob ? source.stream() : source;
        const transferredStream = transfer(stream, [stream]) as unknown as ReadableStream<Uint8Array>;
        const onProgress = options?.onProgress
            ? proxy((bytesWritten: number) => options.onProgress!(bytesWritten))
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
     * Synchronize the file system with external data
     */
    async createIndex(entries: [PathLike, string | Uint8Array | Blob][]): Promise<void> {
        const normalizedEntries = entries.map(([path, data]) => [normalizePath(path), data] as [string, string | Uint8Array | Blob]);

        return this.#fs.createIndex(normalizedEntries);
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
        this.#dispose();
    }
}
