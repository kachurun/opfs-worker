import { expose } from 'comlink';

import {
    DirectoryNotFoundError,
    FileNotFoundError,
    OPFSError,
    OPFSNotSupportedError,
    PathError,
    PermissionError
} from './errors';

import type { Stats } from '../types/fs';

export default class OPFSFileSystem {
    private root!: FileSystemDirectoryHandle;

    constructor() {
        this.checkOPFSSupport();
        this.initializeRoot();
    }

    private checkOPFSSupport(): void {
        if (!('storage' in navigator) || !('getDirectory' in (navigator.storage as any))) {
            throw new OPFSNotSupportedError();
        }
    }

    private async initializeRoot(): Promise<void> {
        try {
            this.root = await (navigator.storage as any).getDirectory();
        }
        catch (error) {
            throw new OPFSError('Failed to initialize OPFS', 'INIT_FAILED');
        }
    }

    /**
     * Validates and normalizes a file system path
     * @param path - The path to validate
     * @returns Normalized path string
     * @throws PathError if path is invalid or contains traversal attempts
     */
    private validateAndNormalizePath(path: string): string {
        if (!path || typeof path !== 'string') {
            throw new PathError('Path must be a non-empty string', path);
        }

        // Remove leading/trailing slashes and split
        const normalizedPath = path.replace(/^\/+|\/+$/g, '');

        if (!normalizedPath) {
            return ''; // Root directory
        }

        const parts = normalizedPath.split('/').filter(Boolean);

        // Check for path traversal attempts and invalid characters
        for (const part of parts) {
            if (part === '.' || part === '..') {
                throw new PathError('Path traversal not allowed', path);
            }

            if (part.includes('\0') || part.length > 255) {
                throw new PathError('Invalid path component', path);
            }
        }

        return parts.join('/');
    }

    /**
     * Gets a directory handle for the given path
     * @param path - Directory path
     * @param create - Whether to create the directory if it doesn't exist
     * @returns Directory handle
     */
    private async getDir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
        debugger;
        const normalizedPath = this.validateAndNormalizePath(path);
        let dir: FileSystemDirectoryHandle = this.root;

        if (!normalizedPath) {
            return dir; // Root directory
        }

        const parts = normalizedPath.split('/');

