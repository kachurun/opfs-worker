import { WatchEventType } from '../types';
import {
    AlreadyExistsError,
    DirectoryOperationError,
    ExistenceError,
    FileSystemOperationError,
    FileTypeError,
    InitializationFailedError,
    OPFSError,
    PathError,
    mapDomError
} from '../utils/errors';

import {
    basename,
    calculateFileHash,
    checkOPFSSupport,
    dirname,
    joinPath,
    normalizePath,
    removeEntry,
    resolvePath,
    splitPath,
    withLock
} from '../utils/helpers';
import { expandImportFilesSource } from '../utils/importSources';

import type {
    DirentData,
    FileOpenOptions,
    FileStat,
    ImportFilesProgress,
    ImportFilesResult,
    ImportFilesSource,
    OPFSOptions,
    RenameOptions,
    WatchEvent,
} from '../types';
import type { ResolvedImportFileData } from '../utils/importSources';


/**
 * Shared OPFS logic (directories, meta, watch, high-level helpers).
 *
 * Subclasses implement byte I/O and file descriptors. Together those methods
 * are the {@link OPFSApi} contract used by the facade and Comlink proxies.
 */
export abstract class BaseOPFS {
    /** Root directory handle for the file system */
    protected root!: FileSystemDirectoryHandle;

    /** Promise to prevent concurrent mount operations */
    protected mountingPromise: Promise<boolean> | null = null;

    /** BroadcastChannel instance for sending events */
    protected broadcastChannel: BroadcastChannel | null = null;

    /** Configuration options */
    protected options: Required<OPFSOptions> = {
        root: '/',
        namespace: '',
        maxFileSize: 50 * 1024 * 1024,
        hashAlgorithm: 'etag',
        broadcastChannel: 'opfs-worker',
    };

    /**
     * Notify about internal changes to the file system.
     *
     * Always posts on the BroadcastChannel when one is configured. Path / include /
     * exclude filtering happens on the subscriber side (`OPFSFacade.watch` listener),
     * so a tab that never called `watch` still publishes mutations for other tabs.
     */
    protected async notifyChange(event: Omit<WatchEvent, 'timestamp' | 'hash' | 'namespace'>): Promise<void> {
        if (!this.options.broadcastChannel) {
            return;
        }

        const path = event.path;
        let hash: string | undefined;

        if (this.options.hashAlgorithm) {
            try {
                const stat = await this.stat(path);

                hash = stat.hash;
            }
            catch {}
        }

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

    constructor(options?: OPFSOptions) {
        checkOPFSSupport();

        if (options) {
            void this.setOptions(options);
        }
    }

    /** Exclusive path lock keyed by absolute OPFS path (`root` + API path). */
    protected async withPathLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
        return withLock(path, fn, this.options.root);
    }

    /** Read file contents as bytes */
    abstract readFile(path: string): Promise<Uint8Array>;

    /** Create or overwrite a file with binary data */
    abstract writeFile(path: string, data: Uint8Array | ArrayBuffer): Promise<void>;

    /** Append binary data to a file */
    abstract appendFile(path: string, data: Uint8Array | ArrayBuffer): Promise<void>;

    /** Create or overwrite a file from a byte stream */
    abstract writeStream(
        path: string,
        stream: ReadableStream<Uint8Array>,
        onProgress?: (bytesWritten: number) => unknown
    ): Promise<number>;

    /** Open a file and return a file descriptor */
    abstract open(path: string, options?: FileOpenOptions): Promise<number>;

    /** Close a file descriptor */
    abstract close(fd: number): Promise<void>;

    /** Read from a file descriptor into a buffer */
    abstract read(
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null | undefined
    ): Promise<{ bytesRead: number; buffer: Uint8Array }>;

    /** Write from a buffer to a file descriptor */
    abstract write(
        fd: number,
        buffer: Uint8Array,
        offset?: number,
        length?: number,
        position?: number | null | undefined,
        emitEvent?: boolean
    ): Promise<number>;

    /** File stats by descriptor */
    abstract fstat(fd: number): Promise<FileStat>;

    /** Truncate a file by descriptor */
    abstract ftruncate(fd: number, size?: number): Promise<void>;

