import { proxy, wrap } from 'comlink';

import { decodeBuffer, encodeString, isBinaryFileExtension } from './utils/encoder';
import WorkerCtor from './worker?worker&inline';

import type {
    BinaryEncoding,
    DirentData,
    Encoding,
    FileOpenOptions,
    FileStat,
    OPFSOptions,
    RemoteOPFSWorker,
    RenameOptions,
    SearchInWorkspaceOptions,
    SearchInWorkspaceResult,
    StringEncoding,
    WatchOptions
} from './types';

/**
 * Facade class that provides a clean interface for communicating with the OPFS worker
 * while hiding Comlink implementation details.
 */
export class OPFSFileSystem {
    #worker: RemoteOPFSWorker;
    promises: OPFSFileSystem = this;

    constructor(options?: OPFSOptions) {
        this.#worker = wrap<RemoteOPFSWorker>(new WorkerCtor());

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
     * Start watching a file or directory for changes
     */
    watch(path: string, options?: WatchOptions): () => void {
        void this.#worker.watch(path, options);

        return () => this.unwatch(path);
    }

    /**
     * Stop watching a previously watched path
     */
    unwatch(path: string) {
        void this.#worker.unwatch(path);
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
    // Overload for explicit string encoding - returns string
    async readFile(path: string, encoding: StringEncoding): Promise<string>;
    // Overload for explicit binary encoding - returns Uint8Array
    async readFile(path: string, encoding: BinaryEncoding): Promise<Uint8Array>;
    // Overload for options object with string encoding - returns string
    async readFile(path: string, options: { encoding: StringEncoding }): Promise<string>;
    // Overload for options object with binary encoding - returns Uint8Array
    async readFile(path: string, options: { encoding: BinaryEncoding }): Promise<Uint8Array>;
    // Overload for no encoding (auto-detected) - returns string | Uint8Array based on file extension
    async readFile(path: string): Promise<string | Uint8Array>;
    // Implementation
    async readFile(
        path: string,
        optionsOrEncoding?: Encoding | { encoding?: Encoding }
    ): Promise<string | Uint8Array> {
        // Handle both options object and direct encoding parameter for backward compatibility
        let encoding: Encoding | undefined;

        if (typeof optionsOrEncoding === 'string') {
            encoding = optionsOrEncoding;
        }
        else if (optionsOrEncoding && typeof optionsOrEncoding === 'object') {
            encoding = optionsOrEncoding.encoding;
        }

        // Get binary data from worker
        const buffer = await this.#worker.readFile(path);

        // If no encoding specified, auto-detect based on file extension
        if (!encoding) {
            encoding = isBinaryFileExtension(path) ? 'binary' : 'utf-8';
        }

        // Return binary data or decode to string
        return (encoding === 'binary') ? buffer : decodeBuffer(buffer, encoding);
    }

    /**
     * Write data to a file
     */
    async writeFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        options?: { encoding?: Encoding } | Encoding
    ): Promise<void> {
        let encoding: Encoding | undefined;

        if (typeof options === 'string') {
            encoding = options;
        }
        else if (options && typeof options === 'object') {
            encoding = options.encoding;
        }

        // If no encoding specified, auto-detect based on file extension
        if (!encoding) {
            encoding = (typeof data !== 'string' || isBinaryFileExtension(path)) ? 'binary' : 'utf-8';
        }

        // Convert data to Uint8Array
        const buffer = typeof data === 'string'
            ? encodeString(data, encoding)
            : (data instanceof Uint8Array ? data : new Uint8Array(data));

        return this.#worker.writeFile(path, buffer);
    }

    /**
     * Append data to a file
     */
    async appendFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        encoding?: Encoding
    ): Promise<void> {
        // If no encoding specified, auto-detect based on file extension
        if (!encoding) {
            encoding = (typeof data !== 'string' || isBinaryFileExtension(path)) ? 'binary' : 'utf-8';
        }

        // Convert data to Uint8Array
        const buffer = typeof data === 'string'
            ? encodeString(data, encoding)
            : (data instanceof Uint8Array ? data : new Uint8Array(data));

        return this.#worker.appendFile(path, buffer);
    }

    /**
     * Create a directory
     */
    async mkdir(path: string, mode?: number | { recursive?: boolean }): Promise<void> {
        let options: { recursive?: boolean } | undefined;

        // OPFS doesn't support file modes, so we ignore the mode parameter
        if (typeof mode === 'number') {
            options = { recursive: false };
        }
        else {
            options = mode;
        }

        return this.#worker.mkdir(path, options);
    }

