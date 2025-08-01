import { encodeString } from './encoder';
import { OPFSError, OPFSNotSupportedError } from './errors';

import type { BufferEncoding } from 'typescript';

export function checkOPFSSupport(): void {
    if (!('storage' in navigator) || !('getDirectory' in (navigator.storage as any))) {
        throw new OPFSNotSupportedError();
    }
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
