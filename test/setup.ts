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

class NodeSyncAccessHandle {
    private fd: number;
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
        closeSync(this.fd);
    }
}

class NodeFileHandle {
    kind = 'file' as const;
    constructor(public path: string) {}
    async createSyncAccessHandle(): Promise<NodeSyncAccessHandle> {
        return new NodeSyncAccessHandle(this.path);
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

// Mock navigator.storage.getDirectory for Node.js environment
Object.defineProperty(globalThis, 'navigator', {
    value: {
        storage: {
            getDirectory: async() => new NodeDirectoryHandle(rootDir),
        },
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
