import { wrap } from 'comlink';

import { decodeBuffer, encodeString, isBinaryFileExtension } from './utils/encoder';
import WorkerCtor from './worker?worker&inline';

import type {
    DirentData,
    Encoding,
    FileOpenOptions,
    FileStat,
    OPFSOptions,
    PathLike,
    RemoteOPFSWorker,
    RenameOptions,
    WatchOptions
} from './types';

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

/**
 * Facade class that provides a clean interface for communicating with the OPFS worker
 * while hiding Comlink implementation details.
 */
export class OPFSFileSystem {
    #worker: RemoteOPFSWorker;

    constructor(options?: OPFSOptions) {
        const wrapped = wrap<RemoteOPFSWorker>(new WorkerCtor());

        this.#worker = wrapped;

        // Set up options if provided
        if (options) {
            // We can't pass a BroadcastChannel instance to the worker, so we need to convert it to a string first
            if (options.broadcastChannel && options.broadcastChannel instanceof BroadcastChannel) {
                options.broadcastChannel = options.broadcastChannel.name;
            }

            // Initialize options asynchronously
            void this.setOptions(options);
        }
    }

    /**
     * Update configuration options
     */
    async setOptions(options: OPFSOptions) {
        return this.#worker.setOptions(options);
    }

    /**
     * Get a complete index of all files and directories in the file system
     */
    async index(): Promise<Map<string, FileStat>> {
        return this.#worker.index();
    }

    /**
     * Read a file from the file system
     */
    async readFile(path: PathLike, encoding: 'binary'): Promise<Uint8Array>;
    async readFile(path: PathLike, encoding: Encoding): Promise<string>;
    async readFile(path: PathLike, encoding?: Encoding | 'binary'): Promise<string | Uint8Array>;
    async readFile(
        path: PathLike,
        encoding?: any
    ): Promise<string | Uint8Array> {
        const normalizedPath = normalizePath(path);
        // Get binary data from worker
        const buffer = await this.#worker.readFile(normalizedPath);

        // If no encoding specified, auto-detect based on file extension
        if (!encoding) {
            encoding = isBinaryFileExtension(normalizedPath) ? 'binary' : 'utf-8';
        }

        // Return binary data or decode to string
        return (encoding === 'binary') ? buffer : decodeBuffer(buffer, encoding);
    }

    /**
     * Write data to a file
     */
    async writeFile(
        path: PathLike,
        data: string | Uint8Array | ArrayBuffer,
        encoding?: Encoding
    ): Promise<void> {
        const normalizedPath = normalizePath(path);

        // If no encoding specified, auto-detect based on file extension
        if (!encoding) {
            encoding = (typeof data !== 'string' || isBinaryFileExtension(normalizedPath)) ? 'binary' : 'utf-8';
        }

        // Convert data to Uint8Array
        const buffer = typeof data === 'string'
            ? encodeString(data, encoding)
            : (data instanceof Uint8Array ? data : new Uint8Array(data));

        return this.#worker.writeFile(normalizedPath, buffer);
    }

    /**
     * Append data to a file
     */
    async appendFile(
        path: PathLike,
        data: string | Uint8Array | ArrayBuffer,
        encoding?: Encoding
    ): Promise<void> {
        const normalizedPath = normalizePath(path);

        // If no encoding specified, auto-detect based on file extension
        if (!encoding) {
            encoding = (typeof data !== 'string' || isBinaryFileExtension(normalizedPath)) ? 'binary' : 'utf-8';
        }

        // Convert data to Uint8Array
        const buffer = typeof data === 'string'
            ? encodeString(data, encoding)
            : (data instanceof Uint8Array ? data : new Uint8Array(data));

        return this.#worker.appendFile(normalizedPath, buffer);
    }

    /**
     * Create a directory
     */
    async mkdir(path: PathLike, options?: { recursive?: boolean }): Promise<void> {
        const normalizedPath = normalizePath(path);

        return this.#worker.mkdir(normalizedPath, options);
    }

    /**
     * Get file or directory statistics
     */
    async stat(path: PathLike): Promise<FileStat> {
        const normalizedPath = normalizePath(path);

        return this.#worker.stat(normalizedPath);
    }

    /**
     * Read a directory's contents
     */
    async readDir(path: PathLike): Promise<DirentData[]> {
        const normalizedPath = normalizePath(path);

        return this.#worker.readDir(normalizedPath);
    }

