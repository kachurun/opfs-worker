# OPFS Worker

A robust TypeScript library for working with Origin Private File System (OPFS) through Web Workers, providing a Node.js-like file system API for browser environments.

## Features

- 🌐 **Cross-browser compatible**: Works in all modern browsers including Safari, Firefox, Chrome
- 🚀 **Web Worker-based**: Runs in a separate thread for better performance
- 📁 **Node.js-like API**: Familiar file system operations (`readFile`, `writeFile`, `mkdir`, etc.)
- 🔒 **Type-safe**: Full TypeScript support with comprehensive type definitions
- 🎯 **Comlink-powered**: Seamless communication between main thread and worker
- 🔐 **Hash support**: Built-in file hash calculation (SHA-1, SHA-256, SHA-384, SHA-512)
- 📊 **File indexing**: Complete file system indexing with metadata
- 🔄 **Sync operations**: Bulk file synchronization from external data
- 🛡️ **Error handling**: Comprehensive error types and handling

## Installation

```bash
npm install opfs-worker
```

## Quick Start

### Basic Usage

```typescript
import { createWorker } from 'opfs-worker/inline';

async function example() {
    // Create a file system instance
    const fs = await createWorker();

    // Mount the file system
    await fs.mount('/my-app');

    // Write a file
    await fs.writeFile('/config.json', JSON.stringify({ theme: 'dark' }));

    // Read the file back
    const config = await fs.readFile('/config.json');
    console.log(JSON.parse(config));
}
```

### Advanced Usage

```typescript
import { createWorker } from 'opfs-worker/inline';

async function advancedExample() {
    const fs = await createWorker();
    await fs.mount('/my-app');

    // Create directories
    await fs.mkdir('/data/logs', { recursive: true });

    // Write multiple files
    await fs.writeFile('/data/config.json', JSON.stringify({ version: '1.0' }));
    await fs.writeFile('/data/logs/app.log', 'Application started\n');

    // Append to a file
    await fs.appendFile('/data/logs/app.log', `${new Date().toISOString()}: User logged in\n`);

    // Get file statistics with hash
    const stats = await fs.stat('/data/config.json', {
        includeHash: true,
        hashAlgorithm: 'SHA-1'
    });
    console.log(`File size: ${stats.size} bytes, Hash: ${stats.hash}`);

    // List directory contents
    const files = await fs.readdir('/data', { withFileTypes: true });
    files.forEach(item => {
        console.log(`${item.name} - ${item.isFile ? 'file' : 'directory'}`);
    });
}
```

## API Reference

### Entry Points

#### `createWorker()`

Creates a new file system instance with an inline worker.

```typescript
import { createWorker } from 'opfs-worker/inline';

const fs = await createWorker();
```

**Returns:** `Promise<RemoteOPFSWorker>` - A remote file system interface

### Core Methods

#### `mount(root?: string): Promise<boolean>`

Initialize the file system within a given directory.

```typescript
await fs.mount('/my-app');
```

**Parameters:**

- `root` (optional): The root path for the file system (default: '/')

**Returns:** `Promise<boolean>` - True if initialization was successful

**Throws:** `OPFSError` if initialization fails

#### `readFile(path: string, encoding?: BufferEncoding | 'binary'): Promise<string | Uint8Array>`

Read a file from the file system.

```typescript
// Read as text (default)
const content = await fs.readFile('/config/settings.json');

// Read as binary
const binaryData = await fs.readFile('/images/logo.png', 'binary');

// Read with specific encoding
const utf8Content = await fs.readFile('/data/utf8.txt', 'utf-8');
```

**Parameters:**

- `path`: The path to the file to read
- `encoding` (optional): The encoding to use ('utf-8', 'binary', etc.)

**Returns:** `Promise<string | Uint8Array>` - File contents

**Throws:** `FileNotFoundError` if the file doesn't exist

#### `writeFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: BufferEncoding): Promise<void>`

Write data to a file, creating or overwriting it.

```typescript
// Write text data
await fs.writeFile('/config/settings.json', JSON.stringify({ theme: 'dark' }));

// Write binary data
const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
await fs.writeFile('/data/binary.dat', binaryData);

// Write with specific encoding
await fs.writeFile('/data/utf16.txt', 'Hello World', 'utf-16le');
```

**Parameters:**

