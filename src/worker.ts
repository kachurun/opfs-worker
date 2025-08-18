import { expose } from 'comlink';


import { decodeBuffer } from './utils/encoder';
import {
    FileNotFoundError,
    OPFSError,
    PathError
} from './utils/errors';

import {
    basename,
    calculateFileHash,
    checkOPFSSupport,
    convertBlobToUint8Array,
    dirname,
    isBinaryFileExtension,
    joinPath,
    matchMinimatch,
    normalizeMinimatch,
    normalizePath,
    readFileData,
    removeEntry,
    resolvePath,
    splitPath,
    writeFileData
} from './utils/helpers';

import type { DirentData, Encoding, FileStat, OPFSOptions, RenameOptions, WatchEvent, WatchOptions, WatchSnapshot } from './types';
import type { BufferEncoding } from 'typescript';

/**
 * OPFS (Origin Private File System) File System implementation
 * 
 * This class provides a high-level interface for working with the browser's
 * Origin Private File System API, offering file and directory operations
 * similar to Node.js fs module.
 * 
 * @example
 * ```typescript
 * const fs = new OPFSFileSystem();
 * await fs.init('/my-app');
 * await fs.writeFile('/data/config.json', JSON.stringify({ theme: 'dark' }));
 * const config = await fs.readFile('/data/config.json');
 * ```
 */
export class OPFSWorker {
    /** Root directory handle for the file system */
    private root!: FileSystemDirectoryHandle;

    /** Map of watched paths and options */
    private watchers = new Map<string, WatchSnapshot>();

    /** Promise to prevent concurrent mount operations */
    private mountingPromise: Promise<boolean> | null = null;

    /** BroadcastChannel instance for sending events */
    private broadcastChannel: BroadcastChannel | null = null;

    /** Configuration options */
    private options: Required<OPFSOptions> = {
        root: '/',
        namespace: '',
        maxFileSize: 50 * 1024 * 1024,
        hashAlgorithm: null,
        broadcastChannel: 'opfs-worker',
    };


    /**
     * Notify about internal changes to the file system
     * 
     * This method is called by internal operations to notify clients about
     * changes, even when no specific paths are being watched.
     * 
     * @param path - The path that was changed
     * @param type - The type of change (create, change, delete)
     */
    private async notifyChange(event: Omit<WatchEvent, 'timestamp' | 'hash' | 'namespace'>): Promise<void> {
        // This instance not configured to send events
        if (!this.options.broadcastChannel) {
            return;
        }

        const path = event.path;

        const match = [...this.watchers.values()].some((snapshot) => {
            return (
                matchMinimatch(path, snapshot.pattern)
                && snapshot.include.some(include => include && matchMinimatch(path, include))
                && !snapshot.exclude.some(exclude => exclude && matchMinimatch(path, exclude))
            );
        });

        if (!match) {
            return;
        }

        let hash: string | undefined;

        if (this.options.hashAlgorithm) {
            try {
                const stat = await this.stat(path);

                hash = stat.hash;
            }
            catch {}
        }

        // Send event via BroadcastChannel
        try {
            if (!this.broadcastChannel) {
                this.broadcastChannel = new BroadcastChannel(this.options.broadcastChannel as string);
            }

            const watchEvent: WatchEvent = {
                namespace: this.options.namespace,
                timestamp: new Date().toISOString(),
                ...event,
                ...(hash && { hash }),
            };

            this.broadcastChannel.postMessage(watchEvent);
        }
        catch (error) {
            console.warn('Failed to send event via BroadcastChannel:', error);
        }
    }

    /**
     * Creates a new OPFSFileSystem instance
     * 
     * @param options - Optional configuration options
     * @param options.root - Root path for the file system (default: '/')
     * @param options.watchInterval - Polling interval in milliseconds for file watching
     * @param options.hashAlgorithm - Hash algorithm for file hashing
     * @param options.maxFileSize - Maximum file size for hashing in bytes (default: 50MB)
     * @throws {OPFSError} If OPFS is not supported in the current browser
     */
    constructor(options?: OPFSOptions) {
        checkOPFSSupport();

        if (options) {
            void this.setOptions(options);
        }
    }