        try {
            for (const part of parts) {
                dir = await dir.getDirectoryHandle(part, { create });
            }

            return dir;
        }
        catch (error: any) {
            if (error?.name === 'NotFoundError') {
                throw new DirectoryNotFoundError(path);
            }
            if (error?.name === 'NotAllowedError') {
                throw new PermissionError(path, 'access directory');
            }

            throw new OPFSError(`Failed to access directory: ${ error?.message || 'Unknown error' }`, 'DIRECTORY_ACCESS_FAILED', path);
        }
    }

    /**
     * Gets a file handle for the given path
     * @param path - File path
     * @param create - Whether to create the file if it doesn't exist
     * @returns File handle
     */
    private async getFile(path: string, create = false): Promise<FileSystemFileHandle> {
        const normalizedPath = this.validateAndNormalizePath(path);

        if (!normalizedPath) {
            throw new PathError('Cannot access root as file', path);
        }

        const parts = normalizedPath.split('/');
        const fileName = parts.pop()!;
        const dirPath = parts.join('/');

        try {
            const dir = await this.getDir(dirPath, create);

            return await dir.getFileHandle(fileName, { create });
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }
            if (error?.name === 'NotFoundError') {
                throw new FileNotFoundError(path);
            }
            if (error?.name === 'NotAllowedError') {
                throw new PermissionError(path, 'access file');
            }

            throw new OPFSError(`Failed to access file: ${ error?.message || 'Unknown error' }`, 'FILE_ACCESS_FAILED', path);
        }
    }

    /**
     * Joins path segments with proper normalization
     * @param parts - Path segments to join
     * @returns Normalized joined path
     */
    private join(...parts: string[]): string {
        const path = parts.join('/');

        return this.validateAndNormalizePath(path);
    }

    /**
     * Checks if a file or directory exists at the given path
     * @param path - Path to check
     * @returns Promise resolving to true if exists, false otherwise
     */
    async exists(path: string): Promise<boolean> {
        try {
            await this.stat(path);

            return true;
        }
        catch (error) {
            if (error instanceof FileNotFoundError || error instanceof DirectoryNotFoundError) {
                return false;
            }

            throw error;
        }
    }

    /**
     * Reads a file and returns its contents
     * @param path - File path to read
     * @param options - Read options
     * @returns File contents as string or Uint8Array
     */
    async readFile(
        path: string,
        options?: { encoding?: 'utf-8' | 'binary' | 'buffer' }
    ): Promise<string | Uint8Array> {
        debugger;
        try {
            const fh = await this.getFile(path);
            const file = await fh.getFile();
            const buffer = new Uint8Array(await file.arrayBuffer());

            const encoding = options?.encoding ?? 'utf-8';

            if (encoding === 'binary' || encoding === 'buffer') {
                return buffer;
            }

            return new TextDecoder(encoding).decode(buffer);
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to read file: ${ error }`, 'READ_FAILED', path);
        }
    }

    /**
     * Writes data to a file
     * @param path - File path to write
     * @param data - Data to write
     * @param options - Write options
     */
    async writeFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        options?: { encoding?: string }
    ): Promise<void> {
        let handle: FileSystemSyncAccessHandle | null = null;

        try {
            const fh = await this.getFile(path, true);

            handle = await fh.createSyncAccessHandle();

            let buffer: Uint8Array;

            if (typeof data === 'string') {
                buffer = new TextEncoder().encode(data);
            }
            else if (data instanceof ArrayBuffer) {
                buffer = new Uint8Array(data);
            }
            else {
                buffer = new Uint8Array(data);
            }

            handle.truncate(0);
            handle.write(buffer, { at: 0 });
            handle.flush();
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to write file: ${ error }`, 'WRITE_FAILED', path);
        }
        finally {
            if (handle) {
                try {
                    handle.close();
                }
                catch {
                    // Ignore close errors
                }
            }
        }
    }

    /**
     * Appends data to a file
     * @param path - File path to append to
     * @param data - Data to append
     * @param options - Append options
     */
    async appendFile(
        path: string,
        data: string | Uint8Array | ArrayBuffer,
        options?: { encoding?: string }
    ): Promise<void> {
        let handle: FileSystemSyncAccessHandle | null = null;

        try {
            const fh = await this.getFile(path, true);

            handle = await fh.createSyncAccessHandle();

            let buffer: Uint8Array;

            if (typeof data === 'string') {
                buffer = new TextEncoder().encode(data);
            }
            else if (data instanceof ArrayBuffer) {
                buffer = new Uint8Array(data);
            }
            else {
                buffer = new Uint8Array(data);
            }

            const size = handle.getSize();

            handle.write(buffer, { at: size });
            handle.flush();
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to append to file: ${ error }`, 'APPEND_FAILED', path);
        }
        finally {
            if (handle) {
                try {
                    handle.close();
                }
                catch {
                    // Ignore close errors
                }
            }
        }
    }

    /**
     * Deletes a file
     * @param path - File path to delete
     */
    async unlink(path: string): Promise<void> {
        const normalizedPath = this.validateAndNormalizePath(path);

        if (!normalizedPath) {
            throw new PathError('Cannot delete root directory', path);
        }

        try {
            const parts = normalizedPath.split('/');
            const fileName = parts.pop()!;
            const dirPath = parts.join('/');
            const dir = await this.getDir(dirPath);

            await dir.removeEntry(fileName);
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }
            if ((error as any)?.name === 'NotFoundError') {
                throw new FileNotFoundError(path);
            }

            throw new OPFSError(`Failed to delete file: ${ error }`, 'DELETE_FAILED', path);
        }
    }

    /**
     * Creates a directory
     * @param path - Directory path to create
     * @param options - Creation options
     */
    async mkdir(
        path: string,
        options?: { recursive?: boolean }
    ): Promise<void> {
        try {
            if (options?.recursive) {
                await this.getDir(path, true);

                return;
            }

            const normalizedPath = this.validateAndNormalizePath(path);

            if (!normalizedPath) {
                return; // Root already exists
            }

            const parts = normalizedPath.split('/');
            const dirName = parts.pop()!;
            const parentPath = parts.join('/');
            const parentDir = await this.getDir(parentPath);

            await parentDir.getDirectoryHandle(dirName, { create: true });
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to create directory: ${ error }`, 'MKDIR_FAILED', path);
        }
    }

    /**
     * Removes a directory
     * @param path - Directory path to remove
     * @param options - Removal options
     */
    async rmdir(
        path: string,
        options?: { recursive?: boolean }
    ): Promise<void> {
        const normalizedPath = this.validateAndNormalizePath(path);

        if (!normalizedPath) {
            throw new PathError('Cannot delete root directory', path);
        }

        try {
            const parts = normalizedPath.split('/');
            const dirName = parts.pop()!;
            const parentPath = parts.join('/');
            const parentDir = await this.getDir(parentPath);

            await parentDir.removeEntry(dirName, options?.recursive ? { recursive: options.recursive } : undefined);
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }
            if ((error as any)?.name === 'NotFoundError') {
                throw new DirectoryNotFoundError(path);
            }

            throw new OPFSError(`Failed to remove directory: ${ error }`, 'RMDIR_FAILED', path);
        }
    }

    /**
     * Lists contents of a directory
     * @param path - Directory path to list
     * @returns Array of entry names
     */
    async readdir(path: string): Promise<string[]> {
        try {
            const dir = await this.getDir(path);
            const entries: string[] = [];

            for await (const [name] of dir.entries()) {
                entries.push(name);
            }

            return entries.sort();
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to read directory: ${ error }`, 'READDIR_FAILED', path);
        }
    }

    /**
     * Gets file or directory statistics
     * @param path - Path to get stats for
     * @returns Stats object
     */
    async stat(path: string): Promise<Stats> {
        try {
            // Try as file first
            const fh = await this.getFile(path);
            const file = await fh.getFile();

            return {
                isFile: () => true,
                isDirectory: () => false,
                size: file.size,
                mtime: file.lastModified ? new Date(file.lastModified) : new Date(),
            };
        }
        catch (fileError) {
            try {
                // Try as directory
                await this.getDir(path);

                return {
                    isFile: () => false,
                    isDirectory: () => true,
                    size: 0,
                    mtime: new Date(),
                };
            }
            catch (dirError) {
                // Neither file nor directory found
                if (fileError instanceof FileNotFoundError || dirError instanceof DirectoryNotFoundError) {
                    throw new FileNotFoundError(path);
                }

                throw fileError instanceof OPFSError ? fileError : dirError;
            }
        }
    }

    /**
     * Recursively copies a directory
     * @param src - Source directory path
     * @param dest - Destination directory path
     */
    private async copyDir(src: string, dest: string): Promise<void> {
        await this.mkdir(dest, { recursive: true });
        const entries = await this.readdir(src);

        for (const name of entries) {
            const srcPath = this.join(src, name);
            const destPath = this.join(dest, name);
            const stats = await this.stat(srcPath);

            if (stats.isDirectory()) {
                await this.copyDir(srcPath, destPath);
            }
            else {
                const content = await this.readFile(srcPath, { encoding: 'binary' }) as Uint8Array;

                await this.writeFile(destPath, content);
            }
        }
    }

    /**
     * Renames/moves a file or directory
     * @param oldPath - Current path
     * @param newPath - New path
     */
    async rename(oldPath: string, newPath: string): Promise<void> {
        try {
            const stats = await this.stat(oldPath);

            if (stats.isDirectory()) {
                await this.copyDir(oldPath, newPath);
                await this.rmdir(oldPath, { recursive: true });
            }
            else {
                const data = await this.readFile(oldPath, { encoding: 'binary' }) as Uint8Array;

                await this.writeFile(newPath, data);
                await this.unlink(oldPath);
            }
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to rename: ${ error }`, 'RENAME_FAILED', oldPath);
        }
    }

    /**
     * Uploads multiple files to a target directory
     * @param files - Files to upload
     * @param targetDir - Target directory path
     * @param onProgress - Optional progress callback
     */
    async uploadFiles(
        files: File[] | FileList,
        targetDir: string,
        onProgress?: (completed: number, total: number, currentFile: string) => void
    ): Promise<void> {
        const fileList = Array.from(files);
        let completed = 0;

        try {
            await this.mkdir(targetDir, { recursive: true });

            for (const file of fileList) {
                const relativePath = (file as any).webkitRelativePath || file.name;
                const filePath = this.join(targetDir, relativePath);

                // Create directory structure if needed
                const normalizedPath = this.validateAndNormalizePath(filePath);
                const pathParts = normalizedPath.split('/');

                if (pathParts.length > 1) {
                    const dirPath = pathParts.slice(0, -1).join('/');

                    await this.mkdir(dirPath, { recursive: true });
                }

                const buffer = new Uint8Array(await file.arrayBuffer());

                await this.writeFile(filePath, buffer);

                completed++;
                onProgress?.(completed, fileList.length, filePath);
            }
        }
        catch (error) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw new OPFSError(`Failed to upload files: ${ error }`, 'UPLOAD_FAILED');
        }
    }
}

// Create instance and expose methods
const fs = new OPFSFileSystem();

expose(fs);
