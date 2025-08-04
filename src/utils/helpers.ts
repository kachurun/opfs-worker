import { encodeString } from './encoder';
import { OPFSError, OPFSNotSupportedError } from './errors';

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

/** 
 * Split a path into an array of segments
 * 
 * @param path - The path to split
 * @returns The array of segments
 */
export function splitPath(path: string | string[]): string[] {
    if (Array.isArray(path)) {
        return path;
    }

    return path.split('/').filter(Boolean);
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
 * normalizePath(''); // '/'
 * ```
 */
export function normalizePath(path: string): string {
    if (!path || path === '/') {
        return '/';
    }
    return path.startsWith('/') ? path : `/${path}`;
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
 * ```
 */
export function resolvePath(path: string): string {
    const segments = splitPath(path);
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
export async function readFileData(fileHandle: FileSystemFileHandle): Promise<Uint8Array> {
    const handle = await fileHandle.createSyncAccessHandle();

    try {
        const size = handle.getSize();
        const buffer = new Uint8Array(size);

        handle.read(buffer, { at: 0 });

        return buffer;
    }
    finally {
        handle.close();
    }
}

/**
 * Write data to a file using a file handle
 *
 * @param fileHandle - The file handle to write to
 * @param data - The data to write to the file
 * @param encoding - The encoding to use
 * @param options - Write options (truncate or append)
 */
export async function writeFileData(
    fileHandle: FileSystemFileHandle,
    data: string | Uint8Array | ArrayBuffer,
    encoding?: BufferEncoding,
    options: { truncate?: boolean; append?: boolean } = {}
): Promise<void> {
    let handle: FileSystemSyncAccessHandle | null = null;

    try {
        handle = await fileHandle.createSyncAccessHandle();

        const buffer = createBuffer(data, encoding);
        const writeOffset = options.append ? handle.getSize() : 0;

        handle.write(buffer, { at: writeOffset });

        if (options.truncate && !options.append) {
            handle.truncate(buffer.byteLength);
        }

        handle.flush();
    }
    catch (error) {
        console.error(error);
        const operation = options.append ? 'append' : 'write';

        throw new OPFSError(`Failed to ${ operation } file`, `${ operation.toUpperCase() }_FAILED`);
    }
    finally {
        if (handle) {
            try {
                handle.close();
            }
            catch { /* ~ */ }
        }
    }
}

/**
 * Calculate file hash using Web Crypto API
 * 
 * @param buffer - The file content as Uint8Array
 * @param algorithm - Hash algorithm to use (default: 'SHA-1')
 * @returns Promise that resolves to the hash string
 */
export async function calculateFileHash(buffer: Uint8Array, algorithm: string = 'SHA-1'): Promise<string> {
    try {
        const bufferSource = new Uint8Array(buffer);
        const hashBuffer = await crypto.subtle.digest(algorithm, bufferSource);
        const hashArray = Array.from(new Uint8Array(hashBuffer));

        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    catch (error) {
        console.warn(`Failed to calculate ${ algorithm } hash:`, error);

        throw error;
    }
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
 * ```
 */
export async function convertBlobToUint8Array(blob: Blob): Promise<Uint8Array> {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}
