import { expose } from 'comlink';

import { decodeBuffer } from './encoder';
import {
    FileNotFoundError,
    OPFSError,
    PathError
} from './errors';

import { checkOPFSSupport, writeFileData } from './helpers';

import type { BufferEncoding } from 'typescript';

export default class OPFSFileSystem {
    private root!: FileSystemDirectoryHandle;
    private storage = navigator.storage!;

    constructor() {
        checkOPFSSupport();
    }

    /**
     * Init file system within a given directory
     */
    async init(root: string = '/'): Promise<FileSystemDirectoryHandle> {
        try {
            const rootDir = await this.storage.getDirectory();

            this.root = await this.getDirectoryHandle(root, true, rootDir);

            return this.root;
        }
        catch (error) {
            console.error(error);

            throw new OPFSError('Failed to initialize OPFS', 'INIT_FAILED');
        }
    }

    /**
     * Get a directory handle from a path
     *
     * @param path - The path to the directory
     * @param create - Whether to create the directory if it doesn't exist
     * @param from - The directory to start from (default: root)
     *
     * @returns The directory handle
     */
    async getDirectoryHandle(path: string, create: boolean = false, from: FileSystemDirectoryHandle = this.root): Promise<FileSystemDirectoryHandle> {
        const segments = this.splitPath(path);
        let current = from;

        for (const segment of segments) {
            current = await current.getDirectoryHandle(segment, { create });
        }

        return current;
    }

    async getFileHandle(path: string, create = false, from: FileSystemDirectoryHandle = this.root): Promise<FileSystemFileHandle> {
        const segments = this.splitPath(path);

        if (segments.length === 0) {
            throw new PathError('Path must not be empty', path);
        }

        const fileName = segments.pop()!;
        const dir = await this.getDirectoryHandle(segments.join('/'), create, from);

        return dir.getFileHandle(fileName, { create });
    }

    /**
     * Read a file from the file system
     *
     * @param path - The path to the file
     * @param options - The options for the file
     *
     * @returns The file content
     */
    async readFile(path: string): Promise<Uint8Array>;
    async readFile(path: string, options: BufferEncoding | { encoding: BufferEncoding }): Promise<string>;
    async readFile(
        path: string,
        optionsOrEncoding?: BufferEncoding | { encoding?: BufferEncoding }
    ): Promise<Uint8Array | string> {
        let handle: FileSystemSyncAccessHandle | null = null;

        const encoding = typeof optionsOrEncoding === 'string'
            ? optionsOrEncoding
            : optionsOrEncoding?.encoding;

        try {
            const fh = await this.getFileHandle(path, false);

            handle = await fh.createSyncAccessHandle();

            const size = handle.getSize();
            const buffer = new Uint8Array(size);

            handle.read(buffer, { at: 0 });

            if (encoding) {
                return decodeBuffer(buffer, encoding);
            }

            return buffer;
        }
        catch (err) {
            console.error(err);

            throw new FileNotFoundError(path);
        }
        finally {
            try {
                handle?.close();
            }
            catch {}
        }
    }

    /**
     * Write data to a file
     *
     * @param path - The path to the file
     * @param data - The data to write to the file
     * @param options - The options for the file
     */
    async writeFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: BufferEncoding): Promise<void>;
    async writeFile(path: string, data: string | Uint8Array | ArrayBuffer, options?: { encoding?: BufferEncoding }): Promise<void>;
    async writeFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        optionsOrEncoding?: BufferEncoding | { encoding?: BufferEncoding }
    ): Promise<void> {
        const encoding = typeof optionsOrEncoding === 'string' ? optionsOrEncoding : optionsOrEncoding?.encoding;
        const fileHandle = await this.getFileHandle(path, true);

        await writeFileData(fileHandle, data, encoding, { truncate: true });
    }

    /**
     * Append data to a file
     *
     * @param path - The path to the file
     * @param data - The data to append to the file
     * @param options - The options for the file
     */
    async appendFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: BufferEncoding): Promise<void>;
    async appendFile(path: string, data: string | Uint8Array | ArrayBuffer, options?: { encoding?: BufferEncoding }): Promise<void>;
    async appendFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        optionsOrEncoding?: BufferEncoding | { encoding?: BufferEncoding }
    ): Promise<void> {
        const encoding = typeof optionsOrEncoding === 'string' ? optionsOrEncoding : optionsOrEncoding?.encoding;
        const fileHandle = await this.getFileHandle(path, true);

        await writeFileData(fileHandle, data, encoding, { append: true });
    }

    async stat(path: string): Promise<{
        size: number;
        mtime: string;
        ctime: string;
        isFile: boolean;
        isDirectory: boolean;
    }> {
        const segments = this.splitPath(path);
        const name = segments.pop();
        const parentDir = await this.getDirectoryHandle(segments.join('/'), false);

        // Get as file first
        try {
            const fileHandle = await parentDir.getFileHandle(name!, { create: false });
            const file = await fileHandle.getFile();

            return {
                size: file.size,
                mtime: new Date(file.lastModified).toISOString(),
                ctime: new Date(file.lastModified).toISOString(),
                isFile: true,
                isDirectory: false,
            };
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
                size: 0,
                mtime: new Date(0).toISOString(),
                ctime: new Date(0).toISOString(),
                isFile: false,
                isDirectory: true,
            };
        }
        catch (e: any) {
            if (e.name === 'NotFoundError') {
                throw new OPFSError(`No such file or directory: ${ path }`, 'ENOENT');
            }

            throw new OPFSError('Failed to stat (directory)', 'STAT_FAILED');
        }
    }

    private splitPath(path: string): string[] {
        return path.split('/').filter(Boolean);
    }
}

// Create instance and expose methods
const fs = new OPFSFileSystem();

expose(fs);