    /** Flush a file descriptor to storage */
    abstract fsync(fd: number): Promise<void>;

    /**
     * Initialize the file system within a given directory.
     * If no root is specified, uses the OPFS root directory.
     */
    protected async mount(): Promise<boolean> {
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
                reject(new InitializationFailedError(root, error));
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
    protected async getDirectoryHandle(path: string | string[], create: boolean = false, from: FileSystemDirectoryHandle | null = this.root): Promise<FileSystemDirectoryHandle> {
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
    protected async getFileHandle(path: string | string[], create = false, _from: FileSystemDirectoryHandle | null = this.root): Promise<FileSystemFileHandle> {
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
                    throw mapDomError(err, {
                        path: joinPath(segments.slice(0, i + 1)),
                        existenceType: 'directory',
                    });
                }

                if (err.name === 'TypeMismatchError') {
                    throw mapDomError(err, { path: segment!, isDirectory: false });
                }

                throw new FileSystemOperationError('create directory', segment!, err);
            }
        }

        await this.notifyChange({ path, type: WatchEventType.Added, isDirectory: true });
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
        let parentDir: FileSystemDirectoryHandle;

        try {
            parentDir = await this.getDirectoryHandle(dirname(path), false);
            const hashAlgorithm = this.options.hashAlgorithm;

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

            if (hashAlgorithm === 'etag') {
                baseStat.hash = `${ file.lastModified.toString(36) }-${ file.size.toString(36) }`;
            }
            // Crypto hash
            else if (typeof hashAlgorithm === 'string') {
                try {
                    const hash = await calculateFileHash(file, hashAlgorithm, this.options.maxFileSize);

                    baseStat.hash = hash;
                }
                catch (error) {
                    console.warn(`Failed to calculate hash for ${ path }:`, error);
                }
            }

            return baseStat;
        }
        catch (e: any) {
            if (e.name === 'NotFoundError') {
                throw new ExistenceError('file', path, e);
            }

            if (e.name !== 'TypeMismatchError') {
                throw new FileSystemOperationError('stat', path, e);
            }
        }

        try {
            await parentDir!.getDirectoryHandle(name, { create: false });

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
            throw new FileSystemOperationError('stat', path, e);
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

            await this.notifyChange({ path, type: WatchEventType.Changed, isDirectory: true });
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw mapDomError(error, { path, isDirectory: true });
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
            throw new DirectoryOperationError('EROOT', path);
        }

        const { recursive = false, force = false } = options || {};

        const parent = await this.getDirectoryHandle(dirname(path), false);
        const stat = await this.stat(path);

        await removeEntry(parent, path, { recursive, force, root: this.options.root });

