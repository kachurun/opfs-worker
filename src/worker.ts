import { expose } from 'comlink';

import { decodeBuffer } from './utils/encoder';
import {
    FileNotFoundError,
    OPFSError,
    OPFSNotMountedError,
    PathError
} from './utils/errors';

import { calculateFileHash, checkOPFSSupport, joinPath, readFileData, splitPath, writeFileData } from './utils/helpers';

import type { DirentData, FileStat } from './types';
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
    private root: FileSystemDirectoryHandle | null = null;

    /**
     * Creates a new OPFSFileSystem instance
     * 
     * @throws {OPFSError} If OPFS is not supported in the current browser
     */
    constructor() {
        checkOPFSSupport();
    }

    /**
     * Initialize the file system within a given directory
     * 
     * This method sets up the root directory for all subsequent operations.
     * It must be called before any other file system operations.
     * 
     * @param root - The root path for the file system (default: '/')
     * @returns Promise that resolves to true if initialization was successful
     * @throws {OPFSError} If initialization fails
     * 
     * @example
     * ```typescript
     * const fs = new OPFSFileSystem();
     * const success = await fs.init('/my-app');
     * ```
     */
    async mount(root: string = '/'): Promise<boolean> {
        try {
            const rootDir = await navigator.storage.getDirectory();

            this.root = await this.getDirectoryHandle(root, true, rootDir);

            return true;
        }
        catch (error) {
            console.error(error);

            throw new OPFSError('Failed to initialize OPFS', 'INIT_FAILED');
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
        if (!from) {
            throw new OPFSNotMountedError();
        }

        const segments = Array.isArray(path) ? path : splitPath(path);
        let current = from;

        for (const segment of segments) {
            current = await current.getDirectoryHandle(segment, { create });
        }

        return current;
    }

    /**
     * Get a file handle from a path
     * 
     * Navigates to the parent directory and retrieves or creates a file handle
     * for the specified file path.
     * 
     * @param path - The path to the file (string or array of segments)
     * @param create - Whether to create the file if it doesn't exist (default: false)
     * @param from - The directory to start from (default: root directory)
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
    private async getFileHandle(path: string | string[], create = false, from: FileSystemDirectoryHandle | null = this.root): Promise<FileSystemFileHandle> {
        if (!from) {
            throw new OPFSNotMountedError();
        }

        const segments = splitPath(path);

        if (segments.length === 0) {
            throw new PathError('Path must not be empty', Array.isArray(path) ? path.join('/') : path);
        }

        const fileName = segments.pop()!;
        const dir = await this.getDirectoryHandle(segments, create, from);

        return dir.getFileHandle(fileName, { create });
    }


    /**
     * Recursively list all files and directories with their stats
     * 
     * Traverses the entire file system starting from the root and returns
     * a Map containing all paths and their corresponding file statistics.
     * 
     * @param options - Options for indexing
     * @param options.includeHash - Whether to calculate file hash (default: false)
     * @param options.hashAlgorithm - Hash algorithm to use (default: 'SHA-1', fastest)
     * @returns Promise that resolves to a Map of path => FileStat
     * @throws {OPFSError} If the indexing operation fails
     * 
     * @example
     * ```typescript
     * // Basic index without hash
     * const index = await fs.index();
     * 
     * // Index with file hash
     * const indexWithHash = await fs.index({ 
     *   includeHash: true,
     *   hashAlgorithm: 'SHA-1'
     * });
     * 
     * // Iterate through all files and directories
     * for (const [path, stat] of index) {
     *   console.log(`${path}: ${stat.isFile ? 'file' : 'directory'} (${stat.size} bytes)`);
     *   if (stat.hash) console.log(`  Hash: ${stat.hash}`);
     * }
     * 
     * // Get specific file stats
     * const fileStats = index.get('/data/config.json');
     * if (fileStats) {
     *   console.log(`File size: ${fileStats.size} bytes`);
     *   if (fileStats.hash) console.log(`Hash: ${fileStats.hash}`);
     * }
     * ```
     */
    async index(options?: { includeHash?: boolean; hashAlgorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' }): Promise<Map<string, FileStat>> {
        const result = new Map<string, FileStat>();

        const walk = async(dirPath: string) => {
            const items = await this.readdir(dirPath, { withFileTypes: true });

            for (const item of items) {
                const fullPath = `${ dirPath === '/' ? '' : dirPath }/${ item.name }`;

                try {
                    const stat = await this.stat(fullPath, options);

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

        // Add root directory
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
    async readFile(path: string, encoding?: BufferEncoding): Promise<string>;
    async readFile(
        path: string,
        encoding: BufferEncoding | 'binary' = 'utf-8'
    ): Promise<string | Uint8Array> {
        try {
            const fileHandle = await this.getFileHandle(path, false);
            const buffer = await readFileData(fileHandle);

            if (encoding === 'binary') {
                return buffer;
            }

            return decodeBuffer(buffer, encoding);
        }
        catch (err) {
            console.error(err);

            throw new FileNotFoundError(path);
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
        const fileHandle = await this.getFileHandle(path, true);

        await writeFileData(fileHandle, data, encoding, { truncate: true });
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
        const fileHandle = await this.getFileHandle(path, true);

        await writeFileData(fileHandle, data, encoding, { append: true });
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
        if (!this.root) {
            throw new OPFSNotMountedError();
        }

        const recursive = options?.recursive ?? false;
        const segments = splitPath(path);

        let current = this.root;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];

            try {
                current = await current.getDirectoryHandle(segment!, { create: recursive || i === segments.length - 1 });
            }
            catch (e: any) {
                if (e.name === 'NotFoundError') {
                    throw new OPFSError(
                        `Parent directory does not exist: ${ joinPath(segments.slice(0, i + 1)) }`,
                        'ENOENT'
                    );
                }

                if (e.name === 'TypeMismatchError') {
                    throw new OPFSError(`Path segment is not a directory: ${ segment }`, 'ENOTDIR');
                }

                throw new OPFSError('Failed to create directory', 'MKDIR_FAILED');
            }
        }
    }

    /**
     * Get file or directory stats
     * 
     * Retrieves metadata about a file or directory, including size, modification time,
     * type information, and optionally file hashes.
     * 
     * @param path - The path to the file or directory
     * @param options - Options for stat operation
     * @param options.includeHash - Whether to calculate file hash (default: false, only for files)
     * @param options.hashAlgorithm - Hash algorithm to use (default: 'SHA-1', fastest)
     * @returns Promise that resolves to file/directory statistics
     * @throws {OPFSError} If the file or directory does not exist or cannot be accessed
     * 
     * @example
     * ```typescript
     * // Basic stats
     * const stats = await fs.stat('/config/settings.json');
     * console.log(`File size: ${stats.size} bytes`);
     * console.log(`Is file: ${stats.isFile}`);
     * console.log(`Modified: ${stats.mtime}`);
     * 
     * // Stats with hash (SHA-1 is fastest)
     * const statsWithHash = await fs.stat('/config/settings.json', { 
     *   includeHash: true,
     *   hashAlgorithm: 'SHA-1'
     * });
     * console.log(`Hash: ${statsWithHash.hash}`);
     * ```
     */
    async stat(path: string, options?: { includeHash?: boolean; hashAlgorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' }): Promise<FileStat> {
        const segments = splitPath(path);
        const name = segments.pop();
        const parentDir = await this.getDirectoryHandle(segments, false);
        const includeHash = options?.includeHash ?? false;
        const hashAlgorithm = options?.hashAlgorithm ?? 'SHA-1';

        // Get as file first
        try {
            const fileHandle = await parentDir.getFileHandle(name!, { create: false });
            const file = await fileHandle.getFile();

            const baseStat: FileStat = {
                kind: 'file',
                size: file.size,
                mtime: new Date(file.lastModified).toISOString(),
                ctime: new Date(file.lastModified).toISOString(),
                isFile: true,
                isDirectory: false,
            };

            // Calculate hash if requested
            if (includeHash) {
                try {
                    const buffer = new Uint8Array(await file.arrayBuffer());
                    const hash = await calculateFileHash(buffer, hashAlgorithm);

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
                throw new OPFSError('Failed to stat (file)', 'STAT_FAILED');
            }
        }

        // Get as directory
        try {
            await parentDir.getDirectoryHandle(name!, { create: false });

            return {
                kind: 'directory',
                size: 0,
                mtime: new Date(0).toISOString(),
                ctime: new Date(0).toISOString(),
                isFile: false,
                isDirectory: true,
                // Directories don't have hashes
            };
        }
        catch (e: any) {
            if (e.name === 'NotFoundError') {
                throw new OPFSError(`No such file or directory: ${ path }`, 'ENOENT');
            }

            throw new OPFSError('Failed to stat (directory)', 'STAT_FAILED');
        }
    }

    /**
     * Read a directory's contents
     * 
     * Lists all files and subdirectories within the specified directory.
     * 
     * @param path - The path to the directory to read
     * @param options - Options for the readdir operation
     * @param options.withFileTypes - Whether to return detailed file information (default: false)
     * @returns Promise that resolves to an array of file/directory names or detailed information
     * @throws {OPFSError} If the directory does not exist or cannot be accessed
     * 
     * @example
     * ```typescript
     * // Get simple list of names
     * const files = await fs.readdir('/users/john/documents');
     * console.log('Files:', files); // ['readme.txt', 'config.json', 'images']
     * 
     * // Get detailed information
     * const detailed = await fs.readdir('/users/john/documents', { withFileTypes: true });
     * detailed.forEach(item => {
     *   console.log(`${item.name} - ${item.isFile ? 'file' : 'directory'}`);
     * });
     * ```
     */
    async readdir(path: string): Promise<string[]>;
    async readdir(path: string, options: { withFileTypes: true }): Promise<DirentData[]>;
    async readdir(path: string, options: { withFileTypes: false }): Promise<string[]>;
    async readdir(path: string, options?: { withFileTypes?: boolean }): Promise<string[] | DirentData[]> {
        const withTypes = options?.withFileTypes ?? false;
        const dir = await this.getDirectoryHandle(path, false);

        // Use type assertion to access the entries() method
        if (withTypes) {
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
        else {
            const results: string[] = [];

            for await (const [name] of (dir as any).entries()) {
                results.push(name);
            }

            return results;
        }
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
        const segments = splitPath(path);
        const name = segments.pop();
        let dir: FileSystemDirectoryHandle | null = null;

        try {
            dir = await this.getDirectoryHandle(segments, false);
        }
        catch (e: any) {
            if (e.name === 'NotFoundError' || e.name === 'TypeMismatchError') {
                dir = null;
            }

            throw e;
        }

        if (!dir || !name) {
            return false;
        }

        // Get as file
        try {
            await dir.getFileHandle(name, { create: false });

            return true;
        }
        catch (e: any) {
            if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') {
                throw e;
            }
        }

        // Get as directory
        try {
            await dir.getDirectoryHandle(name, { create: false });

            return true;
        }
        catch (e: any) {
            if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') {
                throw e;
            }
        }

        return false;
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
        try {
            const items = await this.readdir(path, { withFileTypes: true });

            for (const item of items) {
                const itemPath = `${ path === '/' ? '' : path }/${ item.name }`;

                await this.remove(itemPath, { recursive: true });
            }
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to clear directory: ${ path }`, 'CLEAR_FAILED');
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
        const recursive = options?.recursive ?? false;
        const force = options?.force ?? false;

        const segments = splitPath(path);
        const name = segments.pop();

        if (!name) {
            throw new PathError('Invalid path', path);
        }

        const parent = await this.getDirectoryHandle(segments, false);

        try {
            await parent.removeEntry(name, { recursive });
        }
        catch (e: any) {
            if (e.name === 'NotFoundError') {
                if (!force) {
                    throw new OPFSError(`No such file or directory: ${ path }`, 'ENOENT');
                }
            }
            else if (e.name === 'InvalidModificationError') {
                throw new OPFSError(`Directory not empty: ${ path }. Use recursive option to force removal.`, 'ENOTEMPTY');
            }
            else if (e.name === 'TypeMismatchError' && !recursive) {
                throw new OPFSError(`Cannot remove directory without recursive option: ${ path }`, 'EISDIR');
            }
            else {
                throw new OPFSError(`Failed to remove path: ${ path }`, 'RM_FAILED');
            }
        }
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
        try {
            const segments = splitPath(path);
            const normalizedSegments: string[] = [];

            for (const segment of segments) {
                if (segment === '.' || segment === '') {
                // Skip current directory references and empty segments
                    continue;
                }
                else if (segment === '..') {
                    if (normalizedSegments.length === 0) {
                        throw new OPFSError('Path escapes root', 'EINVAL');
                    }

                    // Go up one directory
                    if (normalizedSegments.length > 0) {
                        normalizedSegments.pop();
                    }
                }
                else {
                // Regular segment
                    normalizedSegments.push(segment);
                }
            }

            const normalizedPath = joinPath(normalizedSegments);
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

            throw new OPFSError(`Failed to resolve path: ${ path }`, 'REALPATH_FAILED');
        }
    }

    /**
     * Rename a file or directory
     * 
     * Changes the name of a file or directory. If the target path already exists,
     * it will be replaced.
     * 
     * @param oldPath - The current path of the file or directory
     * @param newPath - The new path for the file or directory
     * @returns Promise that resolves when the rename operation is complete
     * @throws {OPFSError} If the rename operation fails
     * 
     * @example
     * ```typescript
     * await fs.rename('/old/path/file.txt', '/new/path/renamed.txt');
     * ```
     */
    async rename(oldPath: string, newPath: string): Promise<void> {
        try {
            // Check if source exists
            const sourceExists = await this.exists(oldPath);

            if (!sourceExists) {
                throw new FileNotFoundError(oldPath);
            }

            await this.copy(oldPath, newPath, { recursive: true });
            await this.remove(oldPath, { recursive: true });
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to rename from ${ oldPath } to ${ newPath }`, 'RENAME_FAILED');
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
     * @param options.force - Whether to overwrite existing files (default: true)
     * @returns Promise that resolves when the copy operation is complete
     * @throws {OPFSError} If the copy operation fails
     * 
     * @example
     * ```typescript
     * // Copy a file
     * await fs.cp('/source/file.txt', '/dest/file.txt');
     * 
     * // Copy a directory and all its contents
     * await fs.cp('/source/dir', '/dest/dir', { recursive: true });
     * 
     * // Copy without overwriting existing files
     * await fs.cp('/source', '/dest', { recursive: true, force: false });
     * ```
     */
    async copy(source: string, destination: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
        try {
            const recursive = options?.recursive ?? false;
            const force = options?.force ?? true;

            const sourceExists = await this.exists(source);

            if (!sourceExists) {
                throw new OPFSError(`Source does not exist: ${ source }`, 'ENOENT');
            }

            // Check if destination exists and handle accordingly
            const destExists = await this.exists(destination);

            if (destExists && !force) {
                throw new OPFSError(`Destination already exists: ${ destination }`, 'EEXIST');
            }

            // Get source stats to determine if it's a file or directory
            const sourceStats = await this.stat(source);

            if (sourceStats.isFile) {
                // Copy file
                const content = await this.readFile(source, 'binary');

                await this.writeFile(destination, content);
            }
            else {
                // Copy directory
                if (!recursive) {
                    throw new OPFSError(`Cannot copy directory without recursive option: ${ source }`, 'EISDIR');
                }

                // Create destination directory
                await this.mkdir(destination, { recursive: true });

                // Copy all contents
                const items = await this.readdir(source, { withFileTypes: true });

                for (const item of items) {
                    const sourceItemPath = `${ source }/${ item.name }`;
                    const destItemPath = `${ destination }/${ item.name }`;

                    // Recursively copy each item
                    await this.copy(sourceItemPath, destItemPath, { recursive: true, force });
                }
            }
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to copy from ${ source } to ${ destination }`, 'CP_FAILED');
        }
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
        try {
            const cleanBefore = options?.cleanBefore ?? false;

            // Clear file system if requested
            if (cleanBefore) {
                await this.clear('/');
            }

            // Process each entry
            for (const [path, data] of entries) {
                // Normalize path to ensure it starts with /
                const normalizedPath = path.startsWith('/') ? path : `/${ path }`;

                // Convert data to appropriate format
                let fileData: string | Uint8Array;

                if (data instanceof Blob) {
                    // Convert Blob to Uint8Array
                    const arrayBuffer = await data.arrayBuffer();

                    fileData = new Uint8Array(arrayBuffer);
                }
                else {
                    fileData = data;
                }

                // Write the file (this will create directories as needed)
                await this.writeFile(normalizedPath, fileData);
            }
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError('Failed to sync file system', 'SYNC_FAILED');
        }
    }
}

expose(new OPFSWorker());
