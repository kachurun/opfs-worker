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
    fsw = new OPFSWorker({ root: '/' });
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

  it('appends to files', async () => {
    const startData = new TextEncoder().encode('start');
    const endData = new TextEncoder().encode(' end');
    await fsw.writeFile('/append.txt', startData);
    await fsw.appendFile('/append.txt', endData);
    const content = await fsw.readFile('/append.txt');
    const expected = new Uint8Array([...startData, ...endData]);
    expect(content).toEqual(expected);
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

  it('syncs external entries and supports cleanBefore', async () => {
    await fsw.writeFile('/old.txt', new TextEncoder().encode('old'));
    await fsw.sync([
      ['/new.txt', 'new'],
      ['relative.txt', 'rel']
    ], { cleanBefore: true });
    expect(await fsw.exists('/old.txt')).toBe(false);
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
    await fsw.watch('/watched');

    await fsw.writeFile('/watched/a.txt', new TextEncoder().encode('1'));
    // Give BroadcastChannel a moment to deliver the event
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'added' && e.path === '/watched/a.txt')).toBe(true);

    await fsw.writeFile('/watched/a.txt', new TextEncoder().encode('2'));
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'changed' && e.path === '/watched/a.txt')).toBe(true);

    await fsw.remove('/watched/a.txt');
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'removed' && e.path === '/watched/a.txt')).toBe(true);

    fsw.unwatch('/watched');
    channel.close();
  });

  it('watches root folder for changes', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);
    await fsw.watch('/');

    await fsw.writeFile('/root-file.txt', new TextEncoder().encode('test'));
    // Give BroadcastChannel a moment to deliver the event
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'added' && e.path === '/root-file.txt')).toBe(true);

    await fsw.remove('/root-file.txt');
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'removed' && e.path === '/root-file.txt')).toBe(true);

    fsw.unwatch('/');
    channel.close();
  });

  it('supports shallow watching with recursive: false', async () => {
    const events: WatchEvent[] = [];
    
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);
    
    // Create nested structure
    await fsw.mkdir('/shallow-test', { recursive: true });
    await fsw.mkdir('/shallow-test/nested', { recursive: true });
    await fsw.writeFile('/shallow-test/nested/deep-file.txt', new TextEncoder().encode('deep content'));
    
    // Watch with shallow option - watch immediate children, not the directory itself
    await fsw.watch('/shallow-test/*', { recursive: false });
    
    // Create file in immediate directory (should be detected)
    await fsw.writeFile('/shallow-test/immediate.txt', new TextEncoder().encode('immediate content'));
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'added' && e.path === '/shallow-test/immediate.txt')).toBe(true);
    
    // Create file in nested directory (should NOT be detected with shallow watching)
    await fsw.writeFile('/shallow-test/nested/another-deep.txt', new TextEncoder().encode('another deep content'));
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'added' && e.path === '/shallow-test/nested/another-deep.txt')).toBe(false);
    
    fsw.unwatch('/shallow-test/*');
    channel.close();
    
    // Cleanup
    await fsw.remove('/shallow-test', { recursive: true });
  });

  it('notifies about internal changes even when not watching', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);
    
    // Don't watch any paths, so no events should be received
    await fsw.writeFile('/internal-test.txt', new TextEncoder().encode('test'));
    await new Promise(r => setTimeout(r, 50));
    expect(events.some(e => e.type === 'changed' && e.path === '/internal-test.txt')).toBe(false);

    await fsw.mkdir('/internal-dir', { recursive: true });
    await new Promise(r => setTimeout(r, 50));
    expect(events.some(e => e.type === 'added' && e.path === '/internal-dir')).toBe(false);

    await fsw.remove('/internal-test.txt');
    await new Promise(r => setTimeout(r, 50));
    expect(events.some(e => e.type === 'removed' && e.path === '/internal-test.txt')).toBe(false);
    
    channel.close();
  });

  it('avoids duplicate events when path is already being watched', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);
    
    // Watch a specific path
    await fsw.mkdir('/watched-path', { recursive: true });
    await fsw.watch('/watched-path');
    
    // Make changes to the watched path
    await fsw.writeFile('/watched-path/file.txt', new TextEncoder().encode('test'));
    // Give BroadcastChannel a moment to deliver the event
    await new Promise(r => setTimeout(r, 10));
    
    // Should only get one event from the watch mechanism
    const createEvents = events.filter(e => e.type === 'added' && e.path === '/watched-path/file.txt');
    expect(createEvents.length).toBe(1);
    
    await fsw.unwatch('/watched-path');
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
    
    // Watch the root directory to receive events for any files
    await fsw.watch('/');
    
    // Create a source file
    await fsw.writeFile('/source.txt', new TextEncoder().encode('source content'));
    
    // Copy the file
    await fsw.copy('/source.txt', '/dest.txt');
    // Give BroadcastChannel a moment to deliver the event
    await new Promise(r => setTimeout(r, 10));
    
    // Should get notification about the new file
    expect(events.some(e => e.type === 'added' && e.path === '/dest.txt')).toBe(true);
    
    // Verify the copy worked
    const destContent = await fsw.readFile('/dest.txt');
    expect(new TextDecoder().decode(destContent)).toBe('source content');
    
    fsw.unwatch('/');
    channel.close();
  });

  it('supports minimatch patterns and include/exclude options', async () => {
    const events: WatchEvent[] = [];
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => events.push(event.data);
    
    // Create test structure
    await fsw.mkdir('/pattern-test', { recursive: true });
    await fsw.mkdir('/pattern-test/src', { recursive: true });
    await fsw.mkdir('/pattern-test/dist', { recursive: true });
    
    // Watch with minimatch pattern and include/exclude options
    await fsw.watch('/pattern-test/**/*.js', {
      recursive: true,
      include: ['**/*.js', '**/*.ts'],
      exclude: ['**/dist/**', '**/node_modules/**']
    });
    
    // Create files that should match the pattern
    await fsw.writeFile('/pattern-test/app.js', new TextEncoder().encode('console.log("app")'));
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'added' && e.path === '/pattern-test/app.js')).toBe(true);
    
    await fsw.writeFile('/pattern-test/src/index.js', new TextEncoder().encode('export default {}'));
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'added' && e.path === '/pattern-test/src/index.js')).toBe(true);
    
    // Create files that should NOT match (excluded by pattern)
    await fsw.writeFile('/pattern-test/dist/bundle.js', new TextEncoder().encode('bundle content'));
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'added' && e.path === '/pattern-test/dist/bundle.js')).toBe(false);
    
    // Create files that should NOT match (not in include patterns)
    await fsw.writeFile('/pattern-test/readme.md', new TextEncoder().encode('# Readme'));
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'added' && e.path === '/pattern-test/readme.md')).toBe(false);
    
    // Test minimatch pattern with wildcards
    await fsw.writeFile('/pattern-test/utils.js', new TextEncoder().encode('utils'));
    await new Promise(r => setTimeout(r, 10));
    expect(events.some(e => e.type === 'added' && e.path === '/pattern-test/utils.js')).toBe(true);
    
    fsw.unwatch('/pattern-test/**/*.js');
    channel.close();
    
    // Cleanup
    await fsw.remove('/pattern-test', { recursive: true });
  });
});
