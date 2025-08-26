import { describe, it, expect, beforeEach } from 'vitest';
import { OPFSWorker } from '../src/worker';

describe('searchInWorkspace', () => {
  let fsw: OPFSWorker;

  beforeEach(async () => {
    fsw = new OPFSWorker({ root: '/' });
    await fsw.clear('/');
  });

  it('finds plain text matches and streams results', async () => {
    await fsw.writeFile('/a.txt', new TextEncoder().encode('hello world'));
    await fsw.writeFile('/b.txt', new TextEncoder().encode(`world\nnext line`));

    const results = await fsw.search(
      'world',
      { useRegExp: false, matchCase: true }
    );

    const files = results.map((r: any) => r.fileUri).sort();
    expect(files).toEqual(['/a.txt', '/b.txt']);
    const a = results.find((r: any) => r.fileUri === '/a.txt');
    expect(a.matches.length).toBe(1);
  });

  it('respects exclude patterns', async () => {
    await fsw.writeFile('/src/app.txt', new TextEncoder().encode('hello'));
    await fsw.writeFile('/dist/app.txt', new TextEncoder().encode('hello'));

    const results = await fsw.search(
      'hello',
      { exclude: ['**/dist/**'] }
    );

    const files = results.map((r: any) => r.fileUri).sort();
    expect(files.sort()).toEqual(['/src/app.txt']);
  });
});


