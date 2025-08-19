import { minimatch } from 'minimatch';

import { encodeString } from './encoder';
import { OPFSError, OPFSNotSupportedError, mapDomError } from './errors';

import type { BufferEncoding } from 'typescript';


/**
 * Check if the browser supports the OPFS API
 * 
 * @throws {OPFSNotSupportedError} If the browser does not support the OPFS API
 */
export function checkOPFSSupport(): void {
    if (!('storage' in navigator) || !('getDirectory' in (navigator.storage as any))) {
        throw new OPFSNotSupportedError();
    }
}

export async function withLock<T>(
    path: string,
    mode: 'shared' | 'exclusive',
    fn: () => Promise<T>
): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        return navigator.locks.request(`opfs:${ path.replace(/\/+/g, '/') }`, { mode }, fn);
    }

    return fn();
}

/** 
 * Split a path into an array of segments
 * 
 * @param path - The path to split
 * @returns The array of segments
 * 
 * @example
 * ```typescript
 * splitPath('/path/to/file'); // ['path', 'to', 'file']
 * splitPath('~/path/to/file'); // ['path', 'to', 'file'] (home dir handled)
 * splitPath('relative/path'); // ['relative', 'path']
 * ```
 */
export function splitPath(path: string | string[]): string[] {
    if (Array.isArray(path)) {
        return path;
    }

    const normalizedPath = path.startsWith('~/') ? path.slice(2) : path;

    return normalizedPath.split('/').filter(Boolean);
}


/**
 * Join an array of path segments into a single path
 * 
 * @param segments - The array of path segments
 * @returns The joined path
 */
export function joinPath(segments: string[] | string): string {
    return typeof segments === 'string'
        ? (segments ?? '/')
        : `/${ segments.join('/') }`;
}

/**
 * Extract the filename from a path
 * 
 * @param path - The file path
 * @returns The filename without the directory path
 * 
 * @example
 * ```typescript
 * basename('/path/to/file.txt'); // 'file.txt'
 * basename('/path/to/directory/'); // ''
 * basename('file.txt'); // 'file.txt'
 * ```
 */
export function basename(path: string): string {
    const segments = splitPath(path);

    return segments[segments.length - 1] || '';
}

/**
 * Extract the directory path from a file path
 * 
 * @param path - The file path
 * @returns The directory path without the filename
 * 
 * @example
 * ```typescript
 * dirname('/path/to/file.txt'); // '/path/to'
 * dirname('/path/to/directory/'); // '/path/to/directory'
 * dirname('file.txt'); // '/'
 * ```
 */
export function dirname(path: string): string {
    const segments = splitPath(path);

    segments.pop();

    return joinPath(segments);
}

/**
 * Normalize a path to ensure it starts with '/'
 * 
 * @param path - The path to normalize
 * @returns The normalized path
 * 
 * @example
 * ```typescript
 * normalizePath('path/to/file'); // '/path/to/file'
 * normalizePath('/path/to/file'); // '/path/to/file'
 * normalizePath('~/path/to/file'); // '/path/to/file' (home dir normalized to root)
 * normalizePath(''); // '/'
 * ```
 */
export function normalizePath(path: string): string {
    if (!path || path === '/') {
        return '/';
    }

    if (path.startsWith('~/')) {
        return `/${ path.slice(2) }`;
    }

    return path.startsWith('/') ? path : `/${ path }`;
}

export function normalizeMinimatch(path: string, recursive: boolean = false): string {
    path = path.replace(/\/$/, '');
    if (recursive && !path.includes('*')) {
        return `${ path }/**`;
    }

    return path;
}

export function matchMinimatch(path: string, pattern: string): boolean {
    return minimatch(path, pattern, {
        dot: true,
        matchBase: true,
    });
}

/**
 * Check if a path matches any of the provided exclude patterns (minimatch syntax)
 *
 * @param path - Absolute or relative path
 * @param patterns - Glob pattern(s) to match against
 * @returns true if excluded, false otherwise
 */
export function isPathExcluded(path: string, patterns?: string | string[]): boolean {
    if (!patterns || (Array.isArray(patterns) && patterns.length === 0)) {
        return false;
    }

    const normalized = normalizePath(path);
    const list = Array.isArray(patterns) ? patterns : [patterns];

    return list.some(pattern => minimatch(normalized, pattern, { dot: true }));
}

/**
 * Resolve a path to an absolute path, handling relative segments
 * 
 * @param path - The path to resolve
 * @returns The resolved absolute path
 * 
 * @example
 * ```typescript
 * resolvePath('./config/../data/file.txt'); // '/data/file.txt'
 * resolvePath('/path/to/../file.txt'); // '/path/file.txt'
 * resolvePath('../../file.txt'); // '/file.txt' (truncated to root)
 * resolvePath('~/config/../data/file.txt'); // '/data/file.txt' (home dir normalized to root)
 * ```
 */
