# API Reference

This document contains the complete API reference for OPFS Worker.

## Table of Contents

- [API Reference](#api-reference)
  - [Table of Contents](#table-of-contents)
  - [Entry Points](#entry-points)
    - [Mode 1: Inline Worker](#mode-1-inline-worker)
      - [`createWorker(options?: OPFSOptions)`](#createworkeroptions-opfsoptions)
    - [Mode 2: Manual Worker Setup](#mode-2-manual-worker-setup)
      - [`OPFSWorker`](#opfsworker)
  - [Core Methods](#core-methods)
    - [Read File](#read-file)
      - [`readFile(path: string, encoding?: Encoding | 'binary'): Promise<string | Uint8Array>`](#readfilepath-string-encoding-encoding--binary-promisestring--uint8array)
    - [Write File](#write-file)
      - [`writeFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: Encoding): Promise<void>`](#writefilepath-string-data-string--uint8array--arraybuffer-encoding-encoding-promisevoid)
    - [Append File](#append-file)
      - [`appendFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: Encoding): Promise<void>`](#appendfilepath-string-data-string--uint8array--arraybuffer-encoding-encoding-promisevoid)
    - [Create Directory](#create-directory)
      - [`mkdir(path: string, options?: { recursive?: boolean }): Promise<void>`](#mkdirpath-string-options--recursive-boolean--promisevoid)
    - [Read Directory](#read-directory)
      - [`readDir(path: string): Promise<DirentData[]>`](#readdirpath-string-promisedirentdata)
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
      - [`watch(path: string, options?: WatchOptions): Promise<void>`](#watchpath-string-options-watchoptions-promisevoid)
      - [Watch Behavior](#watch-behavior)
    - [Unwatch](#unwatch)
      - [`unwatch(path: string): void`](#unwatchpath-string-void)
    - [Dispose](#dispose)
      - [`dispose(): void`](#dispose-void)
    - [Configuration](#configuration)
      - [`setOptions(options: { root?: string; hashAlgorithm?: null | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'; maxFileSize?: number }): Promise<void>`](#setoptionsoptions--root-string-hashalgorithm-null--sha-1--sha-256--sha-384--sha-512-maxfilesize-number--promisevoid)
    - [Resolve Path](#resolve-path)
      - [`realpath(path: string): Promise<string>`](#realpathpath-string-promisestring)
  - [File Descriptors](#file-descriptors)
    - [File Descriptors Overview](#file-descriptors-overview)
    - [File Descriptor Methods](#file-descriptor-methods)
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

## Entry Points

### Mode 1: Inline Worker

#### `createWorker(options?: OPFSOptions)`

Creates a new file system instance with an inline worker.

```typescript
import { createWorker } from 'opfs-worker';

// Basic usage
const fs = await createWorker();

// With options
const fs = await createWorker({
    root: '/my-app',
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
  - `root` (optional): Root path for the file system (default: '/')
  - `namespace` (optional): Namespace for the file system (default: 'opfs-worker:${root}'), will be sent to the BroadcastChannel with each event
  - `hashAlgorithm` (optional): Hash algorithm for file hashing
  - `broadcastChannel` (optional): Custom name for the broadcast channel (default: 'opfs-worker')

**Returns:** `Promise<RemoteOPFSWorker>` - A remote file system interface

### Mode 2: Manual Worker Setup

#### `OPFSWorker`

The worker class that can be imported directly.

```typescript
import OPFSWorker from 'opfs-worker/raw?worker';
import { wrap } from 'comlink';

const worker = wrap(new OPFSWorker());
```

**Note:** This approach requires a bundler that supports Web Workers (Vite, Webpack, Rollup, etc.) and the `comlink` package.

## Core Methods

### Read File

#### `readFile(path: string, encoding?: Encoding | 'binary'): Promise<string | Uint8Array>`

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

**Throws:** `ExistenceError` if the file doesn't exist

**Binary File Handling:**

- Use `'binary'` encoding to read files as `Uint8Array`
- Binary data can be converted to `Blob` for use with `URL.createObjectURL()`
- Supports various encodings for text files

### Write File

#### `writeFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: Encoding): Promise<void>`

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

#### `appendFile(path: string, data: string | Uint8Array | ArrayBuffer, encoding?: Encoding): Promise<void>`

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

#### `watch(path: string, options?: WatchOptions): Promise<void>`

Start watching a file or directory for changes. Detected changes are sent via BroadcastChannel
using the channel name specified in the `broadcastChannel` option.

```typescript
// Start watching a directory recursively (default behavior)
await fs.watch('/docs');

// Start watching a directory shallow (only immediate children)
await fs.watch('/docs', { recursive: false });

// Watch a single file (non-recursive)
await fs.watch('/config.json', { recursive: false });

// Watch with minimatch patterns and include/exclude options
await fs.watch('/**/*.js', {
    recursive: true,
    include: ['**/*.js', '**/*.ts'],
    exclude: ['**/dist/**', '**/node_modules/**']
});

// Listen for changes via BroadcastChannel
const channel = new BroadcastChannel('opfs-worker'); // or your custom channel name
channel.onmessage = (event) => {
    const { path, type, isDirectory, timestamp, hash } = event.data;
    console.log(`File ${path} was ${type} at ${timestamp}`);
    if (hash) console.log(`Hash: ${hash}`);
};
```

**Parameters:**

- `path`: File or directory to watch (supports minimatch glob patterns)
- `options` (optional): Watch options
  - `options.recursive` (optional): Whether to watch recursively (default: `true`)
    - `true`: Watch the entire directory tree
    - `false`: Only watch the specified path and its immediate children (shallow watching)
  - `options.include` (optional): Glob patterns to include in watching (minimatch syntax, default: `['**']`)
  - `options.exclude` (optional): Glob patterns to exclude from watching (minimatch syntax, default: `[]`)

**Note:** File change events are sent via BroadcastChannel. Set the `broadcastChannel` option to customize the channel name, or use the default 'opfs-worker' channel. The `createWorker()` function automatically handles the BroadcastChannel setup.

#### Watch Behavior

The watch system provides real-time change detection with the following characteristics:

- **Immediate Events**: Events are sent immediately when file system operations occur
- **Watched Paths Only**: Events are only sent for paths that are actively being watched
- **Minimatch Support**: Watch paths support glob patterns like `/**/*.js`, `*.txt`, etc.
- **Include/Exclude Filters**: Fine-grained control over which files trigger events
- **Internal Changes Only**: The worker detects changes made through its own operations
- **Efficient**: Only watched paths generate events, reducing unnecessary broadcasts

**Example Watch Patterns:**

```typescript
// Watch all JavaScript files recursively
await fs.watch('/**/*.js');

// Watch source files but exclude build artifacts
await fs.watch('/', {
    recursive: true,
    include: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.d.ts']
});

// Watch immediate children only (shallow)
await fs.watch('/data/*', { recursive: false });

// Watch specific file types in multiple directories
await fs.watch('/**/*.{json,yaml,yml}');
```

### Unwatch

#### `unwatch(path: string): void`

Stop watching a watched path.

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

#### `setOptions(options: { root?: string; hashAlgorithm?: null | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'; maxFileSize?: number }): Promise<void>`

Update configuration options for the file system, including root path, hash algorithm, and maximum file size for hashing.

```typescript
// Change root path (automatically remounts)
await fs.setOptions({ root: '/new-app' });

// Enable SHA-256 hashing for all file operations
await fs.setOptions({ hashAlgorithm: 'SHA-256' });

// Set custom maximum file size for hashing (100MB)
await fs.setOptions({ maxFileSize: 100 * 1024 * 1024 });

// Disable hashing
await fs.setOptions({ hashAlgorithm: null });

// Update multiple options at once
await fs.setOptions({
    root: '/my-app',
    hashAlgorithm: 'SHA-1',
    maxFileSize: 50 * 1024 * 1024 // 50MB
});
```

**Parameters:**

- `options.root` (optional): Root path for the file system
- `options.hashAlgorithm` (optional): Hash algorithm to use, or `null` to disable hashing
- `options.maxFileSize` (optional): Maximum file size in bytes for hashing (default: 50MB)

**Note:** When the `root` option is changed, the file system automatically remounts to the new location. All other options are updated immediately.

### Resolve Path

#### `realpath(path: string): Promise<string>`

Resolve a path to an absolute path.

```typescript
// Resolve relative path
const absolute = await fs.realpath('./config/../data/file.txt');
console.log(absolute); // '/data/file.txt'
```

**Returns:** `Promise<string>` - The absolute normalized path

**Throws:** `ExistenceError` if the path doesn't exist

## File Descriptors

OPFS Worker provides low-level file I/O operations through file descriptors, similar to POSIX file descriptors. File descriptors are useful for:

- **Large file operations**: Reading/writing files in chunks without loading entire content into memory
- **Streaming operations**: Processing files sequentially or in specific positions
- **Performance-critical applications**: Direct file access without the overhead of high-level methods
- **Binary data manipulation**: Working with raw bytes at specific file positions

For comprehensive documentation on file descriptors, see [File Descriptors Guide](file-descriptors.md).

### File Descriptors Overview

File descriptors provide efficient, low-level access to files for reading, writing, and manipulating file data. They maintain a current position that advances with read/write operations and support both sequential and random access patterns.

**Key Benefits:**

- **Efficient I/O**: Direct access to file data without intermediate buffers
- **Position control**: Read/write at specific file positions or advance automatically
- **Resource management**: Automatic cleanup when closed
- **Performance**: Better for large files and streaming operations

### File Descriptor Methods

The following methods are available for working with file descriptors:

- **`open(path, options?)`** - Open a file and return a file descriptor
- **`read(fd, buffer, offset, length, position?)`** - Read data from a file descriptor
- **`write(fd, buffer, offset?, length?, position?)`** - Write data to a file descriptor
- **`fstat(fd)`** - Get file status information by file descriptor
- **`ftruncate(fd, size?)`** - Truncate file to specified size
- **`fsync(fd)`** - Synchronize file data to storage
- **`close(fd)`** - Close a file descriptor

**Quick Example:**

```typescript
const fd = await fs.open('/data/file.txt');
const buffer = new Uint8Array(1024);
const bytesRead = await fs.read(fd, buffer, 0, 1024, null);
console.log(`Read ${bytesRead} bytes`);
await fs.close(fd);
```

**Important:** Always close file descriptors when you're done with them to prevent resource leaks.

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
