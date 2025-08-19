# File Descriptors

This document covers working with file descriptors in OPFS Worker, which provides low-level file I/O operations similar to POSIX file descriptors.

## Requirements

**Important**: When using file descriptors from the main window (browser), you must import and use `Comlink` for proper buffer handling:

```typescript
import { transfer } from 'comlink';
```

## Overview

File descriptors provide efficient, low-level access to files for reading, writing, and manipulating file data. They're particularly useful for:

- **Large file operations**: Reading/writing files in chunks without loading entire content into memory
- **Streaming operations**: Processing files sequentially or in specific positions
- **Performance-critical applications**: Direct file access without the overhead of high-level methods
- **Binary data manipulation**: Working with raw bytes at specific file positions

## Table of Contents

- [Requirements](#requirements)
- [File Descriptor Basics](#file-descriptor-basics)
- [Opening Files](#opening-files)
- [Reading Data](#reading-data)
- [Writing Data](#writing-data)
- [File Positioning](#file-positioning)
- [File Operations](#file-operations)
- [Closing Files](#closing-files)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)
- [Examples](#examples)

## File Descriptor Basics

A file descriptor is a small integer that represents an open file. In OPFS Worker, file descriptors provide:

- **Sequential access**: Read/write operations that advance the file position
- **Random access**: Read/write at specific file positions
- **Efficient I/O**: Direct access to file data without intermediate buffers
- **Resource management**: Automatic cleanup when closed

### File Descriptor Lifecycle

1. **Open**: Create a file descriptor with `open()`
2. **Use**: Perform read/write operations
3. **Close**: Release the file descriptor with `close()`

## Opening Files

### `open(path: string, options?: FileOpenOptions): Promise<number>`

Opens a file and returns a file descriptor number.

```typescript
// Basic file opening
const fd = await fs.open('/data/config.json');

// Create new file if it doesn't exist
const fd = await fs.open('/data/new.txt', { create: true });

// Create file exclusively (fails if exists)
const fd = await fs.open('/data/unique.txt', { create: true, exclusive: true });

// Open and truncate file to zero length
const fd = await fs.open('/data/log.txt', { create: true, truncate: true });
```

**Parameters:**

- `path`: The path to the file to open
- `options.create` (optional): Whether to create the file if it doesn't exist (default: `false`)
- `options.exclusive` (optional): If `true` and `create` is `true`, fails if file already exists (default: `false`)
- `options.truncate` (optional): Whether to truncate the file to zero length (default: `false`)

**Returns:** `Promise<number>` - File descriptor number

**Throws:**

- `OPFSError` with code `'EEXIST'` if file exists and `exclusive: true`
- `OPFSError` with code `'EISDIR'` if path is a directory
- `OPFSError` with code `'OPEN_FAILED'` for other failures

**⚠️ Race Condition Warning**: The `exclusive` option provides **best-effort atomicity only**. **Race conditions ARE possible** if two workers try to create the same file simultaneously. OPFS does not provide true file locking, so don't rely on `exclusive` for critical synchronization. If you need real atomicity, implement your own locking mechanism.

## Reading Data

### `read(fd: number, buffer: Uint8Array, offset: number, length: number, position?: number | null): Promise<{bytesRead: number, buffer: Uint8Array}>`

Reads data from a file descriptor into a buffer.

```typescript
const fd = await fs.open('/data/file.txt');

// Read 1024 bytes starting at current position
const buffer = new Uint8Array(1024);
const result = await fs.read(fd, buffer, 0, 1024, null);
console.log(`Read ${result.bytesRead} bytes`);

// Read 512 bytes at specific position
const buffer2 = new Uint8Array(512);
const result2 = await fs.read(fd, buffer2, 0, 512, 1000);
console.log(`Read ${result2.bytesRead} bytes starting at position 1000`);

await fs.close(fd);
```

**Parameters:**

- `fd`: File descriptor to read from
- `buffer`: The buffer to read data into
- `offset`: Offset in the buffer to start writing at
- `length`: Number of bytes to read
- `position`: Position in file to read from (`null` for current position, `undefined` for current position)

**Returns:** `Promise<{bytesRead: number, buffer: Uint8Array}>` - Object containing bytes read and modified buffer

**⚠️ Node.js Compatibility Note**: While similar to Node.js `fs.read()`, the returned `buffer` may be a **different object** due to `Comlink.transfer()`. Unlike Node.js where the same buffer object is modified in-place, here you must use the returned buffer for safety.

**⚠️ CRITICAL WARNING**: The `read()` method uses `Comlink.transfer()` for efficient buffer handling across Web Worker boundaries. This requires **bidirectional transfer**:

1. **From main window to worker**: You must transfer buffer ownership using `transfer(buffer, [buffer.buffer])`
2. **From worker to main window**: The worker transfers the modified buffer back to you

**🚨 NEVER USE THE ORIGINAL BUFFER AFTER TRANSFER** - it becomes detached and unusable. **ALWAYS use the buffer returned from the method**. Using the original buffer will result in silent data corruption or errors.

This ensures zero-copy performance but requires careful buffer management. See the usage examples below for proper implementation.

**Behavior:**

- Returns `0` when reaching end of file
- Automatically advances file position if `position` is `null` or `undefined`
- Reads up to `length` bytes, but may read fewer if end of file is reached
- Throws error if reading beyond file bounds

### Buffer Transfer Usage

**Important**: When using `read()` from the main window, you must transfer buffer ownership to the worker. The worker then transfers the modified buffer back to you.

#### From Main Window (Browser)

```typescript
import { transfer } from 'comlink';

// Create buffer in main window
const buffer = new Uint8Array(64);

// Transfer buffer ownership to worker when calling read()
const { bytesRead, buffer: modifiedBuffer } = await fs.read(
    fd,
    transfer(buffer, [buffer.buffer]), // Transfer ownership to worker
    0,
    buffer.length,
    null
);

// Now modifiedBuffer is "alive" again in main window
console.log('bytesRead =', bytesRead);

// Work directly with the returned buffer
const text = new TextDecoder().decode(modifiedBuffer.subarray(0, bytesRead));
console.log('read:', text);

// Note: The original 'buffer' is now detached and cannot be used
// Always use 'modifiedBuffer' from the result
```

#### From Worker (Direct Usage)

```typescript
// When using OPFSWorker directly in a worker
const buffer = new Uint8Array(64);
const { bytesRead, buffer: modifiedBuffer } = await fs.read(fd, buffer, 0, buffer.length, null);

// modifiedBuffer contains the read data
const data = modifiedBuffer.subarray(0, bytesRead);
```

#### Common Patterns

**Reading in chunks:**

```typescript
const fd = await fs.open('/data/large-file.txt');
const chunkSize = 1024;
let buffer = new Uint8Array(chunkSize); // Use 'let' for reassignment

try {
    while (true) {
        const result = await fs.read(
            fd,
            transfer(buffer, [buffer.buffer]),
            0,
            chunkSize,
            null
        );

        if (result.bytesRead === 0) break; // EOF

        // Process the chunk
        const chunk = result.buffer.subarray(0, result.bytesRead);
        processChunk(chunk);

        // Create new buffer for next iteration (previous one was transferred)
        buffer = new Uint8Array(chunkSize);
    }
} finally {
    await fs.close(fd);
}
```

**Reading at specific positions:**

```typescript
const fd = await fs.open('/data/file.txt');
const buffer = new Uint8Array(100);

// Read 100 bytes starting at position 500
const result = await fs.read(
    fd,
    transfer(buffer, [buffer.buffer]),
    0,
    100,
    500
);

console.log(`Read ${result.bytesRead} bytes from position 500`);
```

## Writing Data

### `write(fd: number, buffer: Uint8Array, offset?: number, length?: number, position?: number | null): Promise<number>`

Writes data from a buffer to a file descriptor.

```typescript
const fd = await fs.open('/data/output.txt', { create: true });

// Write entire buffer at current position
const data = new TextEncoder().encode('Hello, World!');
const bytesWritten = await fs.write(fd, data);
console.log(`Wrote ${bytesWritten} bytes`);

// Write portion of buffer at specific position
const data2 = new TextEncoder().encode('Additional text');
const bytesWritten2 = await fs.write(fd, data2, 0, 10, 100);
console.log(`Wrote ${bytesWritten2} bytes at position 100`);

await fs.close(fd);
```

**Parameters:**

- `fd`: File descriptor to write to
- `buffer`: Buffer containing data to write
- `offset` (optional): Offset in buffer to start reading from (default: `0`)
- `length` (optional): Number of bytes to write (default: entire buffer from offset)
- `position` (optional): Position in file to write to (`null`/`undefined` for current position)

**Returns:** `Promise<number>` - Number of bytes actually written

**Behavior:**

- Automatically advances file position if `position` is `null` or `undefined`
- Extends file size if writing beyond current end
- Triggers file change notifications for watching systems

## File Positioning

File descriptors maintain a current position that advances with read/write operations. You can control positioning through the `position` parameter:

```typescript
const fd = await fs.open('/data/file.txt');

// Read at current position (starts at 0)
const buffer1 = new Uint8Array(10);
const result1 = await fs.read(fd, buffer1, 0, 10, null); // Position advances to 10

// Read at current position (continues from 10)
const buffer2 = new Uint8Array(10);
const result2 = await fs.read(fd, buffer2, 0, 10, null); // Position advances to 20

// Read at specific position (doesn't change current position)
const buffer3 = new Uint8Array(10);
const result3 = await fs.read(fd, buffer3, 0, 10, 0); // Reads from beginning, position stays at 20

await fs.close(fd);
```

**Position Behavior:**

- **`null`**: Use current position, then advance it
- **`undefined`**: Use current position, then advance it
- **`number`**: Use specified position, don't change current position

## File Operations

### `fstat(fd: number): Promise<FileStat>`

Get file status information by file descriptor.

```typescript
const fd = await fs.open('/data/file.txt');
const stats = await fs.fstat(fd);

console.log(`File size: ${stats.size} bytes`);
console.log(`Last modified: ${stats.mtime}`);
console.log(`Is file: ${stats.isFile}`);

// If hashing is enabled, hash will be included
if (stats.hash) {
    console.log(`Hash: ${stats.hash}`);
}

await fs.close(fd);
```

**Returns:** `Promise<FileStat>` - File statistics object

### `ftruncate(fd: number, size: number = 0): Promise<void>`

Truncate file to specified size.

```typescript
const fd = await fs.open('/data/file.txt', { create: true });

// Write some data
const data = new TextEncoder().encode('Hello, World!');
await fs.write(fd, data);

// Truncate to 5 bytes
await fs.ftruncate(fd, 5);

// File now contains only "Hello"
const buffer = new Uint8Array(10);
const result = await fs.read(fd, buffer, 0, 10, 0);
console.log(new TextDecoder().decode(result.buffer.subarray(0, result.bytesRead))); // "Hello"

await fs.close(fd);
```

**Parameters:**

- `fd`: File descriptor
- `size`: New file size in bytes (default: `0`)

**Behavior:**

- Adjusts current position if it's beyond the new file size
- Triggers file change notifications
- Automatically flushes changes to storage

### `fsync(fd: number): Promise<void>`

Synchronize file data to storage (equivalent to POSIX `fsync`).

```typescript
const fd = await fs.open('/data/critical.txt', { create: true });

// Write critical data
const data = new TextEncoder().encode('Important information');
await fs.write(fd, data);

// Ensure data is written to storage
await fs.fsync(fd);

await fs.close(fd);
```

**⚠️ Power-Loss Safety Disclaimer**: Unlike traditional filesystems, OPFS `fsync()` is **best-effort only**. **There are NO guarantees of power-loss safety** - the browser decides when/if to actually write data to disk. This is fundamentally different from POSIX `fsync()` which provides durability guarantees.

**Use Cases:**

- Ensuring critical data is persisted before closing
- Database transaction commits
- Log file integrity
- Critical file operations

## Closing Files

### `close(fd: number): Promise<void>`

Closes a file descriptor and releases associated resources.

```typescript
const fd = await fs.open('/data/file.txt');

// Use the file descriptor
const buffer = new Uint8Array(1024);
await fs.read(fd, buffer, 0, 1024, null);

// Always close when done
await fs.close(fd);
```

**Important Notes:**

- **Always close file descriptors** when you're done with them
- Unclosed file descriptors consume system resources
- The file system automatically flushes pending writes before closing
- File descriptors are automatically closed when the worker is disposed

## Error Handling

File descriptor operations can fail for various reasons. Always handle errors appropriately:

```typescript
try {
    const fd = await fs.open('/data/file.txt');

    try {
        const buffer = new Uint8Array(1024);
        const result = await fs.read(fd, buffer, 0, 1024, null);
        console.log(`Read ${result.bytesRead} bytes`);
    } finally {
        // Always close, even if read fails
        await fs.close(fd);
    }
} catch (error) {
    if (error instanceof OPFSError) {
        switch (error.code) {
            case 'EEXIST':
                console.error('File already exists');
                break;
            case 'EISDIR':
                console.error('Path is a directory');
                break;
            default:
                console.error('File operation failed:', error.message);
        }
    } else {
        console.error('Unexpected error:', error);
    }
}
```

**Common Error Codes:**

- `'EEXIST'`: File already exists (with `exclusive: true`)
- `'EISDIR'`: Path is a directory
- `'OPEN_FAILED'`: General open failure
- `'READ_FAILED'`: Read operation failure
- `'WRITE_FAILED'`: Write operation failure
- `'SYNC_FAILED'`: Sync operation failure

## Performance Considerations

### 🚨 **CRITICAL MEMORY WARNING**

**⚠️ FOR LARGE FILES - ALWAYS READ IN CHUNKS, NEVER READ THE ENTIRE FILE AT ONCE!**

**Reading large files in one operation can crash the browser tab due to memory exhaustion.** Browsers have limited memory per tab, and creating massive buffers (hundreds of MB or GB) will cause:

- **Tab crashes**
- **Browser freezes**
- **Out of memory errors**
- **Poor user experience**

**✅ GOOD**: `const buffer = new Uint8Array(8192); // 8KB chunks`
**❌ BAD**: `const buffer = new Uint8Array(fileSize); // Entire file!`

### Buffer Management

Reuse buffers when possible to reduce memory allocation:

```typescript
const fd = await fs.open('/data/large-file.txt');
const buffer = new Uint8Array(8192); // 8KB buffer

let totalBytes = 0;
let bytesRead;

// Read file in chunks using the same buffer
while (true) {
    const result = await fs.read(fd, buffer, 0, buffer.length, null);
    if (result.bytesRead === 0) break;

    totalBytes += result.bytesRead;
    // Process result.buffer.subarray(0, result.bytesRead)
}

await fs.close(fd);
```

### Batch Operations

Group related operations together:

```typescript
const fd = await fs.open('/data/log.txt', { create: true });

// Batch multiple writes
const entries = [
    'User login',
    'Data processed',
    'Operation completed'
];

for (const entry of entries) {
    const data = new TextEncoder().encode(entry + '\n');
    await fs.write(fd, data);
}

// Single sync at the end
await fs.fsync(fd);
await fs.close(fd);
```

### File Descriptor Limits

Monitor the number of open file descriptors:

```typescript
// Check how many files are open
console.log(`Open files: ${fs.openFiles.size}`);

// Close unused file descriptors promptly
const unusedFds = [];
// ... track unused file descriptors ...
for (const fd of unusedFds) {
    await fs.close(fd);
}
```

## Examples

### Reading Large Files in Chunks

```typescript
async function readLargeFile(filePath: string, chunkSize: number = 8192) {
    const fd = await fs.open(filePath);
    const chunks: Uint8Array[] = [];

    try {
        while (true) {
            // Create new buffer for each iteration (previous one was transferred)
            const buffer = new Uint8Array(chunkSize);

            const result = await fs.read(fd, buffer, 0, chunkSize, null);
            if (result.bytesRead === 0) break;

            // Copy the chunk data from the returned buffer
            const chunk = new Uint8Array(result.bytesRead);
            chunk.set(result.buffer.subarray(0, result.bytesRead));
            chunks.push(chunk);
        }

        return chunks;
    } finally {
        await fs.close(fd);
    }
}

// Usage
const chunks = await readLargeFile('/data/large-file.dat', 16384);
console.log(`Read ${chunks.length} chunks`);
```

### Binary File Processing

```typescript
async function processBinaryFile(filePath: string) {
    const fd = await fs.open(filePath);

    try {
        // Read header (first 16 bytes)
        const headerBuffer = new Uint8Array(16);
        const headerResult = await fs.read(fd, headerBuffer, 0, 16, 0);

        // Process header
        const header = new DataView(headerResult.buffer.buffer);
        const fileType = header.getUint32(0, true);
        const dataSize = header.getUint32(4, true);

        // Read data section
        const dataBuffer = new Uint8Array(dataSize);
        const dataResult = await fs.read(fd, dataBuffer, 0, dataSize, 16);

        return { fileType, dataSize, data: dataBuffer };
    } finally {
        await fs.close(fd);
    }
}
```

### Log File Management

```typescript
class LogManager {
    private fd: number | null = null;
    private logPath: string;

    constructor(logPath: string) {
        this.logPath = logPath;
    }

    async open() {
        this.fd = await fs.open(this.logPath, { create: true });
    }

    async writeLog(level: string, message: string) {
        if (!this.fd) throw new Error('Log file not open');

        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message}\n`;
        const data = new TextEncoder().encode(logEntry);

        await fs.write(this.fd, data);
    }

    async flush() {
        if (this.fd) {
            await fs.fsync(this.fd);
        }
    }

    async close() {
        if (this.fd) {
            await fs.close(this.fd);
            this.fd = null;
        }
    }
}

// Usage
const logger = new LogManager('/logs/app.log');
await logger.open();
await logger.writeLog('INFO', 'Application started');
await logger.writeLog('ERROR', 'Something went wrong');
await logger.flush();
await logger.close();
```

### File Copy with Progress

```typescript
async function copyFileWithProgress(sourcePath: string, destPath: string, onProgress?: (bytes: number) => void) {
    const sourceFd = await fs.open(sourcePath);
    const destFd = await fs.open(destPath, { create: true, truncate: true });

    try {
        const buffer = new Uint8Array(8192);
        let totalBytes = 0;

        while (true) {
            const result = await fs.read(sourceFd, buffer, 0, buffer.length, null);
            if (result.bytesRead === 0) break;

            await fs.write(destFd, result.buffer, 0, result.bytesRead);
            totalBytes += result.bytesRead;

            if (onProgress) {
                onProgress(totalBytes);
            }
        }

        await fs.fsync(destFd);
    } finally {
        await fs.close(sourceFd);
        await fs.close(destFd);
    }

    return totalBytes;
}

// Usage
const totalBytes = await copyFileWithProgress(
    '/source/large-file.dat',
    '/dest/large-file.dat',
    (bytes) => console.log(`Copied ${bytes} bytes`)
);
console.log(`Copy complete: ${totalBytes} bytes`);
```

## Best Practices

1. **🚨 NEVER read entire large files at once** - use chunk-based reading to prevent browser crashes
2. **Always close file descriptors** in a `finally` block or use try-with-resources pattern
3. **Reuse buffers** for multiple read/write operations to reduce memory allocation
4. **Use appropriate buffer sizes** - too small causes many operations, too large wastes memory (8KB-64KB recommended)
5. **Flush critical data** with `fsync()` before closing important files
6. **Handle errors gracefully** and provide meaningful error messages
7. **Monitor resource usage** to avoid hitting file descriptor limits
8. **Use positioned I/O** when you need random access without changing current position
9. **Batch operations** when possible to reduce overhead

## Limitations

- **Browser-specific**: File descriptor behavior may vary between browsers
- **OPFS constraints**: Subject to browser storage limits and OPFS implementation details
- **No file locking**: Concurrent access to the same file from multiple workers may cause issues
- **Position limits**: File positions are limited by JavaScript number precision (2^53 - 1)
- **No direct memory mapping**: Files must be read into buffers rather than memory-mapped