        await this.notifyChange({ path, type: WatchEventType.Removed, isDirectory: stat.isDirectory });
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
                throw new ExistenceError('file', normalizedPath);
            }

            return normalizedPath;
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw mapDomError(error, { path });
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

            const sourceStat = await this.stat(oldPath);
            const destExists = await this.exists(newPath);

            if (destExists && !overwrite) {
                throw new AlreadyExistsError(newPath);
            }

            await this.copy(oldPath, newPath, { recursive: true, overwrite });
            await this.remove(oldPath, { recursive: true });

            // Notify about the rename operation
            await this.notifyChange({ path: oldPath, type: WatchEventType.Removed, isDirectory: sourceStat.isDirectory });
            await this.notifyChange({ path: newPath, type: WatchEventType.Added, isDirectory: sourceStat.isDirectory });
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw mapDomError(error, { path: oldPath });
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
                throw new ExistenceError('source', source);
            }

            const destExists = await this.exists(destination);

            if (destExists && !overwrite) {
                throw new AlreadyExistsError(destination);
            }

            const sourceStats = await this.stat(source);

            if (sourceStats.isFile) {
                const content = await this.readFile(source);

                await this.writeFile(destination, content);
            }
            else {
                if (!recursive) {
                    throw new FileTypeError('directory', source);
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

            throw mapDomError(error, { path: source });
        }
    }

    /**
     * Read a file as a `Blob` without copying its bytes into memory.
     *
     * OPFS hands back a disk-backed `File`, so the browser can stream it on
     * demand — pass it to `URL.createObjectURL()` for `<video>` / `<audio>` /
     * `<img>` and only the played range is actually read. Structured clone keeps
     * the reference intact when the file system runs in a worker.
     *
     * @param path - Path to the file
     * @returns Lazy `File` handle backed by OPFS storage
     * @throws {OPFSError} If the path is missing or is a directory
     *
     * @example
     * ```typescript
     * const blob = await fs.readBlob('/media/clip.mp4');
     * video.src = URL.createObjectURL(blob);
     * ```
     */
    async readBlob(path: string): Promise<Blob> {
        await this.mount();

        try {
            const fileHandle = await this.getFileHandle(path, false);

            return await fileHandle.getFile();
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw mapDomError(error, { path, isDirectory: error?.name === 'TypeMismatchError' });
        }
    }

    /**
     * Bulk-import files from `[path, data]` entries (strings, bytes, Blobs, or Files).
     * Each entry is written via {@link writeStream} so large Blobs/Files are not
     * fully buffered in memory.
     *
     * Accepts an array of tuples, a `Map`, or any iterable of `[path, data]` pairs.
     *
     * @param entries - Files to write
     * @param onProgress - Per-chunk progress with path, index, and byte counts
     * @returns Written paths, count, and total bytes
     * @throws {OPFSError} If a write fails
     *
     * @example
     * ```typescript
     * const result = await fs.importFiles([
     *   ['/config.json', JSON.stringify({ theme: 'dark' })],
     *   ['/data/binary.dat', new Uint8Array([1, 2, 3, 4])],
     *   ['/upload.txt', fileFromInput],
     * ], (p) => console.log(`${p.path}: ${p.bytesWritten}/${p.bytesTotal}`));
     *
     * console.log(result.count, result.bytesWritten, result.paths);
     * ```
     */
    async importFiles(
        entries: ImportFilesSource,
        onProgress?: (progress: ImportFilesProgress) => unknown
    ): Promise<ImportFilesResult> {
        await this.mount();

        const list = await expandImportFilesSource(entries);
        const count = list.length;
        const paths = list.map(([path]) => path);
        const totalBytes = list.reduce((sum, [, data]) => sum + importEntryByteLength(data), 0);
        let totalBytesWritten = 0;

        try {
            for (let index = 0; index < count; index++) {
                const [path, data] = list[index]!;
                const { stream, size: bytesTotal } = toImportStream(data);
                const base = totalBytesWritten;

                const written = await this.writeStream(
                    path,
                    stream,
                    onProgress
                        ? bytesWritten => onProgress({
                            path,
                            index,
                            count,
                            bytesWritten,
                            bytesTotal,
                            totalBytesWritten: base + bytesWritten,
                            totalBytes,
                        })
                        : undefined
                );

                totalBytesWritten += written;
            }

            return {
                paths,
                count,
                bytesWritten: totalBytesWritten,
            };
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw mapDomError(error);
        }
    }

    /**
     * @deprecated Use {@link importFiles} instead.
     */
    async createIndex(entries: ImportFilesSource): Promise<void> {
        warnCreateIndexDeprecated();
        await this.importFiles(entries);
    }

    /**
     * Dispose of resources and clean up the file system instance
     */
    dispose(): void {
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = null;
        }
    }
}

function importEntryByteLength(data: ResolvedImportFileData): number {
    if (typeof data === 'string') {
        return new TextEncoder().encode(data).byteLength;
    }

    if (data instanceof Blob) {
        return data.size;
    }

    return data.byteLength;
}

function toImportStream(data: ResolvedImportFileData): { stream: ReadableStream<Uint8Array>; size: number } {
    if (data instanceof Blob) {
        return { stream: data.stream(), size: data.size };
    }

    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    return {
        size: bytes.byteLength,
        stream: new ReadableStream({
            start(controller) {
                controller.enqueue(bytes);
                controller.close();
            },
        }),
    };
}

let createIndexWarned = false;

function warnCreateIndexDeprecated(): void {
    if (createIndexWarned) {
        return;
    }

    createIndexWarned = true;
    console.warn('[opfs-worker] createIndex() is deprecated; use importFiles() instead');
}
