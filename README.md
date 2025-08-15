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
- 👀 **File watching**: Polling-based change detection for files and directories
- 📡 **Event broadcasting**: Broadcast file system changes to other contexts (tabs, workers, etc.)
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

    // Mount is optional - OPFS root is used by default
    // await fs.mount('/my-app'); // Uses custom subdirectory

    // Write a file (auto-mounts if not mounted)
    await fs.writeFile('/config.json', JSON.stringify({ theme: 'dark' }));

    // Read the file back
    const config = await fs.readFile('/config.json');
    console.log(JSON.parse(config));

    // Handle binary files
    const imageData = new Uint8Array([/* binary data */]);
    await fs.writeFile('/image.png', imageData);
    const binaryData = await fs.readFile('/image.png', 'binary');
}

// With watch callbacks
async function exampleWithWatch() {
    const fs = await createWorker(
        (event) => {
            console.log('File changed:', event);
        },
        { watchInterval: 500 }
    );

    await fs.watch('/docs');
}
```

> **Note:** The onChange callback will be called for all internal file changes (made by the worker itself), not just for watched paths. You only need to call `fs.watch` to start watching for changes from external sources.

### Manual Worker Setup

For more control over the worker lifecycle, use the worker directly with your bundler:

```typescript
import OPFSWorker from 'opfs-worker/raw?worker';
import { wrap } from 'comlink';

async function example() {
    // Create and wrap the worker
    const worker = wrap(new OPFSWorker());

    // Mount is optional - OPFS root is used by default
    // await worker.mount(); // Uses OPFS root directory
    // await worker.mount('/my-app'); // Uses custom subdirectory

    // Use the file system (auto-mounts if not mounted)
    await worker.writeFile('/config.json', JSON.stringify({ theme: 'dark' }));
    const config = await worker.readFile('/config.json');
    console.log(JSON.parse(config));
}

// With watch callbacks
async function exampleWithWatch() {
    const worker = wrap(new OPFSWorker(
        (event) => console.log('File changed:', event),
        { 
            watchInterval: 500,
            hashAlgorithm: 'SHA-1'
        }
    ));

    await worker.mount('/my-app');
    await worker.watch('/docs');
}
```

**Note:** Manual worker setup requires a bundler that supports Web Workers (like Vite, Webpack, Rollup, etc.) and the `comlink` package for communication between the main thread and worker.

**Watch Callbacks:** File watching with callbacks is available with both `createWorker()` and raw worker usage. The `createWorker()` function uses Comlink.proxy to handle function serialization across worker boundaries.

### Advanced Usage

```typescript
import { createWorker } from 'opfs-worker';

async function advancedExample() {
    const fs = await createWorker();
    // Mount is optional - auto-mounts to OPFS root if not called
    // await fs.mount('/my-app'); // For custom subdirectory

    // Create directories
    await fs.mkdir('/data/logs', { recursive: true });

    // Write multiple files
    await fs.writeFile('/data/config.json', JSON.stringify({ version: '1.0' }));
    await fs.writeFile('/data/logs/app.log', 'Application started\n');

    // Handle binary files
    const imageData = new Uint8Array([/* binary data */]);
    await fs.writeFile('/data/image.png', imageData);
    const binaryData = await fs.readFile('/data/image.png', 'binary');

    // Append to a file
    await fs.appendFile('/data/logs/app.log', `${new Date().toISOString()}: User logged in\n`);

    // Get file statistics with hash
    const stats = await fs.stat('/data/config.json');
    
    console.log(`File size: ${stats.size} bytes`);
    if (stats.hash) {
        console.log(`Hash: ${stats.hash}`);
    }

    // List directory contents
    const files = await fs.readDir('/data');
    files.forEach(item => {
        console.log(`${item.name} - ${item.isFile ? 'file' : 'directory'}`);
    });


}
```

### Hash Algorithm Configuration

The file system now supports global hash algorithm configuration. Instead of passing hash options to individual methods, you can set the hash algorithm once and it will be used for all file operations that support hashing.

```typescript
import { createWorker } from 'opfs-worker';

