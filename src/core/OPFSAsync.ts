import { transfer } from 'comlink';

import { BaseOPFS } from './BaseOPFS';
import { WatchEventType } from '../types';
import { OPFSError, OperationNotSupportedError, mapDomError } from '../utils/errors';

import type { FileOpenOptions, FileStat } from '../types';

const FD_UNSUPPORTED = 'file descriptors are not available in the async backend, use the dedicated worker backend (`createOPFSDedicated`) for positional I/O';

/**
 * Async OPFS backend using the promise-based File System API
 * (`getFile()` / `createWritable()`).
 *
 * Unlike `OPFSSync`, it does not require a dedicated worker: it works on the
 * main thread and inside any worker type (including SharedWorker).
 *
 * Requirements and limitations:
 * - Writing needs `FileSystemFileHandle.createWritable()` — Chrome, Firefox, Safari 26+.
 *   Reading works in older Safari too.
 * - No file descriptors / positional I/O: `open`, `read`, `write`, `close`,
 *   `fstat`, `ftruncate` and `fsync` always throw `OperationNotSupportedError`.
 *
 * @example
 * ```typescript
 * import { OPFSAsync } from 'opfs-worker/pure';
 * // or: 'opfs-worker' / 'opfs-worker/async'
 *
 * const fs = new OPFSAsync({ root: '/my-app' });
 * await fs.writeFile('/config.json', new TextEncoder().encode('{}'));
 * const config = await fs.readFile('/config.json');
 * ```
 */
export class OPFSAsync extends BaseOPFS {
    async readFile(path: string): Promise<Uint8Array> {
        await this.mount();

        try {
            return await this.withPathLock(path, async() => {
                const fileHandle = await this.getFileHandle(path, false);
                const file = await fileHandle.getFile();
                const buffer = new Uint8Array(await file.arrayBuffer());

                return transfer(buffer, [buffer.buffer]);
            });
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw mapDomError(error, { path, isDirectory: error?.name === 'TypeMismatchError' });
        }
    }

    async writeFile(
        path: string,
        data: Uint8Array | ArrayBuffer
    ): Promise<void> {
        await this.mount();

        const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);

        try {
            await this.withPathLock(path, async() => {
                const existed = await this.exists(path);
                const fileHandle = await this.getFileHandle(path, true);

                // Default createWritable() starts from an empty swap file,
                // so close() atomically replaces the content (truncate + write).
                await this._writeStream(fileHandle, async writable => writable.write(buffer as Uint8Array<ArrayBuffer>));

                await this.notifyChange({ path, type: existed ? WatchEventType.Changed : WatchEventType.Added, isDirectory: false });
            });
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw mapDomError(error, { path, isDirectory: error?.name === 'TypeMismatchError' });
        }
    }

    async appendFile(
        path: string,
        data: Uint8Array | ArrayBuffer
    ): Promise<void> {
        await this.mount();

        const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);

        try {
            await this.withPathLock(path, async() => {
                const fileHandle = await this.getFileHandle(path, true);
                const { size } = await fileHandle.getFile();

                await this._writeStream(
                    fileHandle,
                    async writable => writable.write({ type: 'write', position: size, data: buffer as Uint8Array<ArrayBuffer> }),
                    { keepExistingData: true }
                );

                await this.notifyChange({ path, type: WatchEventType.Changed, isDirectory: false });
            });
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw mapDomError(error, { path, isDirectory: error?.name === 'TypeMismatchError' });
        }
    }

    async writeStream(
        path: string,
        stream: ReadableStream<Uint8Array>,
        onProgress?: (bytesWritten: number) => unknown
    ): Promise<number> {
        await this.mount();

        try {
            return await this.withPathLock(path, async() => {
                const existed = await this.exists(path);
                const fileHandle = await this.getFileHandle(path, true);
                const reader = stream.getReader();
                let totalBytes = 0;

                try {
                    await this._writeStream(fileHandle, async(writable) => {
                        while (true) {
                            const { done, value: chunk } = await reader.read();

                            if (done) {
                                break;
                            }

                            await writable.write(chunk as Uint8Array<ArrayBuffer>);
                            totalBytes += chunk.byteLength;
                            await onProgress?.(totalBytes);
                        }
                    });
                }
                catch (error) {
                    await reader.cancel(error).catch(() => {});

                    throw error;
                }
                finally {
                    reader.releaseLock();
                }

                await this.notifyChange({
                    path,
                    type: existed ? WatchEventType.Changed : WatchEventType.Added,
                    isDirectory: false,
                });

                return totalBytes;
            });
        }
        catch (error: any) {
            if (error instanceof OPFSError) {
                throw error;
            }

            throw mapDomError(error, { path, isDirectory: error?.name === 'TypeMismatchError' });
        }
    }

    /**
     * Open a writable stream, run the write callback and commit via close().
     * Aborts the stream (discarding the swap file) if the callback fails.
     * @private
     */
    private async _writeStream(
        fileHandle: FileSystemFileHandle,
        write: (writable: FileSystemWritableFileStream) => Promise<void>,
        options?: { keepExistingData?: boolean }
    ): Promise<void> {
        if (typeof fileHandle.createWritable !== 'function') {
            throw new OperationNotSupportedError('createWritable() is not available in this browser (Safari supports it since version 26), use the dedicated worker backend (`createOPFSDedicated`) instead');
        }

        const writable = await fileHandle.createWritable(options);

        try {
            await write(writable);
        }
        catch (error) {
            await writable.abort().catch(() => {});

            throw error;
        }

        await writable.close();
    }

    /** @throws {OperationNotSupportedError} Always — no FD support in the async backend */
    async open(_path: string, _options?: FileOpenOptions): Promise<number> {
        throw new OperationNotSupportedError(FD_UNSUPPORTED);
    }

    /** @throws {OperationNotSupportedError} Always — no FD support in the async backend */
    async close(_fd: number): Promise<void> {
        throw new OperationNotSupportedError(FD_UNSUPPORTED);
    }

    /** @throws {OperationNotSupportedError} Always — no FD support in the async backend */
    async read(
        _fd: number,
        _buffer: Uint8Array,
        _offset: number,
        _length: number,
        _position: number | null | undefined
    ): Promise<{ bytesRead: number; buffer: Uint8Array }> {
        throw new OperationNotSupportedError(FD_UNSUPPORTED);
    }

    /** @throws {OperationNotSupportedError} Always — no FD support in the async backend */
    async write(
        _fd: number,
        _buffer: Uint8Array,
        _offset?: number,
        _length?: number,
        _position?: number | null | undefined,
        _emitEvent?: boolean
    ): Promise<number> {
        throw new OperationNotSupportedError(FD_UNSUPPORTED);
    }

    /** @throws {OperationNotSupportedError} Always — no FD support in the async backend */
    async fstat(_fd: number): Promise<FileStat> {
        throw new OperationNotSupportedError(FD_UNSUPPORTED);
    }

    /** @throws {OperationNotSupportedError} Always — no FD support in the async backend */
    async ftruncate(_fd: number, _size?: number): Promise<void> {
        throw new OperationNotSupportedError(FD_UNSUPPORTED);
    }

    /** @throws {OperationNotSupportedError} Always — no FD support in the async backend */
    async fsync(_fd: number): Promise<void> {
        throw new OperationNotSupportedError(FD_UNSUPPORTED);
    }
}