    /**
     * Initialize the file system within a given directory
     * 
     * This method sets up the root directory for all subsequent operations.
     * If no root is specified, it will use the OPFS root directory.
     * 
     * @param root - The root path for the file system (default: '/')
     * @returns Promise that resolves to true if initialization was successful
     * @throws {OPFSError} If initialization fails
     * 
     * @example
     * ```typescript
     * const fs = new OPFSFileSystem();
     * 
     * // Use OPFS root (default)
     * await fs.mount();
     * 
     * // Use custom directory
     * await fs.mount('/my-app');
     * ```
     */
    private async mount(): Promise<boolean> {
        const root = this.options.root;

        // If already mounting, wait for previous operation to complete first
        if (this.mountingPromise) {
            await this.mountingPromise;
        }

        // eslint-disable-next-line no-async-promise-executor
        this.mountingPromise = new Promise<boolean>(async(resolve, reject) => {
            try {
                const rootDir = await navigator.storage.getDirectory();

                this.root = (root === '/') ? rootDir : await this.getDirectoryHandle(root, true, rootDir);

                resolve(true);
            }
            catch (error) {
                reject(new OPFSError('Failed to initialize OPFS', 'INIT_FAILED', root, error));
            }
            finally {
                this.mountingPromise = null;
            }
        });

        return this.mountingPromise;
    }


    /**
     * Update configuration options
     * 
     * @param options - Configuration options to update
     * @param options.root - Root path for the file system
     * @param options.watchInterval - Polling interval in milliseconds for file watching
     * @param options.hashAlgorithm - Hash algorithm for file hashing
     * @param options.maxFileSize - Maximum file size for hashing in bytes
     * @param options.broadcastChannel - Custom name for the broadcast channel
     */
    async setOptions(options: OPFSOptions): Promise<void> {
        if (options.hashAlgorithm !== undefined) {
            this.options.hashAlgorithm = options.hashAlgorithm;
        }

        if (options.maxFileSize !== undefined) {
            this.options.maxFileSize = options.maxFileSize;
        }

        if (options.broadcastChannel !== undefined) {
            // Close existing channel if name changed
            if (this.broadcastChannel && this.options.broadcastChannel !== options.broadcastChannel) {
                this.broadcastChannel.close();
                this.broadcastChannel = null;
            }

            this.options.broadcastChannel = options.broadcastChannel;
        }

        if (options.namespace) {
            this.options.namespace = options.namespace;
        }

        if (options.root !== undefined) {
            this.options.root = normalizePath(options.root);

            if (!this.options.namespace) {
                this.options.namespace = `opfs-worker:${ this.options.root }`;
            }

            await this.mount();
        }
    }

    /**
     * Get a directory handle from a path
     * 
     * Navigates through the directory structure to find or create a directory
     * at the specified path.
     * 
     * @param path - The path to the directory (string or array of segments)
     * @param create - Whether to create the directory if it doesn't exist (default: false)
     * @param from - The directory to start from (default: root directory)
     * @returns Promise that resolves to the directory handle
     * @throws {OPFSError} If the directory cannot be accessed or created
     * 
     * @example
     * ```typescript
     * const docsDir = await fs.getDirectoryHandle('/users/john/documents', true);
     * const docsDir2 = await fs.getDirectoryHandle(['users', 'john', 'documents'], true);
     * ```
     */
    private async getDirectoryHandle(path: string | string[], create: boolean = false, from: FileSystemDirectoryHandle | null = this.root): Promise<FileSystemDirectoryHandle> {
        const segments = Array.isArray(path) ? path : splitPath(path);
        let current = from;

        for (const segment of segments) {
            current = await current!.getDirectoryHandle(segment, { create });
        }

        return current!;
    }

