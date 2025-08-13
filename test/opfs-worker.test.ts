import { promises as fsp } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OPFSWorker } from '../src/worker';
import type { WatchEvent } from '../src/types';

const rootDir = (globalThis as any).__OPFS_ROOT__ as string;

describe('OPFSWorker', () => {
  let fsw: OPFSWorker;

  beforeEach(async () => {
    await fsp.rm(rootDir, { recursive: true, force: true });
    await fsp.mkdir(rootDir, { recursive: true });
    fsw = new OPFSWorker(undefined, { watchInterval: 50 });
    await fsw.mount('/');
  });

  afterEach(async () => {
    await fsw.clear('/');
  });

  it('writes and reads files', async () => {
    await fsw.writeFile('/hello.txt', 'world');
    const content = await fsw.readFile('/hello.txt');
    expect(content).toBe('world');
  });

  it('appends to files', async () => {
    await fsw.writeFile('/append.txt', 'start');
    await fsw.appendFile('/append.txt', ' end');
    const content = await fsw.readFile('/append.txt');
    expect(content).toBe('start end');
  });

  it('creates directories recursively and lists them', async () => {
    await fsw.mkdir('/a/b/c', { recursive: true });
    const list = await fsw.readdir('/a/b', { withFileTypes: true });
    expect(list.some(e => e.name === 'c' && e.isDirectory)).toBe(true);
  });

  it('provides file stats and hash', async () => {
    await fsw.writeFile('/hash.txt', 'data');
    fsw.setOptions({ hashAlgorithm: 'SHA-1' });
    const stat = await fsw.stat('/hash.txt');
    expect(stat.isFile).toBe(true);
    expect(stat.size).toBe(4);
    expect(stat.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('provides directory stats', async () => {
    await fsw.mkdir('/dir', { recursive: true });
    const stat = await fsw.stat('/dir');
    expect(stat.isDirectory).toBe(true);
    expect(stat.isFile).toBe(false);
  });

  it('indexes directory structure', async () => {
    await fsw.mkdir('/dir', { recursive: true });
    await fsw.writeFile('/dir/file.txt', '1');
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

  it('syncs external entries and supports cleanBefore', async () => {
    await fsw.writeFile('/old.txt', 'old');
    await fsw.sync([
      ['/new.txt', 'new'],
      ['relative.txt', 'rel']
    ], { cleanBefore: true });
    expect(await fsw.exists('/old.txt')).toBe(false);
    expect(await fsw.readFile('/new.txt')).toBe('new');
    expect(await fsw.readFile('/relative.txt')).toBe('rel');
  });

  it('watches for file changes', async () => {
    const events: WatchEvent[] = [];
    fsw.setWatchCallback(e => events.push(e));
    
    await fsw.mkdir('/watched', { recursive: true });
    await fsw.watch('/watched');

    await fsw.writeFile('/watched/a.txt', '1');
    await new Promise(r => setTimeout(r, 100));
    expect(events.some(e => e.type === 'added' && e.path === '/watched/a.txt')).toBe(true);

    await fsw.writeFile('/watched/a.txt', '2');
    await new Promise(r => setTimeout(r, 100));
    expect(events.some(e => e.type === 'changed' && e.path === '/watched/a.txt')).toBe(true);

    await fsw.remove('/watched/a.txt');
    await new Promise(r => setTimeout(r, 100));
    expect(events.some(e => e.type === 'removed' && e.path === '/watched/a.txt')).toBe(true);

    fsw.unwatch('/watched');
  });

  it('watches root folder for changes', async () => {
    const events: WatchEvent[] = [];
    fsw.setWatchCallback(e => events.push(e));
    await fsw.watch('/');

    await fsw.writeFile('/root-file.txt', 'test');
    await new Promise(r => setTimeout(r, 100));
    expect(events.some(e => e.type === 'added' && e.path === '/root-file.txt')).toBe(true);

    await fsw.remove('/root-file.txt');
    await new Promise(r => setTimeout(r, 100));
    expect(events.some(e => e.type === 'removed' && e.path === '/root-file.txt')).toBe(true);

    fsw.unwatch('/');
  });

  it('provides root directory stats', async () => {
    const stat = await fsw.stat('/');
    expect(stat.isDirectory).toBe(true);
    expect(stat.isFile).toBe(false);
    expect(stat.kind).toBe('directory');
  });

  it('checks root directory existence', async () => {
    expect(await fsw.exists('/')).toBe(true);
  });

  it('prevents removal of root directory', async () => {
    await expect(fsw.remove('/')).rejects.toThrow('Cannot remove root directory');
  });

  it('notifies about internal changes even when not watching', async () => {
    const events: WatchEvent[] = [];
    fsw.setWatchCallback(e => events.push(e));
    
    // Don't watch any paths, but still expect notifications from internal changes
    await fsw.writeFile('/internal-test.txt', 'test');
    await new Promise(r => setTimeout(r, 50));
    expect(events.some(e => e.type === 'changed' && e.path === '/internal-test.txt')).toBe(true);

    await fsw.mkdir('/internal-dir', { recursive: true });
    await new Promise(r => setTimeout(r, 50));
    expect(events.some(e => e.type === 'added' && e.path === '/internal-dir')).toBe(true);

    await fsw.remove('/internal-test.txt');
    await new Promise(r => setTimeout(r, 50));
    expect(events.some(e => e.type === 'removed' && e.path === '/internal-test.txt')).toBe(true);
  });

  it('avoids duplicate events when path is already being watched', async () => {
    const events: WatchEvent[] = [];
    fsw.setWatchCallback(e => events.push(e));
    
    // Watch a specific path
    await fsw.mkdir('/watched-path', { recursive: true });
    await fsw.watch('/watched-path');
    
    // Make changes to the watched path
    await fsw.writeFile('/watched-path/file.txt', 'test');
    await new Promise(r => setTimeout(r, 100));
    
    // Should only get one event from the watch mechanism, not duplicate from internal notification
    const createEvents = events.filter(e => e.type === 'added' && e.path === '/watched-path/file.txt');
    expect(createEvents.length).toBe(1);
    
    await fsw.unwatch('/watched-path');
  });

  it('notifies about copy operations', async () => {
    const events: WatchEvent[] = [];
    fsw.setWatchCallback(e => events.push(e));
    
    // Create a source file
    await fsw.writeFile('/source.txt', 'source content');
    
    // Copy the file
    await fsw.copy('/source.txt', '/dest.txt');
    await new Promise(r => setTimeout(r, 50));
    
    // Should get notification about the new file
    expect(events.some(e => e.type === 'added' && e.path === '/dest.txt')).toBe(true);
    
    // Verify the copy worked
    expect(await fsw.readFile('/dest.txt')).toBe('source content');
  });
});