export function resolvePath(path: string): string {
    // First normalize the path to handle home directory references
    const normalizedPath = normalizePath(path);
    const segments = splitPath(normalizedPath);
    const normalizedSegments: string[] = [];

    for (const segment of segments) {
        if (segment === '.' || segment === '') {
            // Skip current directory references and empty segments
            continue;
        }
        else if (segment === '..') {
            if (normalizedSegments.length === 0) {
                // Path escapes root, keep at root level
                continue;
            }

            // Go up one directory
            normalizedSegments.pop();
        }
        else {
            normalizedSegments.push(segment);
        }
    }

    return joinPath(normalizedSegments);
}

/**
 * Get the file extension from a path
 * 
 * @param path - The file path
 * @returns The file extension including the dot, or empty string if no extension
 * 
 * @example
 * ```typescript
 * extname('/path/to/file.txt'); // '.txt'
 * extname('/path/to/file'); // ''
 * extname('/path/to/file.name.ext'); // '.ext'
 * extname('/path/to/.hidden'); // ''
 * ```
 */
export function extname(path: string): string {
    const filename = basename(path);
    const lastDotIndex = filename.lastIndexOf('.');

    if (lastDotIndex <= 0 || lastDotIndex === filename.length - 1) {
        return '';
    }

    return filename.slice(lastDotIndex);
}

export function createBuffer(data: string | Uint8Array | ArrayBuffer, encoding: BufferEncoding = 'utf-8'): Uint8Array {
    if (typeof data === 'string') {
        return encodeString(data, encoding);
    }

    return data instanceof Uint8Array ? data : new Uint8Array(data);
}


/**
 * Read raw binary data from a file using a file handle
 *
 * @param fileHandle - The file handle to read from
 * @returns The raw binary data as Uint8Array
 */
export async function readFileData(
    fileHandle: FileSystemFileHandle,
    path: string
): Promise<Uint8Array> {
    return withLock(path, 'shared', async() => {
        const file = await fileHandle.getFile();
        const buf = await file.arrayBuffer();

        return new Uint8Array(buf);
    });
}

/**
 * Write data to a file using a file handle
 *
 * @param fileHandle - The file handle to write to
 * @param data - The data to write to the file
 * @param encoding - The encoding to use
 * @param options - Write options (truncate or append)
 * @param path - Optional path for locking (if not provided, no locking is used)
 */
export async function writeFileData(
    fileHandle: FileSystemFileHandle,
    data: string | Uint8Array | ArrayBuffer,
    encoding?: BufferEncoding,
    path?: string,
    options: { truncate?: boolean; append?: boolean } = {}
): Promise<void> {
    const writeOperation = async() => {
        const append = options.append || false;
        const truncate = !append && (options.truncate ?? true);
        const handle = await createSyncHandleSafe(fileHandle, path || 'unknown');

        try {
            const buffer = createBuffer(data, encoding);
            const writeOffset = append ? handle.getSize() : 0;

            handle.write(buffer, { at: writeOffset });

            if (truncate) {
                handle.truncate(buffer.byteLength);
            }

            handle.flush();
        }
        catch (error) {
            console.error(error);
            const operation = append ? 'append' : 'write';

            throw new OPFSError(`Failed to ${ operation } file`, `${ operation.toUpperCase() }_FAILED`, undefined, error);
        }
        finally {
            try {
                handle?.close();
            }
            catch { /* ~ */ }
        }
    };

    // If path is provided, use locking; otherwise, just execute the operation
    if (path) {
        return withLock(path, 'exclusive', writeOperation);
    }

    return writeOperation();
}

/**
 * Calculate file hash using Web Crypto API
 * 
 * @param buffer - The file content as File, ArrayBuffer, or Uint8Array
 * @param algorithm - Hash algorithm to use (default: 'SHA-1')
 * @param maxSize - Maximum file size in bytes. If file is larger, throws error (default: 50MB)
 * @returns Promise that resolves to the hash string
 * @throws Error if file size exceeds maxSize
 */