    /**
     * Get file or directory statistics
     */
    async stat(path: string): Promise<FileStat> {
        return this.#worker.stat(path);
    }

    /**
     * Read a directory's contents
     */
    async readDir(path: string): Promise<DirentData[]> {
        return this.#worker.readDir(path);
    }

    /**
     * Check if a file or directory exists
     */
    async exists(path: string): Promise<boolean> {
        return this.#worker.exists(path);
    }

    /**
     * Clear all contents of a directory without removing the directory itself
     */
    async clear(path?: string): Promise<void> {
        return this.#worker.clear(path);
    }

    /**
     * Remove files and directories
     */
    async remove(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
        return this.#worker.remove(path, options);
    }

    /**
     * Alias for remove() for NodeJS like API compatibility
     */
    async unlink(path: string): Promise<void> {
        return this.remove(path);
    }

    /**
     * Alias for remove() for NodeJS like API compatibility
     */
    async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
        return this.remove(path, options);
    }

    /**
     * Alias for remove() for NodeJS like API compatibility
     */
    async rmdir(path: string): Promise<void> {
        return this.remove(path);
    }

    /**
     * Alias for readDir() for NodeJS like API compatibility
     */
    async readdir(path: string, _options?: unknown): Promise<DirentData[]> {
        return this.readDir(path);
    }

    /**
     * Alias for stat() for NodeJS like API compatibility
     */
    async lstat(path: string): Promise<FileStat> {
        return this.stat(path);
    }

    /**
     * Note: OPFS doesn't support file modes, so this is a no-op and exists only for compatibility with tools like isomorphic-git
     */
    async chmod(_path: string, _mode: number): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Resolve a path to an absolute path
     */
    async realpath(path: string): Promise<string> {
        return this.#worker.realpath(path);
    }

    /**
     * Rename a file or directory
     */
    async rename(oldPath: string, newPath: string, options?: RenameOptions): Promise<void> {
        return this.#worker.rename(oldPath, newPath, options);
    }

    /**
     * Copy files and directories
     */
    async copy(source: string, destination: string, options?: { recursive?: boolean; overwrite?: boolean }): Promise<void> {
        return this.#worker.copy(source, destination, options);
    }

    /**
     * Open a file and return a file descriptor
     */
    async open(path: string, options?: FileOpenOptions): Promise<number> {
        return this.#worker.open(path, options);
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
    async createIndex(entries: [string, string | Uint8Array | Blob][]): Promise<void> {
        return this.#worker.createIndex(entries);
    }

    /**
     * Read a file as text with automatic encoding detection
     */
    async readText(path: string, encoding: Encoding = 'utf-8'): Promise<string> {
        const buffer = await this.#worker.readFile(path);

        return decodeBuffer(buffer, encoding);
    }

    /**
     * Write text to a file with specified encoding
     */
    async writeText(path: string, text: string, encoding: Encoding = 'utf-8'): Promise<void> {
        const buffer = encodeString(text, encoding);

        return this.#worker.writeFile(path, buffer);
    }

    /**
     * Append text to a file with specified encoding
     */
    async appendText(path: string, text: string, encoding: Encoding = 'utf-8'): Promise<void> {
        const buffer = encodeString(text, encoding);

        return this.#worker.appendFile(path, buffer);
    }

    /**
     * Search files with streaming results. Returns a disposer to cancel listener wiring.
     */
    search(
        query: string,
        options: SearchInWorkspaceOptions | undefined,
        callbacks: {
            onResult: (result: SearchInWorkspaceResult) => void;
            onDone: (id: string) => void;
            onError?: (id: string, error: string) => void;
        },
        abortController?: AbortController
    ): () => void {
        const shouldAbort = proxy(() => Boolean(abortController?.signal.aborted));

        const proxiedCallbacks = {
            onResult: proxy(callbacks.onResult),
            onDone: proxy(callbacks.onDone),
            onError: callbacks.onError ? proxy(callbacks.onError) : undefined,
        } as const;

        void this.#worker.search(
            query,
            options,
            proxiedCallbacks as any,
            shouldAbort
        );

        const dispose = () => {
            abortController?.abort();
        };

        return dispose;
    }
}