- `path`: The path to the file to write
- `data`: The data to write (string, Uint8Array, or ArrayBuffer)
- `encoding` (optional): The encoding to use when writing string data

#### `appendFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: BufferEncoding): Promise<void>`

Append data to the end of a file.

```typescript
// Append text to a log file
await fs.appendFile('/logs/app.log', `[${new Date().toISOString()}] User logged in\n`);

// Append binary data
const additionalData = new Uint8Array([6, 7, 8]);
await fs.appendFile('/data/binary.dat', additionalData);
```

#### `mkdir(path: string, options?: { recursive?: boolean }): Promise<void>`

Create a directory.

```typescript
// Create a single directory
await fs.mkdir('/users/john');

// Create nested directories
await fs.mkdir('/users/john/documents/projects', { recursive: true });
```

**Parameters:**

- `path`: The path where the directory should be created
- `options.recursive` (optional): Whether to create parent directories if they don't exist

#### `readdir(path: string, options?: { withFileTypes?: boolean }): Promise<string[] | DirentData[]>`

Read a directory's contents.

```typescript
// Get simple list of names
const files = await fs.readdir('/users/john/documents');
console.log('Files:', files); // ['readme.txt', 'config.json', 'images']

// Get detailed information
const detailed = await fs.readdir('/users/john/documents', { withFileTypes: true });
detailed.forEach(item => {
    console.log(`${item.name} - ${item.isFile ? 'file' : 'directory'}`);
});
```

**Returns:**

- `Promise<string[]>` when `withFileTypes` is false or undefined
- `Promise<DirentData[]>` when `withFileTypes` is true

#### `stat(path: string, options?: { includeHash?: boolean; hashAlgorithm?: string }): Promise<FileStat>`

Get file or directory statistics.

```typescript
// Basic stats
const stats = await fs.stat('/config/settings.json');
console.log(`File size: ${stats.size} bytes`);
console.log(`Is file: ${stats.isFile}`);
console.log(`Modified: ${stats.mtime}`);

// Stats with hash
const statsWithHash = await fs.stat('/config/settings.json', {
    includeHash: true,
    hashAlgorithm: 'SHA-1'
});
console.log(`Hash: ${statsWithHash.hash}`);
```

**Parameters:**

- `path`: The path to the file or directory
- `options.includeHash` (optional): Whether to calculate file hash (default: false)
- `options.hashAlgorithm` (optional): Hash algorithm to use ('SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', default: 'SHA-1')

**Returns:** `Promise<FileStat>` - File/directory statistics

#### `exists(path: string): Promise<boolean>`

Check if a file or directory exists.

```typescript
const exists = await fs.exists('/config/settings.json');
console.log(`File exists: ${exists}`);
```

**Returns:** `Promise<boolean>` - True if the file or directory exists

#### `remove(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>`

Remove files and directories.

```typescript
// Remove a file
await fs.remove('/path/to/file.txt');

// Remove a directory and all its contents
await fs.remove('/path/to/directory', { recursive: true });

// Remove with force (ignore if doesn't exist)
await fs.remove('/maybe/exists', { force: true });
```

**Parameters:**

- `path`: The path to remove
- `options.recursive` (optional): Whether to remove directories recursively (default: false)
- `options.force` (optional): Whether to ignore errors if the path doesn't exist (default: false)

#### `copy(source: string, destination: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>`

Copy files and directories.

```typescript
// Copy a file
await fs.copy('/source/file.txt', '/dest/file.txt');

// Copy a directory and all its contents
await fs.copy('/source/dir', '/dest/dir', { recursive: true });

// Copy without overwriting existing files
await fs.copy('/source', '/dest', { recursive: true, force: false });
```

**Parameters:**

- `source`: The source path to copy from
- `destination`: The destination path to copy to
- `options.recursive` (optional): Whether to copy directories recursively (default: false)
- `options.force` (optional): Whether to overwrite existing files (default: true)

#### `rename(oldPath: string, newPath: string): Promise<void>`

Rename a file or directory.

```typescript
await fs.rename('/old/path/file.txt', '/new/path/renamed.txt');
```

**Parameters:**

- `oldPath`: The current path of the file or directory
- `newPath`: The new path for the file or directory

#### `clear(path?: string): Promise<void>`

Clear all contents of a directory without removing the directory itself.

```typescript
// Clear root directory contents
await fs.clear('/');

// Clear specific directory contents
await fs.clear('/data');
```