export async function calculateFileHash(
    buffer: File | ArrayBuffer | Uint8Array,
    algorithm: string = 'SHA-1',
    maxSize: number = 50 * 1024 * 1024 // 50MB default
): Promise<string> {
    if (buffer instanceof File) {
        buffer = await buffer.arrayBuffer();
    }

    // Check file size before processing
    if (buffer.byteLength > maxSize) {
        throw new Error(`File size ${ buffer.byteLength } bytes exceeds maximum allowed size ${ maxSize } bytes`);
    }

    const bufferSource = new Uint8Array(buffer);
    const hashBuffer = await crypto.subtle.digest(algorithm, bufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compare two Uint8Array buffers for equality
 * 
 * @param a - First buffer
 * @param b - Second buffer
 * @returns true if buffers are equal, false otherwise
 */
export function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Convert a Blob to Uint8Array
 * 
 * This function converts a Blob object to a Uint8Array for use with file operations.
 * It's useful when working with file uploads or other Blob data sources.
 * 
 * @param blob - The Blob to convert
 * @returns Promise that resolves to the Uint8Array representation of the Blob
 * 
 * @example
 * ```typescript
 * const fileInput = document.getElementById('file') as HTMLInputElement;
 * const file = fileInput.files?.[0];
 * if (file) {
 *   const data = await convertBlobToUint8Array(file);
 *   await fs.writeFile('/uploaded-file', data);
 * }
 * }
 * ```
 */
export async function convertBlobToUint8Array(blob: Blob): Promise<Uint8Array> {
    const arrayBuffer = await blob.arrayBuffer();

    return new Uint8Array(arrayBuffer);
}

/**
 * Remove a file or directory entry using a directory handle
 *
 * @param parentHandle - The parent directory handle
 * @param path - The full path of the entry to remove
 * @param options - Remove options (recursive, force, useTrash)
 */
export async function removeEntry(
    parentHandle: FileSystemDirectoryHandle,
    path: string,
    options: { recursive?: boolean; force?: boolean; useTrash?: boolean } = {}
): Promise<void> {
    const name = basename(path);

    return withLock(path, 'exclusive', async() => {
        const recursive = options.recursive ?? false;
        const force = options.force ?? false;
        const useTrash = options.useTrash ?? false;

        try {
            await parentHandle.removeEntry(name, { recursive });
        }
        catch (e: any) {
            if (e.name === 'NotFoundError') {
                if (!force) {
                    throw new OPFSError(`No such file or directory: ${ path }`, 'ENOENT', undefined, e);
                }
            }
            else if (e.name === 'InvalidModificationError') {
                throw new OPFSError(`Directory not empty: ${ path }. Use recursive option to force removal.`, 'ENOTEMPTY', undefined, e);
            }
            else if (e.name === 'TypeMismatchError' && !recursive) {
                throw new OPFSError(`Cannot remove directory without recursive option: ${ path }`, 'EISDIR', undefined, e);
            }
            else {
                throw new OPFSError(`Failed to remove entry: ${ path }`, 'RM_FAILED', undefined, e);
            }
        }
    });
}

/**
 * Validate read/write arguments for file descriptor operations
 * 
 * @param bufferLen - Length of the buffer
 * @param offset - Offset in the buffer
 * @param length - Number of bytes to read/write
 * @param position - Position in the file (null for current position)
 * @param opts - Options for validation
 * @throws {OPFSError} If arguments are invalid
 */
export function validateReadWriteArgs(
    bufferLen: number,
    offset: number,
    length: number,
    position: number | null | undefined
): void {
    if (!Number.isInteger(offset) || !Number.isInteger(length)) {
        throw new OPFSError('Invalid offset or length', 'EINVAL');
    }

    if (offset < 0 || length < 0) {
        throw new OPFSError('Negative offset or length not allowed', 'EINVAL');
    }

    if (offset + length > bufferLen) {
        throw new OPFSError('Operation would overflow buffer', 'ERANGE');
    }

    if (position != null && (!Number.isInteger(position) || position < 0)) {
        throw new OPFSError('Invalid position', 'EINVAL');
    }
}

/**
 * Safely close a file descriptor's sync handle
 * 
 * @param fd - The file descriptor number (for logging)
 * @param syncHandle - The sync handle to close
 * @param path - The file path (for logging)
 */
export function safeCloseSyncHandle(fd: number, syncHandle: any, path: string): void {
    try {
        syncHandle.flush();
        syncHandle.close();
    }
    catch (error) {
        // Log warning but don't throw, as the fd should still be removed
        console.warn(`Warning: Failed to properly close file descriptor ${ fd } (${ path }):`, error);
    }
}

/**
 * Check if position is at or beyond end of file and calculate actual read length
 * 
 * @param position - The position to read from
 * @param requestedLength - The requested length to read
 * @param fileSize - The current file size
 * @returns Object with isEOF flag and actual length to read
 */
export function calculateReadLength(position: number, requestedLength: number, fileSize: number): { isEOF: boolean; actualLength: number } {
    // Check if we're at or beyond end of file
    if (position >= fileSize) {
        return { isEOF: true, actualLength: 0 };
    }

    // Calculate actual length to read (don't read beyond file end)
    const actualLength = Math.min(requestedLength, fileSize - position);

    if (actualLength <= 0) {
        return { isEOF: true, actualLength: 0 };
    }

    return { isEOF: false, actualLength };
}

/**
 * Safely create a sync access handle with proper error mapping
 * 
 * @param fileHandle - The file handle to create sync access handle from
 * @param path - The file path for error context
 * @returns Promise that resolves to FileSystemSyncAccessHandle
 * @throws {OPFSError} If creation fails
 */
export async function createSyncHandleSafe(
    fileHandle: FileSystemFileHandle,
    path: string
): Promise<FileSystemSyncAccessHandle> {
    try {
        return await fileHandle.createSyncAccessHandle();
    }
    catch (error: any) {
        throw mapDomError(error, { path, isDirectory: false });
    }
}
