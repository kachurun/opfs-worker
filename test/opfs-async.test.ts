import { promises as fsp } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { OPFSAsync } from '../src/core/OPFSAsync';
import { createOPFSAsync } from '../src/index.async';
import { OPFSError } from '../src/utils/errors';

const rootDir = (globalThis as any).__OPFS_ROOT__ as string;

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (data: Uint8Array) => new TextDecoder().decode(data);

describe('OPFSAsync', () => {
  let fs: OPFSAsync;

  beforeEach(async () => {
    await fsp.rm(rootDir, { recursive: true, force: true });
    await fsp.mkdir(rootDir, { recursive: true });
    fs = new OPFSAsync({ root: '/' });
    await fs.setOptions({ root: '/' });
  });

  afterEach(async () => {
    await fs.clear('/');
    fs.dispose();
  });

  describe('high-level I/O', () => {
    it('writes and reads a file', async () => {
      await fs.writeFile('/hello.txt', enc('привет'));
      const data = await fs.readFile('/hello.txt');

      expect(dec(data)).toBe('привет');
    });

    it('writes binary data', async () => {
      const payload = new Uint8Array([0, 1, 2, 255]);

      await fs.writeFile('/blob.bin', payload);
      await expect(fs.readFile('/blob.bin')).resolves.toEqual(payload);
    });

    it('overwrite truncates previous content', async () => {
      await fs.writeFile('/t.txt', enc('longer content'));
      await fs.writeFile('/t.txt', enc('short'));

      expect(dec(await fs.readFile('/t.txt'))).toBe('short');
    });

    it('appends to an existing file', async () => {
      await fs.writeFile('/a.txt', enc('foo'));
      await fs.appendFile('/a.txt', enc('bar'));

      expect(dec(await fs.readFile('/a.txt'))).toBe('foobar');
    });

    it('append creates the file when missing', async () => {
      await fs.appendFile('/new.txt', enc('start'));

      expect(dec(await fs.readFile('/new.txt'))).toBe('start');
    });

    it('writes streams in chunks and reports progress', async () => {
      const progress: number[] = [];
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc('hello '));
          controller.enqueue(enc('world'));
          controller.close();
        },
      });

      await expect(fs.writeStream('/stream.txt', stream, bytes => progress.push(bytes))).resolves.toBe(11);
      expect(dec(await fs.readFile('/stream.txt'))).toBe('hello world');
      expect(progress).toEqual([6, 11]);
    });

    it('creates parent directories on write', async () => {
      await fs.writeFile('/deep/nested/file.txt', enc('x'));

      expect(await fs.exists('/deep/nested/file.txt')).toBe(true);
    });

    it('readFile of a missing file throws ENOENT', async () => {
      await expect(fs.readFile('/nope.txt')).rejects.toMatchObject({ name: 'ENOENT' });
    });

    it('readFile of a directory throws EISDIR', async () => {
      await fs.mkdir('/dir');
      await expect(fs.readFile('/dir')).rejects.toMatchObject({ name: 'EISDIR' });
    });
  });

  describe('shared BaseOPFS operations', () => {
    it('mkdir / stat / readDir / exists', async () => {
      await fs.mkdir('/d/e', { recursive: true });
      await fs.writeFile('/d/e/f.txt', enc('x'));

      expect(await fs.exists('/d/e/f.txt')).toBe(true);

      const stat = await fs.stat('/d/e/f.txt');
      expect(stat.isFile).toBe(true);
      expect(stat.size).toBe(1);

      const entries = await fs.readDir('/d/e');
      expect(entries.some(e => e.name === 'f.txt' && e.isFile)).toBe(true);
    });

    it('copy / rename / remove', async () => {
      await fs.writeFile('/src.txt', enc('data'));

      await fs.copy('/src.txt', '/copy.txt');
      expect(dec(await fs.readFile('/copy.txt'))).toBe('data');

      await fs.rename('/copy.txt', '/renamed.txt');
      expect(await fs.exists('/renamed.txt')).toBe(true);
      expect(await fs.exists('/copy.txt')).toBe(false);

      await fs.remove('/renamed.txt');
      expect(await fs.exists('/renamed.txt')).toBe(false);
    });

    it('index / importFiles / clear', async () => {
      await fs.importFiles([
        ['/config.json', '{}'],
        ['/data/bin.dat', new Uint8Array([1, 2])],
      ]);

      const index = await fs.index();
      expect(index.has('/config.json')).toBe(true);
      expect(index.has('/data/bin.dat')).toBe(true);

      await fs.clear('/');
      expect(await fs.exists('/config.json')).toBe(false);
    });

    it('emits watch events over BroadcastChannel', async () => {
      const channel = new BroadcastChannel('opfs-worker');
      const events: any[] = [];

      channel.onmessage = e => events.push(e.data);

      await fs.watch('/');
      await fs.writeFile('/w.txt', enc('x'));
      await new Promise(r => setTimeout(r, 15));

      expect(events.some(e => e.path === '/w.txt' && e.type === 'added')).toBe(true);

      fs.unwatch('/');
      channel.close();
    });
  });

  describe('file descriptors are not supported', () => {
    it.each([
      ['open', () => fs.open('/x.txt', { create: true })],
      ['close', () => fs.close(1)],
      ['read', () => fs.read(1, new Uint8Array(1), 0, 1, 0)],
      ['write', () => fs.write(1, new Uint8Array(1))],
      ['fstat', () => fs.fstat(1)],
      ['ftruncate', () => fs.ftruncate(1, 0)],
      ['fsync', () => fs.fsync(1)],
    ])('%s throws ENOTSUP', async (_name, call) => {
      const error = await call().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OPFSError);
      expect((error as OPFSError).name).toBe('ENOTSUP');
    });
  });
});

describe('createOPFSAsync (facade over OPFSAsync)', () => {
  beforeEach(async () => {
    await fsp.rm(rootDir, { recursive: true, force: true });
    await fsp.mkdir(rootDir, { recursive: true });
  });

  it('provides the Node-like facade API without a worker', async () => {
    const fs = createOPFSAsync({ root: '/' });

    await fs.writeFile('/note.txt', 'hello', 'utf-8');
    await fs.appendText('/note.txt', '!');
    await expect(fs.readFile('/note.txt', 'utf-8')).resolves.toBe('hello!');

    const progress: number[] = [];
    await expect(fs.importStream('/blob.bin', new Blob([new Uint8Array([1, 2, 3])]), {
      onProgress: bytes => progress.push(bytes),
    })).resolves.toBe(3);
    await expect(fs.readFile('/blob.bin', 'binary')).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(progress).toEqual([3]);

    await fs.mkdir('/dir');
    expect(await fs.exists('/dir')).toBe(true);

    fs.dispose();
  });

  it('facade FD methods reject with ENOTSUP', async () => {
    const fs = createOPFSAsync({ root: '/' });

    await expect(fs.open('/x.txt', { create: true })).rejects.toMatchObject({ name: 'ENOTSUP' });

    fs.dispose();
  });
});
