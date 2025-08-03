import { mkdtempSync, promises as fsp, openSync, fstatSync, readSync, writeSync, ftruncateSync, fsyncSync, closeSync } from 'node:fs';
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
    return new File([data], path.basename(this.path), { lastModified: stat.mtimeMs });
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
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        if (opts.create) {
          await fsp.mkdir(dirPath);
        } else {
          throw notFound();
        }
      } else {
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
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        if (opts.create) {
          await fsp.writeFile(filePath, new Uint8Array());
        } else {
          throw notFound();
        }
      } else {
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
      } else {
        await fsp.rm(target);
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw notFound();
      }
      throw err;
    }
  }
  async *entries(): AsyncIterableIterator<[string, NodeDirectoryHandle | NodeFileHandle]> {
    const dirents = await fsp.readdir(this.path, { withFileTypes: true });
    for (const dirent of dirents) {
      const full = path.join(this.path, dirent.name);
      yield dirent.isDirectory() ? [dirent.name, new NodeDirectoryHandle(full)] : [dirent.name, new NodeFileHandle(full)];
    }
  }
}

const rootDir = mkdtempSync(path.join(tmpdir(), 'opfs-worker-'));

(globalThis as any).__OPFS_ROOT__ = rootDir;
(globalThis as any).navigator = {
  storage: {
    getDirectory: async () => new NodeDirectoryHandle(rootDir)
  }
} as any;

export {}