async function hashExample() {
    const fs = await createWorker();
    
    // Enable SHA-256 hashing globally
    fs.setOptions({ hashAlgorithm: 'SHA-256' });
    
    // Write a file
    await fs.writeFile('/data.txt', 'Hello World');
    
    // Get stats - hash will be included automatically
    const stats = await fs.stat('/data.txt');
    console.log(`Hash: ${stats.hash}`); // SHA-256 hash
    
    // Get file system index - all files will include hashes
    const index = await fs.index();
    for (const [path, stat] of index) {
        if (stat.isFile && stat.hash) {
            console.log(`${path}: ${stat.hash}`);
        }
    }
    
    // Watch events will also include hash information
    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => {
        if (event.data.hash) {
            console.log(`File ${event.data.path} changed, hash: ${event.data.hash}`);
        }
    };
}

// Configure maximum file size for hashing
async function maxFileSizeExample() {
    const fs = await createWorker();
    
    // Set custom maximum file size (100MB instead of default 50MB)
    fs.setOptions({ 
        hashAlgorithm: 'SHA-256',
        maxFileSize: 100 * 1024 * 1024 // 100MB
    });
    
    // Now files up to 100MB will be hashed
    // Files larger than this will not have hash information
    const stats = await fs.stat('/large-file.dat');
    if (stats.hash) {
        console.log(`Hash: ${stats.hash}`);
    } else {
        console.log('File too large for hashing');
    }
}
```

**Supported Hash Algorithms:**
- `'SHA-1'` - Fastest, good for general use (default)
- `'SHA-256'` - More secure, widely supported
- `'SHA-384'` - Higher security
- `'SHA-512'` - Highest security
- `null` - Disable hashing for maximum performance

**Note:** When hashing is enabled, it affects all file operations including `stat()`, `index()`, and watch events. Set to `null` when you don't need hash information to improve performance.

## Demo

Check out the live demo powered by Vite and hosted on GitHub Pages.

[Live Demo](https://kachurun.github.io/opfs-worker/)

## API Reference

- [OPFS Worker](#opfs-worker)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
    - [Inline Worker (Recommended)](#inline-worker-recommended)
    - [Manual Worker Setup](#manual-worker-setup)
    - [Advanced Usage](#advanced-usage)
    - [Hash Algorithm Configuration](#hash-algorithm-configuration)
  - [Demo](#demo)
  - [API Reference](#api-reference)
    - [Entry Points](#entry-points)
      - [Mode 1: Inline Worker](#mode-1-inline-worker)
        - [`createWorker(options?: OPFSOptions)`](#createworkeroptions-opfsoptions)
      - [Mode 2: Manual Worker Setup](#mode-2-manual-worker-setup)
        - [`OPFSWorker`](#opfsworker)
    - [Core Methods](#core-methods)
    - [Mount](#mount)
      - [`mount(root?: string): Promise<boolean>`](#mountroot-string-promiseboolean)
    - [Read File](#read-file)
      - [`readFile(path: string, encoding?: BufferEncoding | 'binary'): Promise<string | Uint8Array>`](#readfilepath-string-encoding-bufferencoding--binary-promisestring--uint8array)
    - [Write File](#write-file)
      - [`writeFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: BufferEncoding): Promise<void>`](#writefilepath-string-data-string--uint8array--arraybuffer-encoding-bufferencoding-promisevoid)
    - [Append File](#append-file)
      - [`appendFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: BufferEncoding): Promise<void>`](#appendfilepath-string-data-string--uint8array--arraybuffer-encoding-bufferencoding-promisevoid)
    - [Create Directory](#create-directory)
      - [`mkdir(path: string, options?: { recursive?: boolean }): Promise<void>`](#mkdirpath-string-options--recursive-boolean--promisevoid)
    - [Read Directory](#read-directory)
      - [`readDir(path: string): Promise<DirentData[]>`](#readdirpath-string--promisedirentdata)
    - [Get Stats](#get-stats)
      - [`stat(path: string): Promise<FileStat>`](#statpath-string-promisefilestat)
    - [Check Existence](#check-existence)
      - [`exists(path: string): Promise<boolean>`](#existspath-string-promiseboolean)
    - [Remove Path](#remove-path)
      - [`remove(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>`](#removepath-string-options--recursive-boolean-force-boolean--promisevoid)
    - [Copy Path](#copy-path)
      - [`copy(source: string, destination: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>`](#copysource-string-destination-string-options--recursive-boolean-force-boolean--promisevoid)
    - [Rename Path](#rename-path)
      - [`rename(oldPath: string, newPath: string): Promise<void>`](#renameoldpath-string-newpath-string-promisevoid)
    - [Clear Directory](#clear-directory)
      - [`clear(path?: string): Promise<void>`](#clearpath-string-promisevoid)
    - [Index File System](#index-file-system)
      - [`index(): Promise<Map<string, FileStat>>`](#index-promisemapstring-filestat)
    - [Sync File System](#sync-file-system)
      - [`sync(entries: [string, string | Uint8Array | Blob][], options?: { cleanBefore?: boolean }): Promise<void>`](#syncentries-string-string--uint8array--blob-options--cleanbefore-boolean--promisevoid)
    - [Watch](#watch)
      - [`watch(path: string): Promise<void>`](#watchpath-string-promisevoid)
    - [Unwatch](#unwatch)
      - [`unwatch(path: string): void`](#unwatchpath-string-void)
    - [Dispose](#dispose)
      - [`dispose(): void`](#dispose-void)
    - [Configuration](#configuration)
      - [`setOptions(options: { watchInterval?: number; hashAlgorithm?: null | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'; maxFileSize?: number }): void`](#setoptionsoptions--watchinterval-number-hashalgorithm-null--sha-1--sha-256--sha-384--sha-512-maxfilesize-number--void)
    - [Resolve Path](#resolve-path)
      - [`realpath(path: string): Promise<string>`](#realpathpath-string-promisestring)
  - [Binary File Handling](#binary-file-handling)
    - [Reading Binary Files](#reading-binary-files)
    - [Writing Binary Files](#writing-binary-files)
    - [Working with Different Data Types](#working-with-different-data-types)
    - [File Upload and Download](#file-upload-and-download)
    - [Supported Encodings](#supported-encodings)
  - [Utility Functions](#utility-functions)
    - [Path Utilities](#path-utilities)
    - [Data Conversion](#data-conversion)
    - [File System Utilities](#file-system-utilities)
  - [Types](#types)
    - [`FileStat`](#filestat)
    - [`DirentData`](#direntdata)
    - [`RemoteOPFSWorker`](#remoteopfsworker)
  - [Error Types](#error-types)
  - [Browser Support](#browser-support)
  - [Development](#development)
    - [Building](#building)
    - [Development Server](#development-server)
    - [Testing](#testing)
    - [Linting](#linting)
  - [License](#license)
  - [Contributing](#contributing)

### Entry Points

#### Mode 1: Inline Worker

##### `createWorker(options?: OPFSOptions)`

Creates a new file system instance with an inline worker.

```typescript
import { createWorker } from 'opfs-worker/inline';

// Basic usage
const fs = await createWorker();

// With options
const fs = await createWorker({ 
    watchInterval: 500,
    hashAlgorithm: 'SHA-256',
    broadcastChannel: 'my-app-events'
});

// Listen for file change events via BroadcastChannel
const channel = new BroadcastChannel('my-app-events');
channel.onmessage = (event) => {
    console.log('File changed:', event.data);
};
```

**Parameters:**

- `options` (optional): Configuration options
  - `watchInterval` (optional): Polling interval in milliseconds for file watching
  - `hashAlgorithm` (optional): Hash algorithm for file hashing
  - `broadcastChannel` (optional): Custom name for the broadcast channel (default: 'opfs-worker')

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

Initialize the file system within a given directory. **Mount is optional** - if not called, the OPFS root directory is used automatically.

The `root` parameter defines where in OPFS the file system's root will be
created. All file paths passed to the API are relative to this mount point. For
example, after `fs.mount('/dir')`, calling `fs.readFile('/text.txt')` accesses
`/dir/text.txt` in OPFS.

```typescript
// Use OPFS root (default behavior)
await fs.mount();

// Use custom subdirectory
await fs.mount('/my-app');
```

**Parameters:**

- `root` (optional): The root path for the file system (default: '/')

**Returns:** `Promise<boolean>` - True if initialization was successful

**Throws:** `OPFSError` if initialization fails

**Note:** All file operations will automatically mount the OPFS root if no explicit mount has been performed.

**File Change Events:** File change events are sent via BroadcastChannel. Set the `broadcastChannel` option to customize the channel name, or use the default 'opfs-worker' channel.

### Read File

#### `readFile(path: string, encoding?: BufferEncoding | 'binary'): Promise<string | Uint8Array>`

Read a file from the file system. Supports both text and binary files.

```typescript
// Read as text (default)
const content = await fs.readFile('/config/settings.json');

// Read as binary
const binaryData = await fs.readFile('/images/logo.png', 'binary');

// Read with specific encoding
const utf8Content = await fs.readFile('/data/utf8.txt', 'utf-8');

// Handle binary data
const imageBuffer = await fs.readFile('/image.png', 'binary');
const blob = new Blob([imageBuffer], { type: 'image/png' });
const url = URL.createObjectURL(blob);
```

**Parameters:**

- `path`: The path to the file to read
- `encoding` (optional): The encoding to use ('utf-8', 'binary', 'utf-16le', 'ascii', 'latin1', 'base64', 'hex')

**Returns:** `Promise<string | Uint8Array>` - File contents as string or binary data

**Throws:** `FileNotFoundError` if the file doesn't exist

**Binary File Handling:**
- Use `'binary'` encoding to read files as `Uint8Array`
- Binary data can be converted to `Blob` for use with `URL.createObjectURL()`
- Supports various encodings for text files

### Write File

#### `writeFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: BufferEncoding): Promise<void>`

Write data to a file, creating or overwriting it. Supports both text and binary data.

```typescript
// Write text data
await fs.writeFile('/config/settings.json', JSON.stringify({ theme: 'dark' }));

// Write binary data
const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
await fs.writeFile('/data/binary.dat', binaryData);

// Write with specific encoding
await fs.writeFile('/data/utf16.txt', 'Hello World', 'utf-16le');

// Write binary data from file input
const fileInput = document.getElementById('file') as HTMLInputElement;
const file = fileInput.files?.[0];
if (file) {
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile('/uploaded-file', new Uint8Array(arrayBuffer));
}

// Write binary data from fetch
const response = await fetch('/api/image.png');
const arrayBuffer = await response.arrayBuffer();
await fs.writeFile('/downloaded-image.png', new Uint8Array(arrayBuffer));
```

**Parameters:**

- `path`: The path to the file to write
- `data`: The data to write (string, Uint8Array, or ArrayBuffer)
- `encoding` (optional): The encoding to use when writing string data ('utf-8', 'utf-16le', 'ascii', 'latin1', 'base64', 'hex')

**Binary File Handling:**
- Pass `Uint8Array` or `ArrayBuffer` directly for binary data
- Use with file uploads, image processing, or any binary content
- Supports various text encodings for string data

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

#### `readDir(path: string): Promise<DirentData[]>`

Read a directory's contents.

```typescript
// Get simple list of names
const files = await fs.readDir('/users/john/documents');
console.log('Files:', files); // ['readme.txt', 'config.json', 'images']

// Get detailed information
const detailed = await fs.readDir('/users/john/documents');
detailed.forEach(item => {
    console.log(`${item.name} - ${item.isFile ? 'file' : 'directory'}`);
});
```

**Returns:**

- `Promise<DirentData[]>` - Always returns detailed file/directory information

### Get Stats

#### `stat(path: string): Promise<FileStat>`

Get file or directory statistics. If hashing is enabled globally, file hashes will be included automatically.

```typescript
// Basic stats
const stats = await fs.stat('/config/settings.json');
console.log(`File size: ${stats.size} bytes`);
console.log(`Is file: ${stats.isFile}`);
console.log(`Modified: ${stats.mtime}`);

// If hashing is enabled globally, hash will be included
if (stats.hash) {
    console.log(`Hash: ${stats.hash}`);
}
```

**Parameters:**

- `path`: The path to the file or directory

**Returns:** `Promise<FileStat>` - File/directory statistics

**Note:** File hashing is controlled globally via the constructor options or `setOptions()` method. When enabled, all file stats will automatically include hash information.

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

#### `index(): Promise<Map<string, FileStat>>`

Recursively list all files and directories with their stats. If hashing is enabled globally, file hashes will be included automatically.

```typescript
// Get complete file system index
const index = await fs.index();

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

**Returns:** `Promise<Map<string, FileStat>>` - Map of path => FileStat

**Note:** File hashing is controlled globally via the constructor options or `setOptions()` method. When enabled, all file stats in the index will automatically include hash information.

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

### Watch

#### `watch(path: string): Promise<void>`

Start watching a file or directory for changes. Detected changes are sent to the
callback provided to the constructor. The polling interval is configured globally when
creating the worker instance.

```typescript
await fs.watch('/docs');
```

**Parameters:**

- `path`: File or directory to watch

**Note:** Watch callbacks are available with both `createWorker()` and raw worker usage. The `createWorker()` function uses Comlink.proxy to handle function serialization across worker boundaries.

### Unwatch

#### `unwatch(path: string): void`

Stop watching a previously watched path.

```typescript
fs.unwatch('/docs');
```

### Dispose

#### `dispose(): void`

Dispose of resources and clean up the file system instance. This method should be called when the file system instance is no longer needed to properly clean up resources like the broadcast channel and watch timers.

```typescript
// Clean up resources when done
fs.dispose();
```

**Note:** This method closes the broadcast channel, clears watch timers, and cleans up all watched paths. Call this when you're done with the file system instance to prevent memory leaks.

### Configuration

#### `setOptions(options: { watchInterval?: number; hashAlgorithm?: null | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'; maxFileSize?: number }): void`

Update configuration options for the file system, including watch interval, hash algorithm, and maximum file size for hashing.

```typescript
// Enable SHA-256 hashing for all file operations
fs.setOptions({ hashAlgorithm: 'SHA-256' });

// Change watch interval to 100ms for faster change detection
fs.setOptions({ watchInterval: 100 });

// Set custom maximum file size for hashing (100MB)
fs.setOptions({ maxFileSize: 100 * 1024 * 1024 });

// Disable hashing
fs.setOptions({ hashAlgorithm: null });

// Update multiple options at once
fs.setOptions({ 
    watchInterval: 200, 
    hashAlgorithm: 'SHA-1',
    maxFileSize: 50 * 1024 * 1024 // 50MB
});
```

**Parameters:**

- `options.watchInterval` (optional): Polling interval in milliseconds for file watching
- `options.hashAlgorithm` (optional): Hash algorithm to use, or `null` to disable hashing
- `options.maxFileSize` (optional): Maximum file size in bytes for hashing (default: 50MB)

**Note:** When a hash algorithm is set, all file operations (`stat`, `index`, watch events) will automatically include hash information for files within the size limit. Files exceeding `maxFileSize` will not have hash information. Set `hashAlgorithm` to `null` to disable hashing and improve performance.

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

## Binary File Handling

This library provides comprehensive support for binary files, making it easy to work with images, documents, and other binary data.

### Reading Binary Files

```typescript
// Read as binary data
const imageData = await fs.readFile('/image.png', 'binary');
const documentData = await fs.readFile('/document.pdf', 'binary');

// Convert to Blob for use with URLs
const imageBuffer = await fs.readFile('/image.png', 'binary');
const blob = new Blob([imageBuffer], { type: 'image/png' });
const url = URL.createObjectURL(blob);

// Display image
const img = document.createElement('img');
img.src = url;
document.body.appendChild(img);
```

### Writing Binary Files

```typescript
// Write binary data directly
const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
await fs.writeFile('/data.bin', binaryData);

// From file input
const fileInput = document.getElementById('file') as HTMLInputElement;
const file = fileInput.files?.[0];
if (file) {
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile('/uploaded-file', new Uint8Array(arrayBuffer));
}

// From fetch response
const response = await fetch('/api/download/file.pdf');
const arrayBuffer = await response.arrayBuffer();
await fs.writeFile('/downloaded-file.pdf', new Uint8Array(arrayBuffer));

// From canvas
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
// ... draw something ...
canvas.toBlob(async (blob) => {
    if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        await fs.writeFile('/canvas-image.png', new Uint8Array(arrayBuffer));
    }
});
```

### Working with Different Data Types

```typescript
// Convert between different binary formats
const uint8Array = new Uint8Array([1, 2, 3, 4, 5]);
const arrayBuffer = uint8Array.buffer;

// All of these work the same way
await fs.writeFile('/data1.bin', uint8Array);
await fs.writeFile('/data2.bin', arrayBuffer);
await fs.writeFile('/data3.bin', new Uint8Array(arrayBuffer));

// Read back as binary
const data = await fs.readFile('/data1.bin', 'binary');
console.log(data); // Uint8Array
```

### File Upload and Download

```typescript
// Handle file uploads
const handleFileUpload = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(`/uploads/${file.name}`, new Uint8Array(arrayBuffer));
};

// Create downloadable files
const createDownloadLink = async (filePath: string, fileName: string) => {
    const data = await fs.readFile(filePath, 'binary');
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    
    URL.revokeObjectURL(url);
};
```

### Supported Encodings

The library supports various encodings for text files:

- `'utf-8'` (default) - UTF-8 encoding
- `'utf-16le'` - UTF-16 little-endian
- `'ascii'` - ASCII encoding
- `'latin1'` - Latin-1 encoding
- `'base64'` - Base64 encoding
- `'hex'` - Hexadecimal encoding
- `'binary'` - Raw binary data (returns Uint8Array)

## Utility Functions

The library exports several utility functions that can be used independently:

### Path Utilities

```typescript
import { basename, dirname, normalizePath, resolvePath, extname } from 'opfs-worker';

// Extract filename from path
basename('/path/to/file.txt'); // 'file.txt'
basename('/path/to/directory/'); // ''

// Extract directory path
dirname('/path/to/file.txt'); // '/path/to'
dirname('file.txt'); // '/'

// Normalize path to start with '/'
normalizePath('path/to/file'); // '/path/to/file'
normalizePath('/path/to/file'); // '/path/to/file'

// Resolve relative paths
resolvePath('./config/../data/file.txt'); // '/data/file.txt'
resolvePath('/path/to/../file.txt'); // '/path/file.txt'

// Get file extension
extname('/path/to/file.txt'); // '.txt'
extname('/path/to/file'); // ''
extname('/path/to/file.name.ext'); // '.ext'
```

### Data Conversion

```typescript
import { convertBlobToUint8Array } from 'opfs-worker';

// Convert Blob to Uint8Array
const fileInput = document.getElementById('file') as HTMLInputElement;
const file = fileInput.files?.[0];
if (file) {
    const data = await convertBlobToUint8Array(file);
    await fs.writeFile('/uploaded-file', data);
}
```

### File System Utilities

```typescript
import { checkOPFSSupport, splitPath, joinPath } from 'opfs-worker';

// Check if browser supports OPFS
checkOPFSSupport(); // Throws error if not supported

// Path manipulation
splitPath('/path/to/file'); // ['path', 'to', 'file']
joinPath(['path', 'to', 'file']); // '/path/to/file'
```

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