    /**
     * Check if a file or directory exists
     */
    async exists(path: PathLike): Promise<boolean> {
        const normalizedPath = normalizePath(path);

        return this.#worker.exists(normalizedPath);
    }

    /**
     * Clear all contents of a directory without removing the directory itself
     */
    async clear(path?: PathLike): Promise<void> {
        const normalizedPath = path ? normalizePath(path) : undefined;

        return this.#worker.clear(normalizedPath);
    }

    /**
     * Remove files and directories
     */
    async remove(path: PathLike, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
        const normalizedPath = normalizePath(path);

        return this.#worker.remove(normalizedPath, options);
    }

    /**
     * Resolve a path to an absolute path
     */
    async realpath(path: PathLike): Promise<string> {
        const normalizedPath = normalizePath(path);

        return this.#worker.realpath(normalizedPath);
    }

    /**
     * Rename a file or directory
     */
    async rename(oldPath: PathLike, newPath: PathLike, options?: RenameOptions): Promise<void> {
        const normalizedOldPath = normalizePath(oldPath);
        const normalizedNewPath = normalizePath(newPath);

        return this.#worker.rename(normalizedOldPath, normalizedNewPath, options);
    }

    /**
     * Copy files and directories
     */
    async copy(source: PathLike, destination: PathLike, options?: { recursive?: boolean; overwrite?: boolean }): Promise<void> {
        const normalizedSource = normalizePath(source);
        const normalizedDestination = normalizePath(destination);

        return this.#worker.copy(normalizedSource, normalizedDestination, options);
    }

    /**
     * Start watching a file or directory for changes
     */
    watch(path: PathLike, options?: WatchOptions): () => void {
        const normalizedPath = normalizePath(path);

        void this.#worker.watch(normalizedPath, options);

        return () => this.unwatch(normalizedPath);
    }

    /**
     * Stop watching a previously watched path
     */
    unwatch(path: PathLike) {
        const normalizedPath = normalizePath(path);

        void this.#worker.unwatch(normalizedPath);
    }

    /**
     * Open a file and return a file descriptor
     */
    async open(path: PathLike, options?: FileOpenOptions): Promise<number> {
        const normalizedPath = normalizePath(path);

        return this.#worker.open(normalizedPath, options);
    }

    /**
     * Close a file descriptor
     */
    async close(fd: number): Promise<void> {
        return this.#worker.close(fd);
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
        const { bytesRead, buffer: transferred } = await this.#worker.read(
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
        return this.#worker.write(fd, buffer, offset, length, position, emitEvent);
    }

    /**
     * Get file status information by file descriptor
     */
    async fstat(fd: number): Promise<FileStat> {
        return this.#worker.fstat(fd);
    }

    /**
     * Truncate file to specified size
     */
    async ftruncate(fd: number, size?: number): Promise<void> {
        return this.#worker.ftruncate(fd, size);
    }

    /**
     * Synchronize file data to storage (fsync equivalent)
     */
    async fsync(fd: number): Promise<void> {
        return this.#worker.fsync(fd);
    }

    /**
     * Dispose of resources and clean up the file system instance
     */
    dispose() {
        void this.#worker.dispose();
    }

    /**
     * Synchronize the file system with external data
     */
    async sync(entries: [PathLike, string | Uint8Array | Blob][], options?: { cleanBefore?: boolean }): Promise<void> {
        const normalizedEntries = entries.map(([path, data]) => [normalizePath(path), data] as [string, string | Uint8Array | Blob]);

        return this.#worker.sync(normalizedEntries, options);
    }

    /**
     * Read a file as text with automatic encoding detection
     */
    async readText(path: PathLike, encoding: Encoding = 'utf-8'): Promise<string> {
        const normalizedPath = normalizePath(path);
        const buffer = await this.#worker.readFile(normalizedPath);

        return decodeBuffer(buffer, encoding);
    }

    /**
     * Write text to a file with specified encoding
     */
    async writeText(path: PathLike, text: string, encoding: Encoding = 'utf-8'): Promise<void> {
        const normalizedPath = normalizePath(path);
        const buffer = encodeString(text, encoding);

        return this.#worker.writeFile(normalizedPath, buffer);
    }

    /**
     * Append text to a file with specified encoding
     */
    async appendText(path: PathLike, text: string, encoding: Encoding = 'utf-8'): Promise<void> {
        const normalizedPath = normalizePath(path);
        const buffer = encodeString(text, encoding);

        return this.#worker.appendFile(normalizedPath, buffer);
    }
}