    /**
     * Get a file handle from a path
     * 
     * Navigates to the parent directory and retrieves or creates a file handle
     * for the specified file path.
     * 
     * @param path - The path to the file (string or array of segments)
     * @param create - Whether to create the file if it doesn't exist (default: false)
     * @param _from - The directory to start from (default: root directory)
     * @returns Promise that resolves to the file handle
     * @throws {PathError} If the path is empty
     * @throws {OPFSError} If the file cannot be accessed or created
     * 
     * @example
     * ```typescript
     * const fileHandle = await fs.getFileHandle('/config/settings.json', true);
     * const fileHandle2 = await fs.getFileHandle(['config', 'settings.json'], true);
     * ```
     */
    private async getFileHandle(path: string | string[], create = false, _from: FileSystemDirectoryHandle | null = this.root): Promise<FileSystemFileHandle> {
        const segments = splitPath(path);

        if (segments.length === 0) {
            throw new PathError('Path must not be empty', Array.isArray(path) ? path.join('/') : path);
        }

        const fileName = segments.pop()!;
        const dir = await this.getDirectoryHandle(segments, create, _from);

        return dir.getFileHandle(fileName, { create });
    }

    /**
     * Get a complete index of all files and directories in the file system
     * 
     * This method recursively traverses the entire file system and returns
     * a Map containing FileStat objects for every file and directory.
     * 
     * @returns Promise that resolves to a Map of paths to FileStat objects
     * @throws {OPFSError} If the file system is not mounted
     * 
     * @example
     * ```typescript
     * const index = await fs.index();
     * const fileStats = index.get('/data/config.json');
     * if (fileStats) {
     *   console.log(`File size: ${fileStats.size} bytes`);
     *   if (fileStats.hash) console.log(`Hash: ${fileStats.hash}`);
     * }
     * ```
     */
    async index(): Promise<Map<string, FileStat>> {
        const result = new Map<string, FileStat>();

        const walk = async(dirPath: string) => {
            const items = await this.readDir(dirPath);

            for (const item of items) {
                const fullPath = `${ dirPath === '/' ? '' : dirPath }/${ item.name }`;

                try {
                    const stat = await this.stat(fullPath);

                    result.set(fullPath, stat);

                    if (stat.isDirectory) {
                        await walk(fullPath);
                    }
                }
                catch (err) {
                    console.warn(`Skipping broken entry: ${ fullPath }`, err);
                }
            }
        };

        result.set('/', {
            kind: 'directory',
            size: 0,
            mtime: new Date(0).toISOString(),
            ctime: new Date(0).toISOString(),
            isFile: false,
            isDirectory: true,
        });

        await walk('/');

        return result;
    }

    /**
     * Read a file from the file system
     * 
     * Reads the contents of a file and returns it as a string or binary data
     * depending on the specified encoding.
     * 
     * @param path - The path to the file to read
     * @param encoding - The encoding to use for reading the file
     * @returns Promise that resolves to the file contents
     * @throws {FileNotFoundError} If the file does not exist
     * @throws {OPFSError} If reading the file fails
     * 
     * @example
     * ```typescript
     * // Read as text
     * const content = await fs.readFile('/config/settings.json');
     * 
     * // Read as binary
     * const binaryData = await fs.readFile('/images/logo.png', 'binary');
     * 
     * // Read with specific encoding
     * const utf8Content = await fs.readFile('/data/utf8.txt', 'utf-8');
     * ```
     */
    async readFile(path: string, encoding: 'binary'): Promise<Uint8Array>;
    async readFile(path: string, encoding: Encoding): Promise<string>;
    async readFile(path: string, encoding: Encoding | 'binary'): Promise<string | Uint8Array>;
    async readFile(
        path: string,
        encoding?: any
    ): Promise<string | Uint8Array> {
        await this.mount();

        if (!encoding) {
            encoding = isBinaryFileExtension(path) ? 'binary' : 'utf-8';
        }

        try {
            const fileHandle = await this.getFileHandle(path, false, this.root);
            const buffer = await readFileData(fileHandle, path);

            return (encoding === 'binary') ? buffer : decodeBuffer(buffer, encoding);
        }
        catch (err) {
            throw new FileNotFoundError(path, err);
        }
    }

