import { promises as fsp } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OPFSSync } from '../src/core/OPFSSync';

const rootDir = (globalThis as any).__OPFS_ROOT__ as string;

describe('OPFSSync File Descriptors', () => {
  let fsw: OPFSSync;

  beforeEach(async () => {
    await fsp.rm(rootDir, { recursive: true, force: true });
    await fsp.mkdir(rootDir, { recursive: true });
    fsw = new OPFSSync({ root: '/' });
  });

  afterEach(async () => {
    // First, so clear() doesn't wait on path locks held by descriptors a failed test left open
    fsw.dispose();
    await fsw.clear('/');
  });

  describe('open()', () => {
    it('opens existing file for reading', async () => {
      await fsw.writeFile('/test.txt', new TextEncoder().encode('Hello, World!'));
      const fd = await fsw.open('/test.txt');
      
      expect(fd).toBeTypeOf('number');
      expect(fd).toBeGreaterThan(0);
      
      await fsw.close(fd);
    });

    it('creates new file when create option is true', async () => {
      const fd = await fsw.open('/new.txt', { create: true });
      
      expect(fd).toBeTypeOf('number');
      expect(await fsw.exists('/new.txt')).toBe(true);
      
      await fsw.close(fd);
    });

    it('fails to create file when exclusive is true and file exists', async () => {
      await fsw.writeFile('/exists.txt', new TextEncoder().encode('content'));
      
      await expect(
        fsw.open('/exists.txt', { create: true, exclusive: true })
      ).rejects.toMatchObject({ name: 'EEXIST' });
    });

    it('truncates file when truncate option is true', async () => {
      await fsw.writeFile('/truncate.txt', new TextEncoder().encode('long content here'));
      const fd = await fsw.open('/truncate.txt', { create: true, truncate: true });
      
      const stats = await fsw.fstat(fd);
      expect(stats.size).toBe(0);
      
      await fsw.close(fd);
    });

    it('throws EISDIR when trying to open directory', async () => {
      await fsw.mkdir('/testdir');
      
      await expect(
        fsw.open('/testdir')
      ).rejects.toMatchObject({ name: 'EISDIR' });
    });

    it('allows opening the same file multiple times (like Node.js fs)', async () => {
      const fd1 = await fsw.open('/multi-open.txt', { create: true });

      // Should be able to open the same file again and get a different FD
      const fd2 = await fsw.open('/multi-open.txt');

      expect(fd1).toBeTypeOf('number');
      expect(fd2).toBeTypeOf('number');
      expect(fd1).not.toBe(fd2);

      // Both should be able to read/write independently
      await fsw.write(fd1, new TextEncoder().encode('Hello'));
      await fsw.write(fd2, new TextEncoder().encode('World'));

      await fsw.close(fd1);
      await fsw.close(fd2);
    });

    it('throws ENOENT when trying to open non-existent file without create', async () => {
      await expect(
        fsw.open('/nope.txt')
      ).rejects.toMatchObject({ name: 'ENOENT' });
    });
  });

  describe('concurrent open()', () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const nextTurn = () => new Promise(resolve => setImmediate(resolve));

    // Reads like a stream consumer: small chunks with an event-loop turn between them,
    // so the descriptor stays open while the other operations run
    async function readAllWithFd(path: string): Promise<string> {
      const fd = await fsw.open(path);
      const chunks: number[] = [];
      const buffer = new Uint8Array(7);

      try {
        while (true) {
          const { bytesRead, buffer: out } = await fsw.read(fd, buffer, 0, buffer.length, null);

          if (bytesRead === 0) {
            break;
          }

          chunks.push(...out.subarray(0, bytesRead));
          await nextTurn();
        }
      }
      finally {
        await fsw.close(fd);
      }

      return decoder.decode(new Uint8Array(chunks));
    }

    it('shares one sync handle between concurrent opens of the same path', async () => {
      await fsw.writeFile('/race.txt', encoder.encode('data'));

      const [fd1, fd2] = await Promise.all([fsw.open('/race.txt'), fsw.open('/race.txt')]);

      expect(fd1).not.toBe(fd2);

      const handles = (fsw as any).openHandles as Map<string, { refCount: number }>;

      expect(handles.size).toBe(1);
      expect(handles.get('/race.txt')?.refCount).toBe(2);

      await fsw.close(fd1);
      await fsw.close(fd2);

      expect(handles.size).toBe(0);
    });

    it('never fails when descriptors overlap readFile/writeFile on the same path', async () => {
      const rounds = 20;
      const contentFor = (round: number) => `round-${ round }:`.repeat(50);
      const written = new Set<string>([contentFor(0)]);

      await fsw.writeFile('/mixed.txt', encoder.encode(contentFor(0)));

      for (let round = 1; round <= rounds; round++) {
        written.add(contentFor(round));

        const results = await Promise.allSettled([
          fsw.writeFile('/mixed.txt', encoder.encode(contentFor(round))),
          fsw.readFile('/mixed.txt'),
          fsw.readFile('/mixed.txt'),
          readAllWithFd('/mixed.txt'),
        ]);

        const rejected = results.filter(r => r.status === 'rejected');

        expect(rejected).toEqual([]);

        for (const result of results.slice(1, 3)) {
          const text = decoder.decode((result as PromiseFulfilledResult<Uint8Array>).value);

          expect(written.has(text)).toBe(true);
        }
      }

      expect((fsw as any).openHandles.size).toBe(0);
    });

    it('opens again when the last descriptor closes while another open is pending', async () => {
      await fsw.writeFile('/reopen.txt', encoder.encode('hello'));

      // Close the first descriptor after 0, 1 and 2 event-loop turns, racing the second open
      for (let turns = 0; turns < 3; turns++) {
        const first = fsw.open('/reopen.txt').then(async(fd) => {
          for (let i = 0; i < turns; i++) {
            await nextTurn();
          }

          await fsw.close(fd);
        });
        const second = fsw.open('/reopen.txt');

        await first;

        const fd = await second;
        const { bytesRead, buffer } = await fsw.read(fd, new Uint8Array(5), 0, 5, 0);

        expect(decoder.decode(buffer.subarray(0, bytesRead))).toBe('hello');

        await fsw.close(fd);
      }

      expect((fsw as any).openHandles.size).toBe(0);

      const fd = await fsw.open('/reopen.txt');

      await fsw.write(fd, encoder.encode('world'), 0, 5, 0);
      await fsw.close(fd);

      expect(decoder.decode(await fsw.readFile('/reopen.txt'))).toBe('world');
    });

    it('creates the file when an open with create races an open without it', async () => {
      const [plain, creating] = await Promise.allSettled([
        fsw.open('/late.txt'),
        fsw.open('/late.txt', { create: true }),
      ]);

      expect(plain).toMatchObject({ status: 'rejected', reason: { name: 'ENOENT' } });
      expect(creating.status).toBe('fulfilled');

      await fsw.close((creating as PromiseFulfilledResult<number>).value);

      expect(await fsw.exists('/late.txt')).toBe(true);
    });

    it('rejects every waiter when opening fails, then recovers', async () => {
      const [a, b] = await Promise.allSettled([fsw.open('/missing.txt'), fsw.open('/missing.txt')]);

      expect(a).toMatchObject({ status: 'rejected', reason: { name: 'ENOENT' } });
      expect(b).toMatchObject({ status: 'rejected', reason: { name: 'ENOENT' } });

      const fd = await fsw.open('/missing.txt', { create: true });

      await fsw.close(fd);

      expect((fsw as any).openHandles.size).toBe(0);
    });
  });

  describe('path lock from open() to close()', () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const nextTurns = async(count = 3) => {
      for (let i = 0; i < count; i++) {
        await new Promise(resolve => setImmediate(resolve));
      }
    };

    function track<T>(promise: Promise<T>): { promise: Promise<T>; settled: () => boolean } {
      let settled = false;

      promise.then(() => (settled = true), () => (settled = true));

      return { promise, settled: () => settled };
    }

    async function readText(fd: number): Promise<string> {
      const { size } = await fsw.fstat(fd);
      const { bytesRead, buffer } = await fsw.read(fd, new Uint8Array(size), 0, size, 0);

      return decoder.decode(buffer.subarray(0, bytesRead));
    }

    beforeEach(async () => {
      await fsw.writeFile('/locked.txt', encoder.encode('old'));
    });

    it('makes readFile wait until the descriptor closes', async () => {
      const fd = await fsw.open('/locked.txt');
      const reading = track(fsw.readFile('/locked.txt'));

      await fsw.write(fd, encoder.encode('new'), 0, 3, 0);
      await nextTurns();
      expect(reading.settled()).toBe(false);

      await fsw.close(fd);
      expect(decoder.decode(await reading.promise)).toBe('new');
    });

    it('makes writeFile wait until the descriptor closes', async () => {
      const fd = await fsw.open('/locked.txt');
      const writing = track(fsw.writeFile('/locked.txt', encoder.encode('new')));

      await nextTurns();
      expect(writing.settled()).toBe(false);
      expect(await readText(fd)).toBe('old');

      await fsw.close(fd);
      await writing.promise;
      expect(decoder.decode(await fsw.readFile('/locked.txt'))).toBe('new');
    });

    it('lets descriptors without truncate share the file', async () => {
      const fd1 = await fsw.open('/locked.txt');
      const fd2 = await fsw.open('/locked.txt');

      expect(await readText(fd1)).toBe('old');
      expect(await readText(fd2)).toBe('old');

      await fsw.close(fd1);
      await fsw.close(fd2);
    });

    it('keeps a reader from seeing a truncating open mid-write', async () => {
      const writer = await fsw.open('/locked.txt', { create: true, truncate: true });

      await fsw.write(writer, encoder.encode('ne'), 0, 2, 0);

      const opening = track(fsw.open('/locked.txt'));

      await nextTurns();
      expect(opening.settled()).toBe(false);

      await fsw.write(writer, encoder.encode('w'), 0, 1, 2);
      await fsw.close(writer);

      const reader = await opening.promise;

      expect(await readText(reader)).toBe('new');
      await fsw.close(reader);
    });

    it('makes a truncating open wait for open descriptors', async () => {
      const reader = await fsw.open('/locked.txt');
      const opening = track(fsw.open('/locked.txt', { create: true, truncate: true }));

      await nextTurns();
      expect(opening.settled()).toBe(false);
      expect(await readText(reader)).toBe('old');

      await fsw.close(reader);

      const writer = await opening.promise;

      expect((await fsw.fstat(writer)).size).toBe(0);
      await fsw.close(writer);
    });

    it('lets a descriptor join the open ones while a truncating open waits', async () => {
      const fd1 = await fsw.open('/locked.txt');
      const writing = track(fsw.open('/locked.txt', { truncate: true }));

      await nextTurns();

      const fd2 = await fsw.open('/locked.txt');

      expect(await readText(fd2)).toBe('old');
      await fsw.close(fd1);
      await fsw.close(fd2);
      await fsw.close(await writing.promise);
    });

    it('lets only one exclusive create of a path succeed', async () => {
      const results = await Promise.allSettled([
        fsw.open('/unique.txt', { create: true, exclusive: true }),
        fsw.open('/unique.txt', { create: true, exclusive: true }),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<number>[];

      expect(fulfilled).toHaveLength(1);
      expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { name: 'EEXIST' } });
      await fsw.close(fulfilled[0]!.value);
    });

    it('releases the lock when open fails', async () => {
      await expect(fsw.open('/missing.txt')).rejects.toMatchObject({ name: 'ENOENT' });

      await fsw.writeFile('/missing.txt', encoder.encode('created'));
      expect(decoder.decode(await fsw.readFile('/missing.txt'))).toBe('created');
    });

    it('does not make other paths wait', async () => {
      await fsw.writeFile('/other.txt', encoder.encode('other'));

      const fd = await fsw.open('/locked.txt');

      expect(decoder.decode(await fsw.readFile('/other.txt'))).toBe('other');
      await fsw.close(fd);
    });

    it('releases held locks on dispose', async () => {
      await fsw.open('/locked.txt');
      fsw.dispose();

      const next = new OPFSSync({ root: '/' });

      expect(decoder.decode(await next.readFile('/locked.txt'))).toBe('old');
      next.dispose();
    });

    it('keeps descriptor writes and whole-file reads apart', async () => {
      const contentFor = (round: number) => `round-${ round }:`.repeat(50);

      // Like a buffered write: open with truncate, write in chunks, close
      async function writeWithFd(text: string): Promise<string> {
        const data = encoder.encode(text);
        const fd = await fsw.open('/locked.txt', { create: true, truncate: true });

        try {
          for (let offset = 0; offset < data.length; offset += 100) {
            await fsw.write(fd, data, offset, Math.min(100, data.length - offset), null, false);
            await nextTurns(1);
          }
        }
        finally {
          await fsw.close(fd);
        }

        return text;
      }

      // Like a stream read: open, read in chunks, close
      async function readWithFd(): Promise<string> {
        const fd = await fsw.open('/locked.txt');
        const chunks: number[] = [];

        try {
          while (true) {
            const { bytesRead, buffer } = await fsw.read(fd, new Uint8Array(64), 0, 64, null);

            if (bytesRead === 0) {
              break;
            }

            chunks.push(...buffer.subarray(0, bytesRead));
            await nextTurns(1);
          }
        }
        finally {
          await fsw.close(fd);
        }

        return decoder.decode(new Uint8Array(chunks));
      }

      let previous = 'old';

      for (let round = 0; round < 20; round++) {
        const next = contentFor(round);
        const accesses = [
          () => writeWithFd(next),
          () => readWithFd(),
          () => fsw.readFile('/locked.txt').then(data => decoder.decode(data)),
          () => readWithFd(),
        ];
        const rotated = [...accesses.slice(round % 4), ...accesses.slice(0, round % 4)];
        const results = await Promise.allSettled(rotated.map(access => access()));

        expect(results.filter(r => r.status === 'rejected')).toEqual([]);

        for (const result of results) {
          expect([previous, next]).toContain((result as PromiseFulfilledResult<string>).value);
        }

        previous = next;
      }
    });
  });

  describe('close()', () => {
    it('closes file descriptor successfully', async () => {
      const fd = await fsw.open('/test.txt', { create: true });
      
      await expect(fsw.close(fd)).resolves.not.toThrow();
      
      // Should not be able to use closed fd
      await expect(
        fsw.read(fd, new Uint8Array(10), 0, 10, null)
      ).rejects.toMatchObject({ name: 'EBADF' });
    });

    it('throws EBADF for invalid file descriptor', async () => {
      await expect(
        fsw.close(999)
      ).rejects.toMatchObject({ name: 'EBADF' });
    });

    it('throws EBADF when closing already closed file descriptor', async () => {
      const fd = await fsw.open('/close-twice.txt', { create: true });
      
      // First close should succeed
      await expect(fsw.close(fd)).resolves.not.toThrow();
      
      // Second close should throw EBADF
      await expect(
        fsw.close(fd)
      ).rejects.toMatchObject({ name: 'EBADF' });
    });
  });

  describe('read()', () => {
    it('reads data from file descriptor', async () => {
      await fsw.writeFile('/read.txt', new TextEncoder().encode('Hello, World!'));
      const fd = await fsw.open('/read.txt');
      
      const buffer = new Uint8Array(20);
      const result = await fsw.read(fd, buffer, 0, 13, 0);
      
      expect(result.bytesRead).toBe(13);
      expect(new TextDecoder().decode(result.buffer.slice(0, 13))).toBe('Hello, World!');
      
      await fsw.close(fd);
    });

    it('reads from current position when position is null', async () => {
      await fsw.writeFile('/read-pos.txt', new TextEncoder().encode('Hello, World!'));
      const fd = await fsw.open('/read-pos.txt');
      
      const buffer = new Uint8Array(20);
      
      // Read first 5 bytes
      const result1 = await fsw.read(fd, buffer, 0, 5, null);
      expect(result1.bytesRead).toBe(5);
      
      // Read next 5 bytes from current position
      const result2 = await fsw.read(fd, buffer, 5, 5, null);
      expect(result2.bytesRead).toBe(5);
      
      expect(new TextDecoder().decode(result2.buffer.slice(0, 10))).toBe('Hello, Wor');
      
      await fsw.close(fd);
    });

    it('returns 0 when reading beyond end of file', async () => {
      await fsw.writeFile('/eof.txt', new TextEncoder().encode('Hello'));
      const fd = await fsw.open('/eof.txt');
      
      const buffer = new Uint8Array(10);
      const result = await fsw.read(fd, buffer, 0, 10, 100); // Position beyond file end
      
      expect(result.bytesRead).toBe(0);
      
      await fsw.close(fd);
    });

    it('returns 0 for zero-length read operation', async () => {
      await fsw.writeFile('/zero-read.txt', new TextEncoder().encode('Hello, World!'));
      const fd = await fsw.open('/zero-read.txt');
      
      const buffer = new Uint8Array(10);
      const result = await fsw.read(fd, buffer, 0, 0, 0); // Zero length
      
      expect(result.bytesRead).toBe(0);
      
      await fsw.close(fd);
    });

    it('validates arguments correctly', async () => {
      const fd = await fsw.open('/test.txt', { create: true });
      
      const buffer = new Uint8Array(10);
      
      // Invalid offset
      await expect(
        fsw.read(fd, buffer, -1, 5, 0)
      ).rejects.toMatchObject({ name: 'EINVAL' });
      
      // Invalid length
      await expect(
        fsw.read(fd, buffer, 0, -1, 0)
      ).rejects.toMatchObject({ name: 'EINVAL' });
      
      // Buffer overflow
      await expect(
        fsw.read(fd, buffer, 5, 10, 0)
      ).rejects.toMatchObject({ name: 'ERANGE' });
      
      // Invalid position
      await expect(
        fsw.read(fd, buffer, 0, 5, -1)
      ).rejects.toMatchObject({ name: 'EINVAL' });
      
      await fsw.close(fd);
    });

    it('validates boundary cases correctly', async () => {
      await fsw.writeFile('/boundary.txt', new TextEncoder().encode('Hello, World!'));
      const fd = await fsw.open('/boundary.txt');
      
      const buffer = new Uint8Array(10);
      
      // Happy case: offset + length == buffer.length (exact boundary)
      const result1 = await fsw.read(fd, buffer, 0, 10, 0);
      expect(result1.bytesRead).toBeGreaterThanOrEqual(0);
      
      // Happy case: read at exact end of buffer
      const result2 = await fsw.read(fd, buffer, 5, 5, 0);
      expect(result2.bytesRead).toBeGreaterThanOrEqual(0);
      
      await fsw.close(fd);
    });
  });

  describe('write()', () => {
    it('writes data to file descriptor', async () => {
      const fd = await fsw.open('/write.txt', { create: true });
      
      const data = new TextEncoder().encode('Hello, World!');
      const bytesWritten = await fsw.write(fd, data, 0, data.length, 0);
      
      expect(bytesWritten).toBe(13);
      
      await fsw.close(fd);
      
      // Verify content was written
      const content = await fsw.readFile('/write.txt');
      expect(new TextDecoder().decode(content)).toBe('Hello, World!');
    });

    it('writes to current position when position is null', async () => {
      const fd = await fsw.open('/write-pos.txt', { create: true });
      
      const data1 = new TextEncoder().encode('Hello');
      const data2 = new TextEncoder().encode(', World!');
      
      // Write first part
      await fsw.write(fd, data1, 0, data1.length, 0);
      
      // Write second part to current position
      await fsw.write(fd, data2, 0, data2.length, null);
      
      await fsw.close(fd);
      
      // Verify content was written
      const content = await fsw.readFile('/write-pos.txt');
      expect(new TextDecoder().decode(content)).toBe('Hello, World!');
    });

    it('uses default offset and length when not specified', async () => {
      const fd = await fsw.open('/write-defaults.txt', { create: true });
      
      const data = new TextEncoder().encode('Hello, World!');
      const bytesWritten = await fsw.write(fd, data); // Only fd and buffer
      
      expect(bytesWritten).toBe(13);
      
      await fsw.close(fd);
      
      const content = await fsw.readFile('/write-defaults.txt');
      expect(new TextDecoder().decode(content)).toBe('Hello, World!');
    });

    it('returns 0 for zero-length write operation', async () => {
      const fd = await fsw.open('/zero-write.txt', { create: true });
      
      const data = new Uint8Array(10);
      const bytesWritten = await fsw.write(fd, data, 0, 0); // Zero length
      
      expect(bytesWritten).toBe(0);
      
      await fsw.close(fd);
      
      // File should remain empty
      const content = await fsw.readFile('/zero-write.txt');
      expect(content.length).toBe(0);
    });

    it('validates arguments correctly', async () => {
      const fd = await fsw.open('/test.txt', { create: true });
      
      const data = new Uint8Array(10);
      
      // Invalid offset
      await expect(
        fsw.write(fd, data, -1, 5, 0)
      ).rejects.toMatchObject({ name: 'EINVAL' });
      
      // Invalid length
      await expect(
        fsw.write(fd, data, 0, -1, 0)
      ).rejects.toMatchObject({ name: 'EINVAL' });
      
      // Buffer overflow
      await expect(
        fsw.write(fd, data, 5, 10, 0)
      ).rejects.toMatchObject({ name: 'ERANGE' });
      
      // Invalid position
      await expect(
        fsw.write(fd, data, 0, 5, -1)
      ).rejects.toMatchObject({ name: 'EINVAL' });
      
      await fsw.close(fd);
    });

    it('validates boundary cases correctly', async () => {
      const fd = await fsw.open('/write-boundary.txt', { create: true });
      
      const data = new Uint8Array(10).fill(65); // Fill with 'A'
      
      // Happy case: offset + length == buffer.length (exact boundary)
      const bytesWritten1 = await fsw.write(fd, data, 0, 10, 0);
      expect(bytesWritten1).toBe(10);
      
      // Happy case: write at exact end of buffer
      const bytesWritten2 = await fsw.write(fd, data, 5, 5, 10);
      expect(bytesWritten2).toBe(5);
      
      await fsw.close(fd);
    });
  });

  describe('fstat()', () => {
    it('returns file statistics', async () => {
      await fsw.writeFile('/stats.txt', new TextEncoder().encode('Hello, World!'));
      const fd = await fsw.open('/stats.txt');
      
      const stats = await fsw.fstat(fd);
      
      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
      expect(stats.size).toBe(13);
      expect(stats.mtime).toBeTypeOf('string');
      expect(stats.ctime).toBeTypeOf('string');
      
      await fsw.close(fd);
    });

    it('throws EBADF for invalid file descriptor', async () => {
      await expect(
        fsw.fstat(999)
      ).rejects.toMatchObject({ name: 'EBADF' });
    });
  });

  describe('ftruncate()', () => {
    it('truncates file to specified size', async () => {
      await fsw.writeFile('/truncate-fd.txt', new TextEncoder().encode('Hello, World!'));
      const fd = await fsw.open('/truncate-fd.txt');
      
      await fsw.ftruncate(fd, 5);
      
      const stats = await fsw.fstat(fd);
      expect(stats.size).toBe(5);
      
      await fsw.close(fd);
      
      // Verify content was truncated
      const content = await fsw.readFile('/truncate-fd.txt');
      expect(new TextDecoder().decode(content)).toBe('Hello');
    });

    it('adjusts position when truncating beyond current position', async () => {
      await fsw.writeFile('/truncate-pos.txt', new TextEncoder().encode('Hello, World!'));
      const fd = await fsw.open('/truncate-pos.txt');
      
      // Move to position 10 by reading with null position (current position)
      await fsw.read(fd, new Uint8Array(1), 0, 1, null);
      await fsw.read(fd, new Uint8Array(1), 0, 1, null);
      await fsw.read(fd, new Uint8Array(1), 0, 1, null);
      await fsw.read(fd, new Uint8Array(1), 0, 1, null);
      await fsw.read(fd, new Uint8Array(1), 0, 1, null);
      
      // Truncate to 5 bytes
      await fsw.ftruncate(fd, 5);
      
      // Position should be adjusted to 5
      // @ts-ignore
      const info = fsw._getFileDescriptor?.(fd);
      expect(info?.position).toBe(5);
      
      await fsw.close(fd);
    });

    it('validates size parameter', async () => {
      const fd = await fsw.open('/test.txt', { create: true });
      
      // Negative size
      await expect(
        fsw.ftruncate(fd, -1)
      ).rejects.toMatchObject({ name: 'EINVAL' });
      
      // Non-integer size
      await expect(
        fsw.ftruncate(fd, 3.14)
      ).rejects.toMatchObject({ name: 'EINVAL' });
      
      await fsw.close(fd);
    });
  });

  describe('fsync()', () => {
    it('flushes pending writes to storage', async () => {
      const fd = await fsw.open('/sync.txt', { create: true });
      
      const data = new TextEncoder().encode('Hello, World!');
      await fsw.write(fd, data);
      
      // Should not throw
      await expect(fsw.fsync(fd)).resolves.not.toThrow();
      
      await fsw.close(fd);
    });

    it('throws EBADF for invalid file descriptor', async () => {
      await expect(
        fsw.fsync(999)
      ).rejects.toMatchObject({ name: 'EBADF' });
    });
  });

  describe('Integration tests', () => {
    it('performs complete read-write cycle with file descriptors', async () => {
      const fd = await fsw.open('/cycle.txt', { create: true });
      
      // Write data
      const writeData = new TextEncoder().encode('Hello, World!');
      const bytesWritten = await fsw.write(fd, writeData);
      expect(bytesWritten).toBe(13);
      
      // Sync to ensure data is written
      await fsw.fsync(fd);
      
      // Get file stats
      const stats = await fsw.fstat(fd);
      expect(stats.size).toBe(13);
      
      // Read data back
      const readBuffer = new Uint8Array(20);
      const readResult = await fsw.read(fd, readBuffer, 0, 13, 0);
      expect(readResult.bytesRead).toBe(13);
      
      const readData = new TextDecoder().decode(readResult.buffer.slice(0, 13));
      expect(readData).toBe('Hello, World!');
      
      // Truncate file
      await fsw.ftruncate(fd, 5);
      const newStats = await fsw.fstat(fd);
      expect(newStats.size).toBe(5);
      
      await fsw.close(fd);
    });

    it('handles multiple file descriptors simultaneously', async () => {
      const fd1 = await fsw.open('/multi1.txt', { create: true });
      const fd2 = await fsw.open('/multi2.txt', { create: true });
      
      // Write to first file
      const data1 = new TextEncoder().encode('File 1');
      await fsw.write(fd1, data1);
      
      // Write to second file
      const data2 = new TextEncoder().encode('File 2');
      await fsw.write(fd2, data2);
      
      // Read from both files
      const buffer1 = new Uint8Array(10);
      const buffer2 = new Uint8Array(10);
      
      const read1 = await fsw.read(fd1, buffer1, 0, 6, 0);
      const read2 = await fsw.read(fd2, buffer2, 0, 6, 0);
      
      expect(read1.bytesRead).toBe(6);
      expect(read2.bytesRead).toBe(6);
      
      expect(new TextDecoder().decode(read1.buffer.slice(0, 6))).toBe('File 1');
      expect(new TextDecoder().decode(read2.buffer.slice(0, 6))).toBe('File 2');
      
      await fsw.close(fd1);
      await fsw.close(fd2);
    });
  });
});
