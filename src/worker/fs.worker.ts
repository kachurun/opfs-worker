import { expose } from 'comlink';

import { decodeBuffer } from './encoder';
import {
    FileNotFoundError,
    OPFSError,
    PathError
} from './errors';

import { checkOPFSSupport, readFileData, writeFileData } from './helpers';

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
     * @param path - The path to the file
     * @param data - The data to write to the file
     * @param encoding - The encoding to use
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
     * @param path - The path to the file
     * @param data - The data to append to the file
     * @param encoding - The encoding to use
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
     */
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
        const recursive = options?.recursive ?? false;
        const segments = this.splitPath(path);

        let current = this.root;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];

            try {
                current = await current.getDirectoryHandle(segment!, { create: recursive || i === segments.length - 1 });
            }
            catch (e: any) {
                if (e.name === 'NotFoundError') {
                    throw new OPFSError(
                        `Parent directory does not exist: /${ segments.slice(0, i + 1).join('/') }`,
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
     */
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
