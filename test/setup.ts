import { closeSync, fstatSync, fsyncSync, ftruncateSync, mkdtempSync, openSync, promises as fsp, readSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function notFound(): any {
    const err: any = new Error('NotFound');

    err.name = 'NotFoundError';

    return err;
}

function typeMismatch(): any {
    const err: any = new Error('TypeMismatch');

    err.name = 'TypeMismatchError';

    return err;
}

/** Tracks open sync handles per absolute path — mirrors OPFS "one handle at a time" */
const openSyncHandles = new Set<string>();

function noModificationAllowed(): any {
    const err: any = new Error('NoModificationAllowedError');

    err.name = 'NoModificationAllowedError';

    return err;
}

class NodeSyncAccessHandle {
    private fd: number;
    private closed = false;

    constructor(private filePath: string) {
        this.fd = openSync(this.filePath, 'r+');
    }

    getSize(): number {
        return fstatSync(this.fd).size;
    }

    read(buffer: Uint8Array, opts: { at?: number } = {}): number {
        return readSync(this.fd, buffer, 0, buffer.length, opts.at ?? 0);
    }

    write(buffer: Uint8Array, opts: { at?: number } = {}): number {
        return writeSync(this.fd, buffer, 0, buffer.length, opts.at ?? 0);
    }

    truncate(size: number): void {
        ftruncateSync(this.fd, size);
    }

    flush(): void {
        fsyncSync(this.fd);
    }

    close(): void {
        if (this.closed) {
            return;
        }

        this.closed = true;
        closeSync(this.fd);
        openSyncHandles.delete(this.filePath);
    }
}

function toUint8(data: unknown): Uint8Array {
    if (typeof data === 'string') {
        return new TextEncoder().encode(data);
    }

    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }

    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }

    throw new TypeError('Unsupported write chunk');
}

/** Minimal FileSystemWritableFileStream mock with swap-file semantics (commit on close) */
class NodeWritableFileStream {
    private data: Uint8Array;
    private position = 0;
    private closed = false;

    constructor(private filePath: string, initial: Uint8Array) {
        this.data = initial;
    }

    private writeAt(chunk: Uint8Array, at: number): void {
        if (at + chunk.length > this.data.length) {
            const grown = new Uint8Array(at + chunk.length);

            grown.set(this.data);
            this.data = grown;
        }

        this.data.set(chunk, at);
        this.position = at + chunk.length;
    }

    async write(chunk: any): Promise<void> {
        if (this.closed) {
            throw new TypeError('Stream is closed');
        }

        // WriteParams object: { type: 'write' | 'seek' | 'truncate', ... }
        if (chunk && typeof chunk === 'object' && !ArrayBuffer.isView(chunk) && !(chunk instanceof ArrayBuffer) && 'type' in chunk) {
            if (chunk.type === 'write') {
                this.writeAt(toUint8(chunk.data), chunk.position ?? this.position);
            }
            else if (chunk.type === 'seek') {
                this.position = chunk.position;
            }
            else if (chunk.type === 'truncate') {
                await this.truncate(chunk.size);
            }

            return;
        }

        this.writeAt(toUint8(chunk), this.position);
    }

    async seek(position: number): Promise<void> {
        this.position = position;
    }

    async truncate(size: number): Promise<void> {
        const resized = new Uint8Array(size);

        resized.set(this.data.subarray(0, Math.min(size, this.data.length)));
        this.data = resized;

        if (this.position > size) {
            this.position = size;
        }
    }

    async close(): Promise<void> {
        if (this.closed) {
            return;
        }

        this.closed = true;
        await fsp.writeFile(this.filePath, this.data);
    }

    async abort(): Promise<void> {
        this.closed = true;
    }
}

class NodeFileHandle {
    kind = 'file' as const;
    constructor(public path: string) {}
    async createSyncAccessHandle(): Promise<NodeSyncAccessHandle> {
        // OPFS allows only one FileSystemSyncAccessHandle per file at a time
        if (openSyncHandles.has(this.path)) {
            throw noModificationAllowed();
        }

        openSyncHandles.add(this.path);

        return new NodeSyncAccessHandle(this.path);
    }

    async createWritable(opts: { keepExistingData?: boolean } = {}): Promise<NodeWritableFileStream> {
        // OPFS forbids createWritable while a sync access handle is open
        if (openSyncHandles.has(this.path)) {
            throw noModificationAllowed();
        }

        const initial = opts.keepExistingData
            ? new Uint8Array(await fsp.readFile(this.path))
            : new Uint8Array(0);

        return new NodeWritableFileStream(this.path, initial);
    }

    async getFile(): Promise<File> {
        const data = await fsp.readFile(this.path);
        const stat = await fsp.stat(this.path);

        return new File([new Uint8Array(data)], path.basename(this.path), { lastModified: stat.mtimeMs });
    }
}

class NodeDirectoryHandle {
    kind = 'directory' as const;
    constructor(public path: string) {}
    async getDirectoryHandle(name: string, opts: { create?: boolean } = {}): Promise<NodeDirectoryHandle> {
        const dirPath = path.join(this.path, name);

        try {
            const stat = await fsp.stat(dirPath);

            if (!stat.isDirectory()) {
                throw typeMismatch();
            }
        }
        catch (err: any) {
            if (err.code === 'ENOENT') {
                if (opts.create) {
                    await fsp.mkdir(dirPath);
                }
                else {
                    throw notFound();
                }
            }
            else {
                throw err;
            }
        }

        return new NodeDirectoryHandle(dirPath);
    }

