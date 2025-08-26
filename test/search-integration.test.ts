import { describe, it, expect, beforeEach } from 'vitest';
import { OPFSWorker } from '../src/worker';

describe('Search Integration Tests', () => {
  let fsw: OPFSWorker;

  beforeEach(async () => {
    fsw = new OPFSWorker({ root: '/' });
    await fsw.clear('/');
  });

  it('performs comprehensive search with various options', async () => {
    // Create a variety of test files
    await fsw.writeFile('/docs/readme.md', new TextEncoder().encode('# Project Documentation\n\nThis project is awesome and contains many features.'));
    await fsw.writeFile('/src/main.ts', new TextEncoder().encode('console.log("Hello, world!");\nconst feature = "awesome";'));
    await fsw.writeFile('/src/utils.ts', new TextEncoder().encode('export function awesome() {\n  return "This is awesome!";\n}'));
    await fsw.writeFile('/test/spec.ts', new TextEncoder().encode('describe("awesome feature", () => {\n  it("should work", () => {\n    expect(true).toBe(true);\n  });\n});'));
    await fsw.writeFile('/node_modules/dep/index.js', new TextEncoder().encode('// This should be ignored\nmodule.exports = "dep";'));

    // Test 1: Basic search for "awesome"
    const results1: any[] = [];
    await fsw.search(
      'awesome',
      { matchCase: false },
      {
        onResult: (result) => results1.push(result),
        onDone: () => void 0,
      }
    );

    expect(results1.length).toBe(4); // docs/readme.md, src/main.ts, src/utils.ts, test/spec.ts
    expect(results1.some(r => r.fileUri === '/docs/readme.md')).toBe(true);
    expect(results1.some(r => r.fileUri === '/src/main.ts')).toBe(true);
    expect(results1.some(r => r.fileUri === '/src/utils.ts')).toBe(true);
    expect(results1.some(r => r.fileUri === '/test/spec.ts')).toBe(true);

    // Test 2: Search with exclude patterns
    const results2: any[] = [];
    await fsw.search(
      'awesome',
      { exclude: ['**/node_modules/**'] },
      {
        onResult: (result) => results2.push(result),
        onDone: () => void 0,
      }
    );

    expect(results2.length).toBe(4); // Should still find 4 files, node_modules is excluded by default
    expect(results2.some(r => r.fileUri === '/node_modules/dep/index.js')).toBe(false);

    // Test 3: Case-sensitive search
    const results3: any[] = [];
    await fsw.search(
      'Awesome',
      { matchCase: true },
      {
        onResult: (result) => results3.push(result),
        onDone: () => void 0,
      }
    );

    expect(results3.length).toBe(0); // No matches for "Awesome" with exact case

    // Test 4: Search with custom exclude
    const results4: any[] = [];
    await fsw.search(
      'awesome',
      { exclude: ['**/src/**'] },
      {
        onResult: (result) => results4.push(result),
        onDone: () => void 0,
      }
    );

    expect(results4.length).toBe(2); // Only docs/readme.md and test/spec.ts
    expect(results4.some(r => r.fileUri === '/docs/readme.md')).toBe(true);
    expect(results4.some(r => r.fileUri === '/test/spec.ts')).toBe(true);
  });

  it('handles regex search correctly', async () => {
    await fsw.writeFile('/test1.txt', new TextEncoder().encode('Hello world\nGoodbye world\nHello there'));
    await fsw.writeFile('/test2.txt', new TextEncoder().encode('world of wonders\namazing world'));

    const results: any[] = [];
    await fsw.search(
      '^Hello',
      { useRegExp: true, multiline: true },
      {
        onResult: (result) => results.push(result),
        onDone: () => void 0,
      }
    );

    expect(results.length).toBe(1); // Only test1.txt has lines starting with "Hello"
    expect(results[0].fileUri).toBe('/test1.txt');
    expect(results[0].matches.length).toBe(2); // Two lines starting with "Hello"
  });

  it('respects maxResults and maxResultsPerFile limits', async () => {
    // Create a file with many occurrences of "test"
    const content = Array(10).fill('This is a test line with test word test').join('\n');
    await fsw.writeFile('/large.txt', new TextEncoder().encode(content));

    const results: any[] = [];
    await fsw.search(
      'test',
      { maxResults: 5, maxResultsPerFile: 3 },
      {
        onResult: (result) => results.push(result),
        onDone: () => void 0,
      }
    );

    expect(results.length).toBe(1); // Only one file
    expect(results[0].matches.length).toBe(3); // Limited to 3 matches per file
  });

  it('handles binary file detection correctly', async () => {
    // Create a text file
    await fsw.writeFile('/text.txt', new TextEncoder().encode('Hello world'));
    
    // Create a binary file (PNG header)
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    await fsw.writeFile('/image.png', pngHeader);

    const results: any[] = [];
    await fsw.search(
      'world',
      {},
      {
        onResult: (result) => results.push(result),
        onDone: () => void 0,
      }
    );

    expect(results.length).toBe(1); // Only text.txt should be searched
    expect(results[0].fileUri).toBe('/text.txt');
    expect(results[0].matches.length).toBe(1);
  });
});
