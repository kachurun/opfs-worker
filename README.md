# OPFS Worker

[![npm version](https://img.shields.io/npm/v/opfs-worker)](https://www.npmjs.com/package/opfs-worker)

A robust TypeScript library for working with Origin Private File System (OPFS) through Web Workers, providing a Node.js-like file system API for browser environments.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Demo](#demo)
- [API Reference](#api-reference)
- [Types](#types)
- [Error Types](#error-types)
- [Browser Support](#browser-support)
- [Development](#development)
- [License](#license)
- [Contributing](#contributing)

## Features

- 🌐 **Cross-browser compatible**: Works in all modern browsers including Safari, Firefox, Chrome, and Edge
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

**Dependencies:**

- `comlink` - Required for both modes (automatically included with inline mode)
- A bundler with Web Worker support (Vite, Webpack, Rollup, etc.) - Required for manual worker setup

## Quick Start

This library provides two ways to use OPFS with Web Workers:

### Inline Worker (Recommended)

The easiest way to get started - just import and use:

```typescript
import { createWorker } from 'opfs-worker';

async function example() {
    // Create a file system instance
    const fs = await createWorker();

    // Optional: mount to a custom root directory
    await fs.mount('/my-app');

    // Write a file
    await fs.writeFile('/config.json', JSON.stringify({ theme: 'dark' }));

    // Read the file back
    const config = await fs.readFile('/config.json');
    console.log(JSON.parse(config));
}
```

> **Note:** By default, the file system automatically mounts to `'/'` on first use.
> Call `mount` to specify a different root directory. After `fs.mount('/dir')`,
> calling `fs.readFile('/text.txt')` accesses the file located at `/dir/text.txt`
> inside OPFS.

To work with binary data, write using `Uint8Array`/`ArrayBuffer` and read with `'binary'` encoding:

```typescript
const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
await fs.writeFile('/data.bin', bytes);

const data = await fs.readFile('/data.bin', 'binary'); // Uint8Array
```

### Manual Worker Setup

For more control over the worker lifecycle, use the worker directly with your bundler:

```typescript
import OPFSWorker from 'opfs-worker/raw?worker';
import { wrap } from 'comlink';

async function example() {
    // Create and wrap the worker
    const worker = wrap(new OPFSWorker());

    // Optional: mount to a custom root directory
    await worker.mount('/my-app');

    // Use the file system
    await worker.writeFile('/config.json', JSON.stringify({ theme: 'dark' }));
    const config = await worker.readFile('/config.json');
    console.log(JSON.parse(config));
}
```

**Note:** Manual worker setup requires a bundler that supports Web Workers (like Vite, Webpack, or Rollup) and the `comlink` package for communication between the main thread and worker.

### Advanced Usage

```typescript
import { createWorker } from 'opfs-worker';

async function advancedExample() {
    const fs = await createWorker();

    // Optional: mount to a custom root directory
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

## Demo

Check out the live demo powered by Vite and hosted on GitHub Pages.

[Live Demo](https://kachurun.github.io/opfs-worker/)

## API Reference

- [Entry Points](#entry-points)
  - [`createWorker()`](#createworker)
- [Core Methods](#core-methods)
  - [Mount](#mountroot-string-promiseboolean)
  - [Read File](#readfilepath-string-encoding-bufferencoding--binary-promisestring--uint8array)
  - [Write File](#writefilepath-string-data-string--uint8array--arraybuffer-encoding-bufferencoding-promisevoid)
  - [Append File](#appendfilepath-string-data-string--uint8array--arraybuffer-encoding-bufferencoding-promisevoid)
  - [Make Directory](#mkdirpath-string-options--recursive-boolean--promisevoid)
  - [Read Directory](#readdirpath-string-options--withfiletypes-boolean--promisestring--direntdata)
  - [File Stat](#statpath-string-options--includehash-boolean-hashalgorithm-string--promisefilestat)
  - [Exists](#existspath-string-promiseboolean)
  - [Remove](#removepath-string-options--recursive-boolean-force-boolean--promisevoid)
  - [Copy](#copysource-string-destination-string-options--recursive-boolean-force-boolean--promisevoid)
  - [Rename](#renameoldpath-string-newpath-string-promisevoid)
  - [Clear](#clearpath-string-promisevoid)
  - [Index](#indexoptions--includehash-boolean-hashalgorithm-string--promisemapstring-filestat)
  - [Sync](#syncentries-string-string--uint8array--blob-options--cleanbefore-boolean--promisevoid)
  - [Real Path](#realpathpath-string-promisestring)

### Entry Points

#### Mode 1: Inline Worker

##### `createWorker()`

Creates a new file system instance with an inline worker.

```typescript
import { createWorker } from 'opfs-worker/inline';

const fs = await createWorker();
```

**Returns:** `Promise<RemoteOPFSWorker>` - A remote file system interface

#### Mode 2: Manual Worker Setup

##### `OPFSWorker`

The worker class that can be imported directly.

```typescript
import OPFSWorker from 'opfs-worker/raw?worker';
import { wrap } from 'comlink';

const worker = wrap(new OPFSWorker());
```

**Note:** This approach requires a bundler that supports Web Workers (Vite, Webpack, Rollup, etc.) and the `comlink` package.

### Core Methods

### Mount

#### `mount(root?: string): Promise<boolean>`

Initialize the file system within a given directory.
If omitted, the file system automatically mounts to `'/'` on first use.
Use `mount` when you need a different root directory.

The `root` parameter defines where in OPFS the file system's root will be
created. All file paths passed to the API are relative to this mount point. For
example, after `fs.mount('/dir')`, calling `fs.readFile('/text.txt')` accesses
`/dir/text.txt` in OPFS.

```typescript
await fs.mount('/my-app');
```

**Parameters:**

- `root` (optional): The root path for the file system (default: '/')

**Returns:** `Promise<boolean>` - True if initialization was successful

**Throws:** `OPFSError` if initialization fails

### Read File

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

### Write File

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

### Append File

#### `appendFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: BufferEncoding): Promise<void>`

Append data to the end of a file.

```typescript
// Append text to a log file
await fs.appendFile('/logs/app.log', `[${new Date().toISOString()}] User logged in\n`);

// Append binary data
const additionalData = new Uint8Array([6, 7, 8]);
await fs.appendFile('/data/binary.dat', additionalData);
```

### Create Directory

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

### Read Directory

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

### Get Stats

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

### Check Existence

#### `exists(path: string): Promise<boolean>`

Check if a file or directory exists.

```typescript
const exists = await fs.exists('/config/settings.json');
console.log(`File exists: ${exists}`);
```

**Returns:** `Promise<boolean>` - True if the file or directory exists

### Remove Path

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

### Copy Path

#### `copy(source: string, destination: string, options?: { recursive?: boolean; force?: boolean; filter?: (source: string, destination: string, exists: boolean) => boolean | Promise<boolean> }): Promise<void>`

Copy files and directories.

```typescript
// Copy a file
await fs.copy('/source/file.txt', '/dest/file.txt');

// Copy a directory and all its contents
await fs.copy('/source/dir', '/dest/dir', { recursive: true });

// Copy without overwriting existing files
await fs.copy('/source', '/dest', { recursive: true, force: false });

// Skip existing files using a filter
await fs.copy('/src', '/dest', {
    recursive: true,
    filter: (_src, _dest, exists) => !exists
});
```

**Parameters:**

- `source`: The source path to copy from
- `destination`: The destination path to copy to
- `options.recursive` (optional): Whether to copy directories recursively (default: false)
- `options.force` (optional): Whether to overwrite existing files (default: true)
- `options.filter` (optional): Predicate returning `true` to copy a path. Receives `(source, destination, exists)`

### Rename Path

#### `rename(oldPath: string, newPath: string): Promise<void>`

Rename a file or directory.

```typescript
await fs.rename('/old/path/file.txt', '/new/path/renamed.txt');
```

**Parameters:**

- `oldPath`: The current path of the file or directory
- `newPath`: The new path for the file or directory

### Clear Directory

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

### Index File System

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

### Sync File System

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

### Resolve Path

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
- `OPFSNotMountedError` - Thrown when OPFS is not mounted and automatic mounting fails
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
