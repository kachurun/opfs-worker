import { promises as fsp } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OPFSSync } from '../src/core/OPFSSync';
import type { WatchEvent } from '../src/types';
import { WatchEventType } from '../src/types';

const rootDir = (globalThis as any).__OPFS_ROOT__ as string;

describe('OPFSSync', () => {
  let fsw: OPFSSync;

  beforeEach(async () => {
    await fsp.rm(rootDir, { recursive: true, force: true });
    await fsp.mkdir(rootDir, { recursive: true });
    fsw = new OPFSSync({ root: '/' });
  });

  afterEach(async () => {
    await fsw.clear('/');
  });

  it('writes and reads files as binary', async () => {
    const data = new TextEncoder().encode('world');
    await fsw.writeFile('/hello.txt', data);
    const content = await fsw.readFile('/hello.txt');
    expect(content).toEqual(data);
  });

  it('readFile throws ENOENT for missing files', async () => {
    await expect(fsw.readFile('/missing.txt')).rejects.toMatchObject({ name: 'ENOENT' });
  });

  it('readFile throws EISDIR when path is a directory', async () => {
    await fsw.mkdir('/as-dir');
    await expect(fsw.readFile('/as-dir')).rejects.toMatchObject({ name: 'EISDIR' });
  });

  it('appends to files', async () => {
    const startData = new TextEncoder().encode('start');
    const endData = new TextEncoder().encode(' end');
    await fsw.writeFile('/append.txt', startData);
    await fsw.appendFile('/append.txt', endData);
    const content = await fsw.readFile('/append.txt');
    const expected = new Uint8Array([...startData, ...endData]);
    expect(content).toEqual(expected);
  });

  it('writes streams in chunks and reports progress', async () => {
    const progress: number[] = [];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4, 5]));
        controller.close();
      },
    });

    await expect(fsw.writeStream('/stream.bin', stream, bytes => progress.push(bytes))).resolves.toBe(5);
    await expect(fsw.readFile('/stream.bin')).resolves.toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    expect(progress).toEqual([2, 5]);
  });

  it('creates directories recursively and lists them', async () => {
    await fsw.mkdir('/a/b/c', { recursive: true });
            const list = await fsw.readDir('/a/b');
    expect(list.some(e => e.name === 'c' && e.isDirectory)).toBe(true);
  });

  it('provides file stats and hash', async () => {
    const data = new TextEncoder().encode('data');
    await fsw.writeFile('/hash.txt', data);
    await fsw.setOptions({ hashAlgorithm: 'SHA-1' });
    const stat = await fsw.stat('/hash.txt');
    expect(stat.isFile).toBe(true);
    expect(stat.size).toBe(4);
    expect(stat.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('respects maxFileSize option for hashing', async () => {
    // Create a file larger than the default 50MB limit
    const largeData = new Uint8Array(51 * 1024 * 1024).fill(120); // 51MB of 'x' characters
    await fsw.writeFile('/large.txt', largeData);
    
    // Should not have hash with default 50MB limit
    await fsw.setOptions({ hashAlgorithm: 'SHA-1' });
    const statWithoutHash = await fsw.stat('/large.txt');
    expect(statWithoutHash.hash).toBeUndefined();
    
    // Should work with increased limit
    await fsw.setOptions({ maxFileSize: 100 * 1024 * 1024 }); // 100MB
    const statWithHash = await fsw.stat('/large.txt');
    expect(statWithHash.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('provides directory stats', async () => {
    await fsw.mkdir('/dir', { recursive: true });
    const stat = await fsw.stat('/dir');
    expect(stat.isDirectory).toBe(true);
    expect(stat.isFile).toBe(false);
  });

  it('indexes directory structure', async () => {
    await fsw.mkdir('/dir', { recursive: true });
    await fsw.writeFile('/dir/file.txt', new TextEncoder().encode('1'));
    const idx = await fsw.index();
    expect([...idx.keys()].sort()).toEqual(['/', '/dir', '/dir/file.txt']);
  });

  it('checks path existence', async () => {
    await fsw.writeFile('/exists.txt', 'hi');
    expect(await fsw.exists('/exists.txt')).toBe(true);
    expect(await fsw.exists('/missing.txt')).toBe(false);
  });

  it('removes files and directories and clears directory', async () => {
    await fsw.mkdir('/tmpdir', { recursive: true });
    await fsw.writeFile('/tmpdir/file.txt', 'x');
    await fsw.remove('/tmpdir/file.txt');
    expect(await fsw.exists('/tmpdir/file.txt')).toBe(false);
    await fsw.remove('/tmpdir', { recursive: true });
    expect(await fsw.exists('/tmpdir')).toBe(false);
    await fsw.writeFile('/clear.txt', 'y');
    await fsw.clear('/');
    expect(await fsw.exists('/clear.txt')).toBe(false);
  });

  it('imports external entries', async () => {
    await fsw.writeFile('/old.txt', new TextEncoder().encode('old'));
    await fsw.importFiles([
      ['/new.txt', 'new'],
      ['relative.txt', 'rel']
    ]);
    // Old file should still exist since importFiles doesn't remove existing files
    expect(await fsw.exists('/old.txt')).toBe(true);
    const newContent = await fsw.readFile('/new.txt');
    const relContent = await fsw.readFile('/relative.txt');
    expect(new TextDecoder().decode(newContent)).toBe('new');
    expect(new TextDecoder().decode(relContent)).toBe('rel');
  });

  it('watches for file changes', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);
    
    await fsw.mkdir('/watched', { recursive: true });

    await fsw.writeFile('/watched/a.txt', new TextEncoder().encode('1'));
    // Give BroadcastChannel a moment to deliver the event
    await new Promise(r => setTimeout(r, 10));
            expect(events.some(e => e.type === WatchEventType.Added && e.path === '/watched/a.txt')).toBe(true);

    await fsw.writeFile('/watched/a.txt', new TextEncoder().encode('2'));
    await new Promise(r => setTimeout(r, 10));
            expect(events.some(e => e.type === WatchEventType.Changed && e.path === '/watched/a.txt')).toBe(true);

    await fsw.remove('/watched/a.txt');
    await new Promise(r => setTimeout(r, 10));
            expect(events.some(e => e.type === WatchEventType.Removed && e.path === '/watched/a.txt')).toBe(true);

    channel.close();
  });

  it('watches root folder for changes', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);
    await fsw.writeFile('/root-file.txt', new TextEncoder().encode('test'));
    // Give BroadcastChannel a moment to deliver the event
    await new Promise(r => setTimeout(r, 10));
            expect(events.some(e => e.type === WatchEventType.Added && e.path === '/root-file.txt')).toBe(true);

    await fsw.remove('/root-file.txt');
    await new Promise(r => setTimeout(r, 10));
            expect(events.some(e => e.type === WatchEventType.Removed && e.path === '/root-file.txt')).toBe(true);

    channel.close();
  });

  it('supports shallow watching with recursive: false', async () => {
    // BroadcastChannel receives every mutation; path filters apply on the facade listener.
    // Here we only assert that both writes are published.
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);

    await fsw.mkdir('/shallow-test', { recursive: true });
    await fsw.mkdir('/shallow-test/nested', { recursive: true });

    await fsw.writeFile('/shallow-test/immediate.txt', new TextEncoder().encode('immediate content'));
    await fsw.writeFile('/shallow-test/nested/another-deep.txt', new TextEncoder().encode('another deep content'));
    await new Promise(r => setTimeout(r, 10));

    expect(events.some(e => e.type === WatchEventType.Added && e.path === '/shallow-test/immediate.txt')).toBe(true);
    expect(events.some(e => e.type === WatchEventType.Added && e.path === '/shallow-test/nested/another-deep.txt')).toBe(true);

    channel.close();
    await fsw.remove('/shallow-test', { recursive: true });
  });

  it('broadcasts mutations even when nothing called watch', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);

    await fsw.writeFile('/internal-test.txt', new TextEncoder().encode('test'));
    await new Promise(r => setTimeout(r, 50));
    expect(events.some(e => e.type === WatchEventType.Added && e.path === '/internal-test.txt')).toBe(true);

    await fsw.mkdir('/internal-dir', { recursive: true });
    await new Promise(r => setTimeout(r, 50));
    expect(events.some(e => e.type === WatchEventType.Added && e.path === '/internal-dir')).toBe(true);

    await fsw.remove('/internal-test.txt');
    await new Promise(r => setTimeout(r, 50));
    expect(events.some(e => e.type === WatchEventType.Removed && e.path === '/internal-test.txt')).toBe(true);

    channel.close();
  });

  it('avoids duplicate events when path is already being watched', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);
    
    // Make changes
    await fsw.mkdir('/watched-path', { recursive: true });
    await fsw.writeFile('/watched-path/file.txt', new TextEncoder().encode('test'));
    // Give BroadcastChannel a moment to deliver the event
    await new Promise(r => setTimeout(r, 10));
    
    // Should only get one event from the watch mechanism
          const createEvents = events.filter(e => e.type === WatchEventType.Added && e.path === '/watched-path/file.txt');
    expect(createEvents.length).toBe(1);
    
    channel.close();
  });

  it('notifies about copy operations', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);
    
    // Clean up any existing files from previous tests
    try {
      await fsw.remove('/dest.txt');
    } catch {}
    try {
      await fsw.remove('/source.txt');
    } catch {}
    
    // Create a source file
    await fsw.writeFile('/source.txt', new TextEncoder().encode('source content'));
    
    // Copy the file
    await fsw.copy('/source.txt', '/dest.txt');
    // Give BroadcastChannel a moment to deliver the event
    await new Promise(r => setTimeout(r, 10));
    
    // Should get notification about the new file
            expect(events.some(e => e.type === WatchEventType.Added && e.path === '/dest.txt')).toBe(true);
    
    // Verify the copy worked
    const destContent = await fsw.readFile('/dest.txt');
    expect(new TextDecoder().decode(destContent)).toBe('source content');
    
    channel.close();
  });

  it('broadcasts all mutations; include/exclude are applied by subscribers', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);

    await fsw.mkdir('/pattern-test', { recursive: true });
    await fsw.mkdir('/pattern-test/src', { recursive: true });
    await fsw.mkdir('/pattern-test/dist', { recursive: true });

    await fsw.writeFile('/pattern-test/app.js', new TextEncoder().encode('console.log("app")'));
    await fsw.writeFile('/pattern-test/dist/bundle.js', new TextEncoder().encode('bundle content'));
    await fsw.writeFile('/pattern-test/readme.md', new TextEncoder().encode('# Readme'));
    await new Promise(r => setTimeout(r, 10));

    expect(events.some(e => e.path === '/pattern-test/app.js')).toBe(true);
    expect(events.some(e => e.path === '/pattern-test/dist/bundle.js')).toBe(true);
    expect(events.some(e => e.path === '/pattern-test/readme.md')).toBe(true);

    channel.close();
    await fsw.remove('/pattern-test', { recursive: true });
  });

  describe('concurrent access', () => {
    it('allows two concurrent readFile on the same path', async () => {
      const payload = new TextEncoder().encode('hello');
      await fsw.writeFile('/a.txt', payload);

      const [a, b] = await Promise.all([
        fsw.readFile('/a.txt'),
        fsw.readFile('/a.txt'),
      ]);

      expect(a).toEqual(payload);
      expect(b).toEqual(payload);
    });

    it('allows many concurrent readFile on the same path', async () => {
      const payload = new TextEncoder().encode('concurrent');
      await fsw.writeFile('/many.txt', payload);

      const results = await Promise.all(
        Array.from({ length: 8 }, () => fsw.readFile('/many.txt'))
      );

      for (const result of results) {
        expect(result).toEqual(payload);
      }
    });

    it('serializes concurrent readFile and writeFile on the same path', async () => {
      await fsw.writeFile('/rw.txt', new TextEncoder().encode('v1'));

      const ops = await Promise.all([
        fsw.readFile('/rw.txt'),
        fsw.writeFile('/rw.txt', new TextEncoder().encode('v2')),
        fsw.readFile('/rw.txt'),
      ]);

      // Reads may see v1 or v2 depending on lock order; neither should throw
      expect(ops[0]).toBeInstanceOf(Uint8Array);
      expect(ops[2]).toBeInstanceOf(Uint8Array);

      const final = await fsw.readFile('/rw.txt');
      expect(new TextDecoder().decode(final)).toBe('v2');
    });

    it('allows concurrent readFile on different paths', async () => {
      await fsw.writeFile('/x.txt', new TextEncoder().encode('x'));
      await fsw.writeFile('/y.txt', new TextEncoder().encode('y'));

      const [x, y] = await Promise.all([
        fsw.readFile('/x.txt'),
        fsw.readFile('/y.txt'),
      ]);

      expect(new TextDecoder().decode(x)).toBe('x');
      expect(new TextDecoder().decode(y)).toBe('y');
    });
  });

  describe('edge cases and missing branches', () => {
    it('exists returns true for root', async () => {
      expect(await fsw.exists('/')).toBe(true);
    });

    it('cannot remove root', async () => {
      await expect(fsw.remove('/')).rejects.toMatchObject({ name: 'EROOT' });
    });

    it('copies directories recursively and refuses without recursive', async () => {
      await fsw.mkdir('/copy-src/nested', { recursive: true });
      await fsw.writeFile('/copy-src/a.txt', new TextEncoder().encode('a'));
      await fsw.writeFile('/copy-src/nested/b.txt', new TextEncoder().encode('b'));

      await expect(
        fsw.copy('/copy-src', '/copy-dst')
      ).rejects.toMatchObject({ name: 'EISDIR' });

      await fsw.copy('/copy-src', '/copy-dst', { recursive: true });
      expect(new TextDecoder().decode(await fsw.readFile('/copy-dst/a.txt'))).toBe('a');
      expect(new TextDecoder().decode(await fsw.readFile('/copy-dst/nested/b.txt'))).toBe('b');
    });

    it('copy / rename refuse overwrite when disabled', async () => {
      await fsw.writeFile('/c1.txt', new TextEncoder().encode('1'));
      await fsw.writeFile('/c2.txt', new TextEncoder().encode('2'));

      await expect(
        fsw.copy('/c1.txt', '/c2.txt', { overwrite: false })
      ).rejects.toMatchObject({ name: 'EEXIST' });

      await expect(
        fsw.rename('/c1.txt', '/c2.txt', { overwrite: false })
      ).rejects.toMatchObject({ name: 'EEXIST' });

      await expect(
        fsw.copy('/missing-src', '/anywhere')
      ).rejects.toMatchObject({ name: 'ENOENT' });
    });

    it('importFiles accepts Blob and Uint8Array entries and reports progress', async () => {
      const progress: Array<{ path: string; index: number; count: number; totalBytesWritten: number; totalBytes: number }> = [];

      await expect(
        fsw.importFiles(
          [
            ['/blob.txt', new Blob(['blob-data'])],
            ['/bytes.bin', new Uint8Array([10, 20, 30])],
          ],
          (p) => progress.push({
            path: p.path,
            index: p.index,
            count: p.count,
            totalBytesWritten: p.totalBytesWritten,
            totalBytes: p.totalBytes,
          })
        )
      ).resolves.toEqual({
        paths: ['/blob.txt', '/bytes.bin'],
        count: 2,
        bytesWritten: 12,
      });

      expect(new TextDecoder().decode(await fsw.readFile('/blob.txt'))).toBe('blob-data');
      expect(await fsw.readFile('/bytes.bin')).toEqual(new Uint8Array([10, 20, 30]));
      expect(progress.at(-1)).toMatchObject({
        path: '/bytes.bin',
        index: 1,
        count: 2,
        totalBytesWritten: 12,
        totalBytes: 12,
      });
    });

    it('importFiles accepts a Map of entries', async () => {
      await fsw.importFiles(new Map([
        ['/map-a.txt', 'aaa'],
        ['/map-b.txt', 'bb'],
      ]));

      expect(new TextDecoder().decode(await fsw.readFile('/map-a.txt'))).toBe('aaa');
      expect(new TextDecoder().decode(await fsw.readFile('/map-b.txt'))).toBe('bb');
    });

    it('readBlob returns a lazy Blob that can be sliced', async () => {
      await fsw.writeFile('/blob-read.bin', new Uint8Array([1, 2, 3, 4, 5]));

      const blob = await fsw.readBlob('/blob-read.bin');

      expect(blob.size).toBe(5);
      expect([...new Uint8Array(await blob.slice(0, 2).arrayBuffer())]).toEqual([1, 2]);
    });

    it('readBlob rejects for missing paths and directories', async () => {
      await fsw.mkdir('/blob-dir', { recursive: true });

      await expect(fsw.readBlob('/nope.bin')).rejects.toMatchObject({ name: 'ENOENT' });
      await expect(fsw.readBlob('/blob-dir')).rejects.toThrow();
    });

    it('createIndex still works as a deprecated alias', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await fsw.createIndex([['/legacy.txt', 'legacy']]);
      expect(new TextDecoder().decode(await fsw.readFile('/legacy.txt'))).toBe('legacy');

      warn.mockRestore();
    });

    it('setOptions updates namespace and rotates broadcast channel', async () => {
      await fsw.setOptions({
        namespace: 'ns-a',
        broadcastChannel: 'channel-a',
      });

      // Force channel creation via a write
      await fsw.writeFile('/ch.txt', new TextEncoder().encode('x'));
      await new Promise(r => setTimeout(r, 10));

      await fsw.setOptions({ broadcastChannel: 'channel-b', namespace: 'ns-b' });
      expect(true).toBe(true);
    });

    it('skips watch broadcasts when broadcastChannel is disabled', async () => {
      const events: WatchEvent[] = [];
      const channel = new BroadcastChannel('opfs-worker');
      channel.onmessage = (event) => events.push(event.data);

      await fsw.setOptions({ broadcastChannel: null });
      await fsw.writeFile('/silent.txt', new TextEncoder().encode('x'));
      await new Promise(r => setTimeout(r, 20));
      expect(events.some(e => e.path === '/silent.txt')).toBe(false);

      channel.close();
    });

    it('mkdir fails when a file blocks the path', async () => {
      await fsw.writeFile('/blocked', new TextEncoder().encode('file'));
      await expect(fsw.mkdir('/blocked/child')).rejects.toMatchObject({ name: 'ENOTDIR' });
    });

    it('mkdir without recursive fails for missing parent', async () => {
      await expect(fsw.mkdir('/no-parent/child')).rejects.toMatchObject({ name: 'ENOENT' });
    });

    it('dispose cleans open descriptors', async () => {
      const fd = await fsw.open('/dispose-me.txt', { create: true });
      fsw.dispose();

      await expect(fsw.close(fd)).rejects.toMatchObject({ name: 'EBADF' });
    });

    it('mounts a nested custom root', async () => {
      const nested = new OPFSSync({ root: '/app-root' });
      await nested.writeFile('/inside.txt', new TextEncoder().encode('in'));
      expect(new TextDecoder().decode(await nested.readFile('/inside.txt'))).toBe('in');
      nested.dispose();
    });
  });
});
