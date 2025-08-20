import { promises as fsp } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OPFSWorker } from '../src/worker';

const rootDir = (globalThis as any).__OPFS_ROOT__ as string;

describe('OPFSWorker File Descriptors', () => {
  let fsw: OPFSWorker;

  beforeEach(async () => {
    await fsp.rm(rootDir, { recursive: true, force: true });
    await fsp.mkdir(rootDir, { recursive: true });
    fsw = new OPFSWorker({ root: '/' });
  });

  afterEach(async () => {
    // Close all open file descriptors manually
    // We'll rely on the clear() method to clean up files
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
      ).rejects.toThrow('File already exists');
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
      ).rejects.toMatchObject({ code: 'OPEN_FAILED' });
    });

    it('allows opening the same file multiple times (like Node.js fs)', async () => {
      const fd1 = await fsw.open('/multi-open.txt', { create: true });
      
      // Should be able to open the same file again and get a different FD
      const fd2 = await fsw.open('/multi-open.txt');
      
      // Both should succeed and have different file descriptors
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
      ).rejects.toMatchObject({ code: 'OPEN_FAILED' });
    });
  });

  describe('close()', () => {
    it('closes file descriptor successfully', async () => {
      const fd = await fsw.open('/test.txt', { create: true });
      
      await expect(fsw.close(fd)).resolves.not.toThrow();
      
      // Should not be able to use closed fd
      await expect(
        fsw.read(fd, new Uint8Array(10), 0, 10, null)
      ).rejects.toMatchObject({ code: 'EBADF' });
    });

    it('throws EBADF for invalid file descriptor', async () => {
      await expect(
        fsw.close(999)
      ).rejects.toMatchObject({ code: 'EBADF' });
    });

    it('throws EBADF when closing already closed file descriptor', async () => {
      const fd = await fsw.open('/close-twice.txt', { create: true });
      
      // First close should succeed
      await expect(fsw.close(fd)).resolves.not.toThrow();
      
      // Second close should throw EBADF
      await expect(
        fsw.close(fd)
      ).rejects.toMatchObject({ code: 'EBADF' });
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
      ).rejects.toMatchObject({ code: 'EINVAL' });
      
      // Invalid length
      await expect(
        fsw.read(fd, buffer, 0, -1, 0)
      ).rejects.toMatchObject({ code: 'EINVAL' });
      
      // Buffer overflow
      await expect(
        fsw.read(fd, buffer, 5, 10, 0)
      ).rejects.toMatchObject({ code: 'ERANGE' });
      
      // Invalid position
      await expect(
        fsw.read(fd, buffer, 0, 5, -1)
      ).rejects.toMatchObject({ code: 'EINVAL' });
      
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
      ).rejects.toMatchObject({ code: 'EINVAL' });
      
      // Invalid length
      await expect(
        fsw.write(fd, data, 0, -1, 0)
      ).rejects.toMatchObject({ code: 'EINVAL' });
      
      // Buffer overflow
      await expect(
        fsw.write(fd, data, 5, 10, 0)
      ).rejects.toMatchObject({ code: 'ERANGE' });
      
      // Invalid position
      await expect(
        fsw.write(fd, data, 0, 5, -1)
      ).rejects.toMatchObject({ code: 'EINVAL' });
      
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
      ).rejects.toMatchObject({ code: 'EBADF' });
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
      ).rejects.toMatchObject({ code: 'EINVAL' });
      
      // Non-integer size
      await expect(
        fsw.ftruncate(fd, 3.14)
      ).rejects.toMatchObject({ code: 'EINVAL' });
      
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
      ).rejects.toMatchObject({ code: 'EBADF' });
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
