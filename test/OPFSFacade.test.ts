import { promises as fsp } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createOPFSWorker } from '../src/createOPFSWorker';
import { OPFSFacade } from '../src/OPFSFacade';
import { OPFSWorker } from '../src/OPFSWorker';

import type { RawWorker } from '../src/createOPFSWorker';
import type { RemoteOPFSWorker } from '../src/types';

vi.mock('../src/createOPFSWorker', () => ({
  createOPFSWorker: vi.fn(),
}));

const rootDir = (globalThis as any).__OPFS_ROOT__ as string;

function rawWorkerFor(worker: OPFSWorker, terminate: () => void): RawWorker {
  return {
    fs: worker as unknown as RemoteOPFSWorker,
    worker: { terminate } as unknown as Worker,
    dispose() {
      void worker.dispose();
      terminate();
    },
  };
}

function createFacade(options?: ConstructorParameters<typeof OPFSFacade>[0]) {
  const worker = new OPFSWorker(options ?? { root: '/' });
  const terminate = vi.fn();
  const raw = rawWorkerFor(worker, terminate);

  vi.mocked(createOPFSWorker).mockReturnValue(raw);

  const fs = new OPFSFacade(options);

  return { fs, worker, terminate };
}

describe('OPFSFacade', () => {
  let fs: OPFSFacade;
  let terminate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await fsp.rm(rootDir, { recursive: true, force: true });
    await fsp.mkdir(rootDir, { recursive: true });
    ({ fs, terminate } = createFacade({ root: '/' }));
    // Allow async setOptions from constructor to settle
    await fs.setOptions({ root: '/' });
  });

  afterEach(async () => {
    await fs.clear('/');
    fs.dispose();
    vi.mocked(createOPFSWorker).mockReset();
  });

  it('exposes promises alias to itself', () => {
    expect(fs.promises).toBe(fs);
  });

  it('forwards options to createOPFSWorker', () => {
    const channel = new BroadcastChannel('facade-bc');

    createFacade({ root: '/', broadcastChannel: channel });

    expect(createOPFSWorker).toHaveBeenCalledWith(
      expect.objectContaining({ root: '/', broadcastChannel: channel })
    );

    channel.close();
  });

  describe('path normalization', () => {
    it('accepts URL paths', async () => {
      await fs.writeFile(new URL('file:///hello.txt'), 'hi', 'utf-8');
      const text = await fs.readFile(new URL('file:///hello.txt'), 'utf-8');

      expect(text).toBe('hi');
    });
  });

  describe('readFile / writeFile encoding', () => {
    it('writes and reads utf-8 strings', async () => {
      await fs.writeFile('/a.txt', 'привет', 'utf-8');
      await expect(fs.readFile('/a.txt', 'utf-8')).resolves.toBe('привет');
    });

    it('accepts encoding via options object', async () => {
      await fs.writeFile('/b.txt', 'opts', { encoding: 'utf-8' });
      await expect(fs.readFile('/b.txt', { encoding: 'utf-8' })).resolves.toBe('opts');
    });

    it('auto-detects text vs binary by extension', async () => {
      await fs.writeFile('/note.txt', 'text');
      await fs.writeFile('/blob.bin', new Uint8Array([1, 2, 3]));

      await expect(fs.readFile('/note.txt')).resolves.toBe('text');
      await expect(fs.readFile('/blob.bin')).resolves.toEqual(new Uint8Array([1, 2, 3]));
    });

    it('writes ArrayBuffer data', async () => {
      const buf = new Uint8Array([9, 8, 7]).buffer;

      await fs.writeFile('/ab.bin', buf);
      await expect(fs.readFile('/ab.bin', 'binary')).resolves.toEqual(new Uint8Array([9, 8, 7]));
    });
  });

  describe('append / text helpers', () => {
    it('appends string and binary', async () => {
      await fs.writeFile('/app.txt', 'a', 'utf-8');
      await fs.appendFile('/app.txt', 'b', 'utf-8');
      await expect(fs.readFile('/app.txt', 'utf-8')).resolves.toBe('ab');

      await fs.writeFile('/app.bin', new Uint8Array([1]));
      await fs.appendFile('/app.bin', new Uint8Array([2]));
      await expect(fs.readFile('/app.bin', 'binary')).resolves.toEqual(new Uint8Array([1, 2]));
    });

    it('readText / writeText / appendText', async () => {
      await fs.writeText('/t.txt', 'hello');
      await fs.appendText('/t.txt', '!');
      await expect(fs.readText('/t.txt')).resolves.toBe('hello!');
    });
  });

  describe('fs helpers and aliases', () => {
    it('mkdir / readDir / exists / stat / lstat', async () => {
      await fs.mkdir('/d/e', { recursive: true });
      await fs.writeFile('/d/e/f.txt', 'x', 'utf-8');

      expect(await fs.exists('/d/e/f.txt')).toBe(true);
      expect(await fs.exists('/nope')).toBe(false);

      const entries = await fs.readDir('/d/e');
      expect(entries.some(e => e.name === 'f.txt' && e.isFile)).toBe(true);
      await expect(fs.readdir('/d/e')).resolves.toEqual(entries);

      const stat = await fs.stat('/d/e/f.txt');
      expect(stat.isFile).toBe(true);
      await expect(fs.lstat('/d/e/f.txt')).resolves.toEqual(stat);
    });

    it('treats numeric mkdir mode as non-recursive options', async () => {
      await fs.mkdir('/solo', 0o755);
      expect(await fs.exists('/solo')).toBe(true);
    });

    it('remove aliases: unlink / rm / rmdir', async () => {
      await fs.writeFile('/u.txt', '1', 'utf-8');
      await fs.unlink('/u.txt');
      expect(await fs.exists('/u.txt')).toBe(false);

      await fs.writeFile('/r.txt', '1', 'utf-8');
      await fs.rm('/r.txt');
      expect(await fs.exists('/r.txt')).toBe(false);

      const removeSpy = vi.spyOn(fs, 'remove').mockResolvedValue(undefined);

      await fs.rmdir('/empty');
      expect(removeSpy).toHaveBeenCalledWith('/empty');
      removeSpy.mockRestore();
    });

    it('chmod is a no-op', async () => {
      await expect(fs.chmod('/anything', 0o777)).resolves.toBeUndefined();
    });

    it('realpath / rename / copy / index / clear / createIndex', async () => {
      await fs.writeFile('/src.txt', 'data', 'utf-8');
      await expect(fs.realpath('./src.txt')).resolves.toBe('/src.txt');

      await fs.copy('/src.txt', '/copy.txt');
      await expect(fs.readFile('/copy.txt', 'utf-8')).resolves.toBe('data');

      await fs.rename('/copy.txt', '/renamed.txt');
      expect(await fs.exists('/renamed.txt')).toBe(true);
      expect(await fs.exists('/copy.txt')).toBe(false);

      const index = await fs.index();
      expect(index.has('/src.txt')).toBe(true);

      await fs.createIndex([['/from-index.txt', 'idx']]);
      await expect(fs.readFile('/from-index.txt', 'utf-8')).resolves.toBe('idx');

      await fs.clear('/');
      expect(await fs.exists('/src.txt')).toBe(false);
    });
  });

  describe('file descriptors via facade', () => {
    it('open / write / read / fstat / ftruncate / fsync / close', async () => {
      const fd = await fs.open('/fd.txt', { create: true });
      const payload = new TextEncoder().encode('Hello');

      expect(await fs.write(fd, payload)).toBe(5);
      await fs.fsync(fd);

      const stats = await fs.fstat(fd);
      expect(stats.size).toBe(5);

      const buffer = new Uint8Array(10);
      const { bytesRead } = await fs.read(fd, buffer, 0, 5, 0);

      expect(bytesRead).toBe(5);
      expect(new TextDecoder().decode(buffer.subarray(0, 5))).toBe('Hello');

      await fs.ftruncate(fd, 2);
      expect((await fs.fstat(fd)).size).toBe(2);

      await fs.close(fd);
    });
  });

  describe('watch', () => {
    it('watch returns an unwatch function', async () => {
      const channel = new BroadcastChannel('opfs-worker');
      const events: unknown[] = [];

      channel.onmessage = (e) => events.push(e.data);
      await fs.setOptions({ root: '/', broadcastChannel: 'opfs-worker' });

      const stop = fs.watch('/');

      await fs.writeFile('/w.txt', 'x', 'utf-8');
      await new Promise(r => setTimeout(r, 15));
      expect(events.length).toBeGreaterThan(0);

      stop();
      channel.close();
    });
  });

  describe('dispose', () => {
    it('disposes the worker and terminates the instance', async () => {
      const { fs: local, worker, terminate: term } = createFacade({ root: '/' });
      const disposeSpy = vi.spyOn(worker, 'dispose');

      local.dispose();
      await vi.waitFor(() => expect(disposeSpy).toHaveBeenCalled());
      await vi.waitFor(() => expect(term).toHaveBeenCalled());
    });
  });
});