    /**
     * Write data to a file
     * 
     * Creates or overwrites a file with the specified data. If the file already
     * exists, it will be truncated before writing.
     * 
     * @param path - The path to the file to write
     * @param data - The data to write to the file (string, Uint8Array, or ArrayBuffer)
     * @param encoding - The encoding to use when writing string data (default: 'utf-8')
     * @returns Promise that resolves when the write operation is complete
     * @throws {OPFSError} If writing the file fails
     * 
     * @example
     * ```typescript
     * // Write text data
     * await fs.writeFile('/config/settings.json', JSON.stringify({ theme: 'dark' }));
     * 
     * // Write binary data
     * const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
     * await fs.writeFile('/data/binary.dat', binaryData);
     * 
     * // Write with specific encoding
     * await fs.writeFile('/data/utf16.txt', 'Hello World', 'utf-16le');
     * ```
     */
    async writeFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        encoding?: BufferEncoding
    ): Promise<void> {
        await this.mount();

        const fileExists = await this.exists(path);
        const fileHandle = await this.getFileHandle(path, true);

        if (!encoding) {
            encoding = (typeof data !== 'string' || isBinaryFileExtension(path)) ? 'binary' : 'utf-8';
        }

        await writeFileData(fileHandle, data, encoding, path);

        // Only notify changes if the file didn't exist before or if content actually changed
        if (!fileExists) {
            await this.notifyChange({ path, type: 'added', isDirectory: false });
        }
        else {
            await this.notifyChange({ path, type: 'changed', isDirectory: false });
        }
    }

    /**
     * Append data to a file
     * 
     * Adds data to the end of an existing file. If the file doesn't exist,
     * it will be created.
     * 
     * @param path - The path to the file to append to
     * @param data - The data to append to the file (string, Uint8Array, or ArrayBuffer)
     * @param encoding - The encoding to use when appending string data (default: 'utf-8')
     * @returns Promise that resolves when the append operation is complete
     * @throws {OPFSError} If appending to the file fails
     * 
     * @example
     * ```typescript
     * // Append text to a log file
     * await fs.appendFile('/logs/app.log', `[${new Date().toISOString()}] User logged in\n`);
     * 
     * // Append binary data
     * const additionalData = new Uint8Array([6, 7, 8]);
     * await fs.appendFile('/data/binary.dat', additionalData);
     * ```
     */
    async appendFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        encoding?: BufferEncoding
    ): Promise<void> {
        await this.mount();

        const fileHandle = await this.getFileHandle(path, true);

        if (!encoding) {
            encoding = (typeof data !== 'string' || isBinaryFileExtension(path)) ? 'binary' : 'utf-8';
        }

        await writeFileData(fileHandle, data, encoding, path, { append: true });
        await this.notifyChange({ path, type: 'changed', isDirectory: false });
    }

    /**
     * Create a directory
     * 
     * Creates a new directory at the specified path. If the recursive option
     * is enabled, parent directories will be created as needed.
     * 
     * @param path - The path where the directory should be created
     * @param options - Options for directory creation
     * @param options.recursive - Whether to create parent directories if they don't exist (default: false)
     * @returns Promise that resolves when the directory is created
     * @throws {OPFSError} If the directory cannot be created
     * 
     * @example
     * ```typescript
     * // Create a single directory
     * await fs.mkdir('/users/john');
     * 
     * // Create nested directories
     * await fs.mkdir('/users/john/documents/projects', { recursive: true });
     * ```
     */
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
        await this.mount();

        const recursive = options?.recursive ?? false;
        const segments = splitPath(path);

        let current: FileSystemDirectoryHandle | null = this.root;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];

            try {
                current = await current.getDirectoryHandle(segment!, { create: recursive || i === segments.length - 1 });
            }
            catch (err: any) {
                if (err.name === 'NotFoundError') {
                    throw new OPFSError(
                        `Parent directory does not exist: ${ joinPath(segments.slice(0, i + 1)) }`,
                        'ENOENT',
                        undefined,
                        err
                    );
                }

                if (err.name === 'TypeMismatchError') {
                    throw new OPFSError(`Path segment is not a directory: ${ segment }`, 'ENOTDIR', undefined, err);
                }

                throw new OPFSError('Failed to create directory', 'MKDIR_FAILED', undefined, err);
            }
        }

        await this.notifyChange({ path, type: 'added', isDirectory: true });
    }

    /**
     * Get file or directory statistics
     * 
     * Returns detailed information about a file or directory, including
     * size, modification time, and optionally a hash of the file content.
     * 
     * @param path - The path to the file or directory
     * @returns Promise that resolves to FileStat object
     * @throws {OPFSError} If the path does not exist or cannot be accessed
     * 
     * @example
     * ```typescript
     * const stats = await fs.stat('/data/config.json');
     * console.log(`File size: ${stats.size} bytes`);
     * console.log(`Last modified: ${stats.mtime}`);
     * 
     * // If hashing is enabled, hash will be included
     * if (stats.hash) {
     *   console.log(`Hash: ${stats.hash}`);
     * }
     * ```
     */
    async stat(path: string): Promise<FileStat> {
        await this.mount();

        // Special handling for root directory
        if (path === '/') {
            return {
                kind: 'directory',
                size: 0,
                mtime: new Date(0).toISOString(),
                ctime: new Date(0).toISOString(),
                isFile: false,
                isDirectory: true,
            };
        }

        const name = basename(path);
        const parentDir = await this.getDirectoryHandle(dirname(path), false);
        const includeHash = this.options.hashAlgorithm !== null;

        try {
            const fileHandle = await parentDir.getFileHandle(name, { create: false });
            const file = await fileHandle.getFile();

            const baseStat: FileStat = {
                kind: 'file',
                size: file.size,
                mtime: new Date(file.lastModified).toISOString(),
                ctime: new Date(file.lastModified).toISOString(),
                isFile: true,
                isDirectory: false,
            };

            if (includeHash && this.options.hashAlgorithm) {
                try {
                    const hash = await calculateFileHash(file, this.options.hashAlgorithm, this.options.maxFileSize);

                    baseStat.hash = hash;
                }
                catch (error) {
                    console.warn(`Failed to calculate hash for ${ path }:`, error);
                }
            }

            return baseStat;
        }
        catch (e: any) {
            if (e.name !== 'TypeMismatchError' && e.name !== 'NotFoundError') {
                throw new OPFSError('Failed to stat (file)', 'STAT_FAILED', undefined, e);
            }
        }

        try {
            await parentDir.getDirectoryHandle(name, { create: false });

            return {
                kind: 'directory',
                size: 0,
                mtime: new Date(0).toISOString(),
                ctime: new Date(0).toISOString(),
                isFile: false,
                isDirectory: true,
            };
        }
        catch (e: any) {
            if (e.name === 'NotFoundError') {
                throw new OPFSError(`No such file or directory: ${ path }`, 'ENOENT', undefined, e);
            }

            throw new OPFSError('Failed to stat (directory)', 'STAT_FAILED', undefined, e);
        }
    }

    /**
     * Read a directory's contents
     * 
     * Lists all files and subdirectories within the specified directory.
     * 
     * @param path - The path to the directory to read
     * @returns Promise that resolves to an array of detailed file/directory information
     * @throws {OPFSError} If the directory does not exist or cannot be accessed
     * 
     * @example
     * ```typescript
     * // Get detailed information about files and directories
     * const detailed = await fs.readDir('/users/john/documents');
     * detailed.forEach(item => {
     *   console.log(`${item.name} - ${item.isFile ? 'file' : 'directory'}`);
     * });
     * ```
     */
    async readDir(path: string): Promise<DirentData[]> {
        await this.mount();

        const dir = await this.getDirectoryHandle(path, false);

        const results: DirentData[] = [];

        for await (const [name, handle] of (dir as any).entries()) {
            const isFile = handle.kind === 'file';

            results.push({
                name,
                kind: handle.kind,
                isFile,
                isDirectory: !isFile,
            });
        }

        return results;
    }

    /**
     * Check if a file or directory exists
     * 
     * Verifies if a file or directory exists at the specified path.
     * 
     * @param path - The path to check
     * @returns Promise that resolves to true if the file or directory exists, false otherwise  
     * 
     * @example
     * ```typescript
     * const exists = await fs.exists('/config/settings.json');
     * console.log(`File exists: ${exists}`);
     * ```
     */
    async exists(path: string): Promise<boolean> {
        await this.mount();

        if (path === '/') {
            return true;
        }

        const name = basename(path);
        let dir: FileSystemDirectoryHandle | null = null;

        try {
            dir = await this.getDirectoryHandle(dirname(path), false);
        }
        catch (e: any) {
            dir = null;

            if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') {
                throw e;
            }
        }

        if (!dir || !name) {
            return false;
        }

        try {
            await dir.getFileHandle(name, { create: false });

            return true;
        }
        catch (err: any) {
            if (err.name !== 'NotFoundError' && err.name !== 'TypeMismatchError') {
                throw err;
            }

            try {
                await dir.getDirectoryHandle(name, { create: false });

                return true;
            }
            catch (err: any) {
                if (err.name !== 'NotFoundError' && err.name !== 'TypeMismatchError') {
                    throw err;
                }

                return false;
            }
        }
    }

    /**
     * Clear all contents of a directory without removing the directory itself
     * 
     * Removes all files and subdirectories within the specified directory,
     * but keeps the directory itself.
     * 
     * @param path - The path to the directory to clear (default: '/')
     * @returns Promise that resolves when all contents are removed
     * @throws {OPFSError} If the operation fails
     * 
     * @example
     * ```typescript
     * // Clear root directory contents
     * await fs.clear('/');
     * 
     * // Clear specific directory contents
     * await fs.clear('/data');
     * ```
     */
    async clear(path: string = '/'): Promise<void> {
        await this.mount();

        try {
            const items = await this.readDir(path);

            for (const item of items) {
                const itemPath = `${ path === '/' ? '' : path }/${ item.name }`;

                await this.remove(itemPath, { recursive: true });
            }

            await this.notifyChange({ path, type: 'changed', isDirectory: true });
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to clear directory: ${ path }`, 'CLEAR_FAILED', undefined, error);
        }
    }

    /**
     * Remove files and directories
     * 
     * Removes files and directories. Similar to Node.js fs.rm().
     * 
     * @param path - The path to remove
     * @param options - Options for removal
     * @param options.recursive - Whether to remove directories and their contents recursively (default: false)
     * @param options.force - Whether to ignore errors if the path doesn't exist (default: false)
     * @returns Promise that resolves when the removal is complete
     * @throws {OPFSError} If the removal fails
     * 
     * @example
     * ```typescript
     * // Remove a file
     * await fs.rm('/path/to/file.txt');
     * 
     * // Remove a directory and all its contents
     * await fs.rm('/path/to/directory', { recursive: true });
     * 
     * // Remove with force (ignore if doesn't exist)
     * await fs.rm('/maybe/exists', { force: true });
     * ```
     */
    async remove(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
        await this.mount();

        // Special handling for root directory
        if (path === '/') {
            throw new OPFSError('Cannot remove root directory', 'EROOT');
        }

        const { recursive = false, force = false } = options || {};

        const parent = await this.getDirectoryHandle(dirname(path), false);

        await removeEntry(parent, path, { recursive, force });

        await this.notifyChange({ path, type: 'removed', isDirectory: false });
    }

    /**
     * Resolve a path to an absolute path
     * 
     * Resolves relative paths and normalizes path segments (like '..' and '.').
     * Similar to Node.js fs.realpath() but without symlink resolution since OPFS doesn't support symlinks.
     * 
     * @param path - The path to resolve
     * @returns Promise that resolves to the absolute normalized path
     * @throws {FileNotFoundError} If the path does not exist
     * @throws {OPFSError} If path resolution fails
     * 
     * @example
     * ```typescript
     * // Resolve relative path
     * const absolute = await fs.realpath('./config/../data/file.txt');
     * console.log(absolute); // '/data/file.txt'
     * ```
     */
    async realpath(path: string): Promise<string> {
        await this.mount();

        try {
            const normalizedPath = resolvePath(path);
            const exists = await this.exists(normalizedPath);

            if (!exists) {
                throw new FileNotFoundError(normalizedPath);
            }

            return normalizedPath;
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to resolve path: ${ path }`, 'REALPATH_FAILED', undefined, error);
        }
    }

    /**
     * Rename a file or directory
     * 
     * Changes the name of a file or directory. If the target path already exists,
     * it will be replaced only if overwrite option is enabled.
     * 
     * @param oldPath - The current path of the file or directory
     * @param newPath - The new path for the file or directory
     * @param options - Options for renaming
     * @param options.overwrite - Whether to overwrite existing files (default: false)
     * @returns Promise that resolves when the rename operation is complete
     * @throws {OPFSError} If the rename operation fails
     * 
     * @example
     * ```typescript
     * // Basic rename (fails if target exists)
     * await fs.rename('/old/path/file.txt', '/new/path/renamed.txt');
     * 
     * // Rename with overwrite
     * await fs.rename('/old/path/file.txt', '/new/path/renamed.txt', { overwrite: true });
     * ```
     */
    async rename(oldPath: string, newPath: string, options?: RenameOptions): Promise<void> {
        await this.mount();

        try {
            const overwrite = options?.overwrite ?? false;

            const sourceExists = await this.exists(oldPath);

            if (!sourceExists) {
                throw new FileNotFoundError(oldPath);
            }

            const destExists = await this.exists(newPath);

            if (destExists && !overwrite) {
                throw new OPFSError(`Destination already exists: ${ newPath }`, 'EEXIST', undefined);
            }

            await this.copy(oldPath, newPath, { recursive: true, overwrite });
            await this.remove(oldPath, { recursive: true });

            // Notify about the rename operation
            await this.notifyChange({ path: oldPath, type: 'removed', isDirectory: false });
            await this.notifyChange({ path: newPath, type: 'added', isDirectory: false });
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to rename from ${ oldPath } to ${ newPath }`, 'RENAME_FAILED', undefined, error);
        }
    }

    /**
     * Copy files and directories
     * 
     * Copies files and directories. Similar to Node.js fs.cp().
     * 
     * @param source - The source path to copy from
     * @param destination - The destination path to copy to
     * @param options - Options for copying
     * @param options.recursive - Whether to copy directories recursively (default: false)
     * @param options.overwrite - Whether to overwrite existing files (default: true)
     * @returns Promise that resolves when the copy operation is complete
     * @throws {OPFSError} If the copy operation fails
     * 
     * @example
     * ```typescript
     * // Copy a file
     * await fs.copy('/source/file.txt', '/dest/file.txt');
     * 
     * // Copy a directory and all its contents
     * await fs.copy('/source/dir', '/dest/dir', { recursive: true });
     * 
     * // Copy without overwriting existing files
     * await fs.copy('/source', '/dest', { recursive: true, overwrite: false });
     * ```
     */
    async copy(source: string, destination: string, options?: { recursive?: boolean; overwrite?: boolean }): Promise<void> {
        await this.mount();

        try {
            const recursive = options?.recursive ?? false;
            const overwrite = options?.overwrite ?? true;

            const sourceExists = await this.exists(source);

            if (!sourceExists) {
                throw new OPFSError(`Source does not exist: ${ source }`, 'ENOENT', undefined);
            }

            const destExists = await this.exists(destination);

            if (destExists && !overwrite) {
                throw new OPFSError(`Destination already exists: ${ destination }`, 'EEXIST', undefined);
            }

            const sourceStats = await this.stat(source);

            if (sourceStats.isFile) {
                const content = await this.readFile(source, 'binary');

                await this.writeFile(destination, content);
            }
            else {
                if (!recursive) {
                    throw new OPFSError(`Cannot copy directory without recursive option: ${ source }`, 'EISDIR', undefined);
                }

                await this.mkdir(destination, { recursive: true });

                const items = await this.readDir(source);

                for (const item of items) {
                    const sourceItemPath = `${ source }/${ item.name }`;
                    const destItemPath = `${ destination }/${ item.name }`;

                    await this.copy(sourceItemPath, destItemPath, { recursive: true, overwrite });
                }
            }
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to copy from ${ source } to ${ destination }`, 'CP_FAILED', undefined, error);
        }
    }

    /**
     * Start watching a file or directory for changes
     * 
     * @param path - The path to watch (minimatch syntax allowed)
     * @param options - Watch options
     * @param options.recursive - Whether to watch recursively (default: true)
     * @param options.exclude - Glob pattern(s) to exclude (minimatch).
     * @returns Promise that resolves when watching starts
     * 
     * @example
     * ```typescript
     * // Watch entire directory tree recursively (default)
     * await fs.watch('/data');
     * 
     * // Watch only immediate children (shallow)
     * await fs.watch('/data', { recursive: false });
     * 
     * // Watch a single file
     * await fs.watch('/config.json', { recursive: false });
     * 
     * // Watch all json files but not in dist directory
     * await fs.watch('/**\/*.json', { recursive: false, exclude: ['dist/**'] });
     *
     * ```
     */
    async watch(path: string, options?: WatchOptions): Promise<void> {
        if (!this.options.broadcastChannel) {
            throw new OPFSError('This instance is not configured to send events. Please specify options.broadcastChannel to enable watching.', 'ENOENT');
        }

        const snapshot: WatchSnapshot = {
            pattern: normalizeMinimatch(path, options?.recursive ?? true),
            include: Array.isArray(options?.include) ? options.include : [options?.include ?? '**'],
            exclude: Array.isArray(options?.exclude) ? options.exclude : [options?.exclude ?? ''],
        };

        this.watchers.set(path, snapshot);
    }

    /**
     * Stop watching a previously watched path
     */
    unwatch(path: string): void {
        this.watchers.delete(path);
    }

    /**
     * Dispose of resources and clean up the file system instance
     * 
     * This method should be called when the file system instance is no longer needed
     * to properly clean up resources like the broadcast channel and watch timers.
     */
    dispose(): void {
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = null;
        }

        this.watchers.clear();
    }

    /**
     * Synchronize the file system with external data
     * 
     * Syncs the file system with an array of entries containing paths and data.
     * This is useful for importing data from external sources or syncing with remote data.
     * 
     * @param entries - Array of [path, data] tuples to sync
     * @param options - Options for synchronization
     * @param options.cleanBefore - Whether to clear the file system before syncing (default: false)
     * @returns Promise that resolves when synchronization is complete
     * @throws {OPFSError} If the synchronization fails
     * 
     * @example
     * ```typescript
     * // Sync with external data
     * const entries: [string, string | Uint8Array | Blob][] = [
     *   ['/config.json', JSON.stringify({ theme: 'dark' })],
     *   ['/data/binary.dat', new Uint8Array([1, 2, 3, 4])],
     *   ['/upload.txt', new Blob(['file content'], { type: 'text/plain' })]
     * ];
     * 
     * // Sync without clearing existing files
     * await fs.sync(entries);
     * 
     * // Clean file system and then sync
     * await fs.sync(entries, { cleanBefore: true });
     * ```
     */
    async sync(entries: [string, string | Uint8Array | Blob][], options?: { cleanBefore?: boolean }): Promise<void> {
        await this.mount();

        try {
            const cleanBefore = options?.cleanBefore ?? false;

            if (cleanBefore) {
                await this.clear('/');
            }

            for (const [path, data] of entries) {
                const normalizedPath = normalizePath(path);

                let fileData: string | Uint8Array;

                if (data instanceof Blob) {
                    fileData = await convertBlobToUint8Array(data);
                }
                else {
                    fileData = data;
                }

                await this.writeFile(normalizedPath, fileData);
            }
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError('Failed to sync file system', 'SYNC_FAILED', undefined, error);
        }
    }
}

// Only expose the worker when running in a Web Worker environment
if (typeof globalThis !== 'undefined' && globalThis.constructor.name === 'DedicatedWorkerGlobalScope') {
    expose(new OPFSWorker());
}