    async getFileHandle(name: string, opts: { create?: boolean } = {}): Promise<NodeFileHandle> {
        const filePath = path.join(this.path, name);

        try {
            const stat = await fsp.stat(filePath);

            if (stat.isDirectory()) {
                throw typeMismatch();
            }
        }
        catch (err: any) {
            if (err.code === 'ENOENT') {
                if (opts.create) {
                    await fsp.writeFile(filePath, new Uint8Array());
                }
                else {
                    throw notFound();
                }
            }
            else {
                throw err;
            }
        }

        return new NodeFileHandle(filePath);
    }

    async removeEntry(name: string, opts: { recursive?: boolean } = {}): Promise<void> {
        const target = path.join(this.path, name);

        try {
            const stat = await fsp.stat(target);

            if (stat.isDirectory()) {
                if (!opts.recursive) {
                    throw typeMismatch();
                }

                await fsp.rm(target, { recursive: true, force: true });
            }
            else {
                await fsp.rm(target);
            }
        }
        catch (err: any) {
            if (err.code === 'ENOENT') {
                throw notFound();
            }

            throw err;
        }
    }

    async* entries(): AsyncIterableIterator<[string, NodeDirectoryHandle | NodeFileHandle]> {
        const dirents = await fsp.readdir(this.path, { withFileTypes: true });

        for (const dirent of dirents) {
            const full = path.join(this.path, dirent.name);

            yield dirent.isDirectory() ? [dirent.name, new NodeDirectoryHandle(full)] : [dirent.name, new NodeFileHandle(full)];
        }
    }
}

const rootDir = mkdtempSync(path.join(tmpdir(), 'opfs-worker-'));

(globalThis as any).__OPFS_ROOT__ = rootDir;

Object.defineProperty(globalThis, 'navigator', {
    value: {
        storage: {
            getDirectory: async() => new NodeDirectoryHandle(rootDir),
        },
        // Web Locks API mock: shared locks run concurrently; exclusive locks serialize per name
        locks: (() => {
            type Waiter = { mode: 'shared' | 'exclusive'; resolve: () => void };

            const holders = new Map<string, { shared: number; exclusive: boolean }>();
            const waiters = new Map<string, Waiter[]>();

            function getState(name: string) {
                if (!holders.has(name)) {
                    holders.set(name, { shared: 0, exclusive: false });
                }

                return holders.get(name)!;
            }

            function tryGrant(name: string) {
                const queue = waiters.get(name);

                if (!queue || queue.length === 0) {
                    return;
                }

                const state = getState(name);

                while (queue.length > 0) {
                    const head = queue[0]!;

                    if (head.mode === 'exclusive') {
                        if (state.shared === 0 && !state.exclusive) {
                            queue.shift();
                            state.exclusive = true;
                            head.resolve();
                        }
                        break;
                    }

                    if (!state.exclusive) {
                        queue.shift();
                        state.shared++;
                        head.resolve();

                        continue;
                    }
                    break;
                }
            }

            return {
                request: async <T>(
                    name: string,
                    options: { mode?: 'shared' | 'exclusive' },
                    callback: () => Promise<T>
                ): Promise<T> => {
                    const mode = options.mode ?? 'exclusive';
                    const state = getState(name);

                    const canGrantImmediately = mode === 'exclusive'
                        ? state.shared === 0 && !state.exclusive
                        : !state.exclusive;

                    if (!canGrantImmediately) {
                        await new Promise<void>((resolve) => {
                            if (!waiters.has(name)) {
                                waiters.set(name, []);
                            }

                            waiters.get(name)!.push({ mode, resolve });
                        });
                    }
                    else if (mode === 'exclusive') {
                        state.exclusive = true;
                    }
                    else {
                        state.shared++;
                    }

                    try {
                        return await callback();
                    }
                    finally {
                        if (mode === 'exclusive') {
                            state.exclusive = false;
                        }
                        else {
                            state.shared = Math.max(0, state.shared - 1);
                        }

                        tryGrant(name);
                    }
                },
            };
        })(),
    },
    writable: true,
    configurable: true,
});

// Mock BroadcastChannel for Node.js environment
const channels = new Map<string, MockBroadcastChannel[]>();

class MockBroadcastChannel {
    private listeners: Array<(event: any) => void> = [];
    private _onmessage: ((event: any) => void) | null = null;

    constructor(public name: string) {
        if (!channels.has(this.name)) {
            channels.set(this.name, []);
        }

        channels.get(this.name)!.push(this);
    }

    postMessage(message: any): void {
    // Send message to all other channels with the same name
        const channelList = channels.get(this.name) || [];
        const event = { data: message };

        // Simulate immediate message delivery to other listeners
        setTimeout(() => {
            channelList.forEach((channel) => {
                if (channel !== this) {
                    channel.listeners.forEach((listener) => {
                        listener(event);
                    });
                    if (channel._onmessage) {
                        channel._onmessage(event);
                    }
                }
            });
        }, 0);
    }

    addEventListener(type: string, listener: (event: any) => void): void {
        if (type === 'message') {
            this.listeners.push(listener);
        }
    }

    removeEventListener(type: string, listener: (event: any) => void): void {
        if (type === 'message') {
            const index = this.listeners.indexOf(listener);

            if (index > -1) {
                this.listeners.splice(index, 1);
            }
        }
    }

    get onmessage(): ((event: any) => void) | null {
        return this._onmessage;
    }

    set onmessage(value: ((event: any) => void) | null) {
        this._onmessage = value;
    }

    close(): void {
        const channelList = channels.get(this.name) || [];
        const index = channelList.indexOf(this);

        if (index > -1) {
            channelList.splice(index, 1);
        }
        if (channelList.length === 0) {
            channels.delete(this.name);
        }

        this.listeners = [];
        this._onmessage = null;
    }
}

Object.defineProperty(globalThis, 'BroadcastChannel', {
    value: MockBroadcastChannel,
    writable: true,
    configurable: true,
});

export {};