**Parameters:**

- `path` (optional): The path to the directory to clear (default: '/')

#### `index(options?: { includeHash?: boolean; hashAlgorithm?: string }): Promise<Map<string, FileStat>>`

Recursively list all files and directories with their stats.

```typescript
// Basic index without hash
const index = await fs.index();

// Index with file hash
const indexWithHash = await fs.index({
    includeHash: true,
    hashAlgorithm: 'SHA-1'
});

// Iterate through all files and directories
for (const [path, stat] of index) {
    console.log(`${path}: ${stat.isFile ? 'file' : 'directory'} (${stat.size} bytes)`);
    if (stat.hash) console.log(`  Hash: ${stat.hash}`);
}

// Get specific file stats
const fileStats = index.get('/data/config.json');
if (fileStats) {
    console.log(`File size: ${fileStats.size} bytes`);
    if (fileStats.hash) console.log(`Hash: ${fileStats.hash}`);
}
```

**Parameters:**

- `options.includeHash` (optional): Whether to calculate file hash (default: false)
- `options.hashAlgorithm` (optional): Hash algorithm to use (default: 'SHA-1')

**Returns:** `Promise<Map<string, FileStat>>` - Map of path => FileStat

#### `sync(entries: [string, string | Uint8Array | Blob][], options?: { cleanBefore?: boolean }): Promise<void>`

Synchronize the file system with external data.

```typescript
// Sync with external data
const entries: [string, string | Uint8Array | Blob][] = [
    ['/config.json', JSON.stringify({ theme: 'dark' })],
    ['/data/binary.dat', new Uint8Array([1, 2, 3, 4])],
    ['/upload.txt', new Blob(['file content'], { type: 'text/plain' })]
];

// Sync without clearing existing files
await fs.sync(entries);

// Clean file system and then sync
await fs.sync(entries, { cleanBefore: true });
```

**Parameters:**

- `entries`: Array of [path, data] tuples to sync
- `options.cleanBefore` (optional): Whether to clear the file system before syncing (default: false)

#### `realpath(path: string): Promise<string>`

Resolve a path to an absolute path.

```typescript
// Resolve relative path
const absolute = await fs.realpath('./config/../data/file.txt');
console.log(absolute); // '/data/file.txt'
```

**Returns:** `Promise<string>` - The absolute normalized path

**Throws:** `FileNotFoundError` if the path doesn't exist

## Types

### `FileStat`

File or directory statistics.

```typescript
interface FileStat {
    kind: 'file' | 'directory';
    size: number;
    mtime: string; // ISO string
    ctime: string; // ISO string
    isFile: boolean;
    isDirectory: boolean;
    hash?: string; // Hash of file content (only for files)
}
```

### `DirentData`

Directory entry information.

```typescript
interface DirentData {
    name: string;
    kind: 'file' | 'directory';
    isFile: boolean;
    isDirectory: boolean;
}
```

### `RemoteOPFSWorker`

Remote file system interface type.

```typescript
type RemoteOPFSWorker = Remote<OPFSWorker>;
```

## Error Types

The library provides comprehensive error handling with specific error types:

- `OPFSError` - Base error class for all OPFS-related errors
- `OPFSNotSupportedError` - Thrown when OPFS is not supported in the browser
- `OPFSNotMountedError` - Thrown when OPFS is not mounted
- `PathError` - Thrown for invalid paths or path traversal attempts
- `FileNotFoundError` - Thrown when a requested file doesn't exist
- `DirectoryNotFoundError` - Thrown when a requested directory doesn't exist
- `PermissionError` - Thrown when permission is denied for an operation
- `StorageError` - Thrown when an operation fails due to insufficient storage
- `TimeoutError` - Thrown when an operation times out

## Browser Support

This library works in **all modern browsers**, including Safari, Firefox, Chrome, and Edge.

**Requirements:**

- Web Workers support (available in all modern browsers)
- File System Access API (for OPFS functionality)

**Browser Compatibility:**

- ✅ Chrome 86+
- ✅ Edge 86+
- ✅ Firefox 111+
- ✅ Safari 15.2+
- ✅ Opera 72+

**Note:** The library gracefully handles browsers that don't support OPFS by providing appropriate error messages and fallback behavior.

## Development

### Building

```bash
npm run build
```

### Development Server

```bash
npm run dev
```

### Testing

```bash
npm test
npm run test:coverage
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
