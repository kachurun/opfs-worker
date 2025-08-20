import { wrap } from 'comlink';

import WorkerCtor from './worker?worker&inline';

import type {
    DirentData,
    Encoding,
    FileOpenOptions,
    FileStat,
    OPFSOptions,
    OPFSWorker,
    RemoteOPFSWorker,
    RenameOptions,
    WatchOptions
} from './types';

/**
 * Facade class that provides a clean interface for communicating with the OPFS worker
 * while hiding Comlink implementation details.
 */
export class OPFSFileSystem {
    #worker: RemoteOPFSWorker;

    constructor(options?: OPFSOptions) {
        const wrapped = wrap<OPFSWorker>(new WorkerCtor());

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
    async readFile(path: string, encoding: 'binary'): Promise<Uint8Array>;
    async readFile(path: string, encoding: Encoding): Promise<string>;
    async readFile(path: string, encoding?: Encoding | 'binary'): Promise<string | Uint8Array>;
    async readFile(
        path: string,
        encoding?: any
    ): Promise<string | Uint8Array> {
        return this.#worker.readFile(path, encoding);
    }

    /**
     * Write data to a file
     */
    async writeFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        encoding?: Encoding
    ): Promise<void> {
        return this.#worker.writeFile(path, data, encoding);
    }

    /**
     * Append data to a file
     */
    async appendFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        encoding?: Encoding
    ): Promise<void> {
        return this.#worker.appendFile(path, data, encoding);
    }

    /**
     * Create a directory
     */
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
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
    async sync(entries: [string, string | Uint8Array | Blob][], options?: { cleanBefore?: boolean }): Promise<void> {
        return this.#worker.sync(entries, options);
    }
}
