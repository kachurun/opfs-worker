import { promises as fsp } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OPFSWorker } from '../src/worker';

const rootDir = (globalThis as any).__OPFS_ROOT__ as string;

describe('OPFSWorker', () => {
  let fsw: OPFSWorker;

  beforeEach(async () => {
    await fsp.rm(rootDir, { recursive: true, force: true });
    await fsp.mkdir(rootDir, { recursive: true });
    fsw = new OPFSWorker();
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
    const stat = await fsw.stat('/hash.txt', { includeHash: true });
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
    const events: any[] = [];
    fsw.setWatchCallback(e => events.push(e), { watchInterval: 50 });
    await fsw.mkdir('/watched', { recursive: true });
    await fsw.watch('/watched');

    await fsw.writeFile('/watched/a.txt', '1');
    await new Promise(r => setTimeout(r, 100));
    expect(events.some(e => e.type === 'create' && e.path === '/watched/a.txt')).toBe(true);

    await fsw.writeFile('/watched/a.txt', '2');
    await new Promise(r => setTimeout(r, 100));
    expect(events.some(e => e.type === 'change' && e.path === '/watched/a.txt')).toBe(true);

    await fsw.remove('/watched/a.txt');
    await new Promise(r => setTimeout(r, 100));
    expect(events.some(e => e.type === 'delete' && e.path === '/watched/a.txt')).toBe(true);

    fsw.unwatch('/watched');
  });
});
