# 🗂️ OPFS Worker

A robust, type-safe TypeScript library for working with the **Origin Private File System (OPFS)** through Web Workers. This library provides a Node.js-like file system API that runs in the browser with full persistence, security, and performance.

## ✨ Features

- 🔒 **Secure**: Built-in path traversal protection and input validation
- 🚀 **Fast**: Runs in Web Workers for non-blocking file operations
- 💪 **Type-Safe**: Full TypeScript support with comprehensive error types
- 🛡️ **Robust**: Comprehensive error handling and resource management
- 📦 **Modern**: ES modules, tree-shakeable, and zero dependencies (except Comlink)
- 🧪 **Well-Tested**: Comprehensive test suite with 95%+ coverage
- 🔧 **Feature-Complete**: Support for files, directories, binary data, and batch operations

## 📋 Browser Support

| Browser | Version | Notes                                                                  |
| ------- | ------- | ---------------------------------------------------------------------- |
| Chrome  | 102+    | Full support                                                           |
| Edge    | 102+    | Full support                                                           |
| Firefox | Not yet | [In development](https://bugzilla.mozilla.org/show_bug.cgi?id=1785123) |
| Safari  | Not yet | No timeline announced                                                  |

## 📦 Installation

```bash
npm install opfs-worker
# or
yarn add opfs-worker
# or
pnpm add opfs-worker
```

## 📦 Export Options

The library provides two different export options to suit different use cases:

### Main Export (Recommended)

```typescript
import { createWorker, isOPFSSupported } from 'opfs-worker';
```

- **Inline worker**: Worker is bundled with your application
- **Simple API**: Ready-to-use file system interface
- **Best for**: Most applications, especially when you want simplicity

### Raw Worker Export

```typescript
import { workerPath, createWorker } from 'opfs-worker/raw-worker';
```

- **External worker**: Worker file is separate, loaded at runtime
- **Manual control**: You control the Worker instance
- **Best for**: Advanced use cases, custom worker management, or when you need to avoid bundling the worker

## 🚀 Quick Start

### Option 1: Inline Worker (Recommended)

```typescript
import { createWorker, isOPFSSupported } from 'opfs-worker';

async function main() {
  // Check if OPFS is supported
  if (!(await isOPFSSupported())) {
    console.error('OPFS not supported in this browser');
    return;
  }

  // Initialize the file system
  const fs = await createWorker();

  // Write a file
  await fs.writeFile('/hello.txt', 'Hello, OPFS World!');

  // Read it back
  const content = await fs.readFile('/hello.txt');
  console.log(content); // "Hello, OPFS World!"

  // Create directories
  await fs.mkdir('/documents/projects', { recursive: true });

  // List directory contents
  const files = await fs.readdir('/');
  console.log('Files:', files);
}

main().catch(console.error);
```

### Option 2: Raw Worker

```typescript
import { workerPath } from 'opfs-worker/raw-worker';
import { wrap } from 'comlink';

async function main() {
  // Create worker manually
  const worker = new Worker(workerPath, { type: 'module' });
  const fs = wrap(worker);

  // Use the file system
  await fs.writeFile('/hello.txt', 'Hello, OPFS World!');
  const content = await fs.readFile('/hello.txt');
  console.log(content);
}

main().catch(console.error);
```

## 📚 API Reference

### Initialization

#### `isOPFSSupported(): Promise<boolean>`

Checks if OPFS is supported in the current environment.

```typescript
const supported = await isOPFSSupported();
if (!supported) {
  // Fallback to other storage methods
}
```

#### `createWorker(): Promise<FS>`

Creates and returns a new OPFS file system instance with inline worker.

```typescript
const fs = await createWorker();
```

### File Operations

#### `writeFile(path: string, data: string | Uint8Array | ArrayBuffer, options?: WriteFileOptions): Promise<void>`

Writes data to a file, creating it if it doesn't exist.

```typescript
// Write text
await fs.writeFile('/document.txt', 'Hello World');

// Write binary data
const buffer = new Uint8Array([72, 101, 108, 108, 111]);
await fs.writeFile('/binary.dat', buffer);

// Write with encoding
await fs.writeFile('/utf8.txt', 'Hello 🌍', { encoding: 'utf-8' });
```

#### `readFile(path: string, options?: ReadFileOptions): Promise<string | Uint8Array>`

Reads a file's contents.

```typescript
// Read as text (default)
const text = await fs.readFile('/document.txt');

// Read as binary
const binary = await fs.readFile('/image.png', { encoding: 'binary' });

// Read with specific encoding
const content = await fs.readFile('/file.txt', { encoding: 'utf-8' });
```

#### `appendFile(path: string, data: string | Uint8Array | ArrayBuffer, options?: WriteFileOptions): Promise<void>`

Appends data to a file.

```typescript
await fs.appendFile('/log.txt', '\nNew log entry');
```

#### `unlink(path: string): Promise<void>`

Deletes a file.

```typescript
await fs.unlink('/temporary.txt');
```

#### `exists(path: string): Promise<boolean>`

Checks if a file or directory exists.

```typescript
if (await fs.exists('/config.json')) {
  // File exists
}
```

#### `stat(path: string): Promise<Stats>`

Gets file or directory statistics.

```typescript
const stats = await fs.stat('/document.txt');
console.log({
  isFile: stats.isFile(),
  isDirectory: stats.isDirectory(),
  size: stats.size,
  lastModified: stats.mtime
});
```

### Directory Operations

#### `mkdir(path: string, options?: MkdirOptions): Promise<void>`

Creates a directory.

```typescript
// Create single directory
await fs.mkdir('/new-folder');

// Create nested directories
await fs.mkdir('/path/to/deep/folder', { recursive: true });
```

#### `readdir(path: string): Promise<string[]>`

Lists directory contents.

```typescript
const files = await fs.readdir('/documents');
console.log('Files:', files);
```

#### `rmdir(path: string, options?: RmdirOptions): Promise<void>`

Removes a directory.

```typescript
// Remove empty directory
await fs.rmdir('/empty-folder');

// Remove directory and all contents
await fs.rmdir('/folder-with-files', { recursive: true });
```

### Advanced Operations

#### `rename(oldPath: string, newPath: string): Promise<void>`

Renames or moves a file or directory.

```typescript
// Rename file
await fs.rename('/old-name.txt', '/new-name.txt');

// Move file to different directory
await fs.rename('/file.txt', '/documents/file.txt');

// Rename directory
await fs.rename('/old-folder', '/new-folder');
```

#### `uploadFiles(files: File[] | FileList, targetDir: string, onProgress?: ProgressCallback): Promise<void>`

Uploads multiple files to a directory with optional progress tracking.

```typescript
const input = document.querySelector('input[type="file"]');
const files = input.files;

await fs.uploadFiles(files, '/uploads', (completed, total, currentFile) => {
  const progress = (completed / total) * 100;
  console.log(`Upload progress: ${progress.toFixed(1)}% (${currentFile})`);
});
```

## 🛡️ Error Handling

The library provides specific error types for better error handling:

```typescript
import {
  OPFSNotSupportedError,
  FileNotFoundError,
  DirectoryNotFoundError,
  PathError,
  PermissionError,
  StorageError,
  TimeoutError
} from 'opfs-worker';

try {
  await fs.readFile('/non-existent.txt');
} catch (error) {
  if (error instanceof FileNotFoundError) {
    console.log('File not found:', error.path);
  } else if (error instanceof PermissionError) {
    console.log('Permission denied:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Error Types

- `OPFSNotSupportedError`: OPFS is not available in the browser
- `FileNotFoundError`: Requested file doesn't exist
- `DirectoryNotFoundError`: Requested directory doesn't exist
- `PathError`: Invalid path or path traversal attempt
- `PermissionError`: Operation not allowed
- `StorageError`: Storage quota exceeded or storage-related issues
- `TimeoutError`: Operation timed out
- `OPFSError`: Base error class for all OPFS-related errors

## 🔧 Advanced Usage

### Working with Binary Data

```typescript
// Read an image file from input
const input = document.querySelector('input[type="file"]');
const file = input.files[0];
const arrayBuffer = await file.arrayBuffer();

// Store it in OPFS
await fs.writeFile('/images/photo.jpg', arrayBuffer);

// Read it back as binary
const imageData = await fs.readFile('/images/photo.jpg', { encoding: 'binary' });

// Use with Blob API
const blob = new Blob([imageData], { type: 'image/jpeg' });
const url = URL.createObjectURL(blob);
```

### Batch Operations

```typescript
// Create multiple files at once
const operations = [
  fs.writeFile('/file1.txt', 'Content 1'),
  fs.writeFile('/file2.txt', 'Content 2'),
  fs.writeFile('/file3.txt', 'Content 3')
];

await Promise.all(operations);

// Process directory recursively
async function processDirectory(dirPath: string) {
  const entries = await fs.readdir(dirPath);

  for (const entry of entries) {
    const fullPath = `${dirPath}/${entry}`;
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      await processDirectory(fullPath); // Recursive
    } else {
      console.log(`File: ${fullPath} (${stats.size} bytes)`);
    }
  }
}
```

### Raw Worker Access

For advanced use cases where you need direct worker access:

```typescript
// Option 1: Using the main export
import { createRawWorker } from 'opfs-worker';

const worker = createRawWorker();
// Use worker directly with postMessage/onmessage

// Option 2: Using the raw worker export
import { workerPath, createWorker } from 'opfs-worker/raw-worker';

// Get the worker file path
console.log(workerPath); // URL to the worker file

// Create a worker instance
const worker = createWorker();
// or
const worker = new Worker(workerPath, { type: 'module' });
```

## 🧪 Testing

The library includes comprehensive tests. To run them:

```bash
npm test
# or
npm run test:coverage
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build library
npm run build

# Type check
npm run type-check

# Lint
npm run lint
```

## 🐛 Troubleshooting

### OPFS Not Available

If you get `OPFSNotSupportedError`:

1. **Check browser support**: OPFS is only available in Chrome 102+ and Edge 102+
2. **Ensure HTTPS**: OPFS requires a secure context (HTTPS or localhost)
3. **Check headers**: Some browsers require specific headers for SharedArrayBuffer support

### File Operations Fail

1. **Path validation**: Ensure paths start with `/` and don't contain `..` or invalid characters
2. **Permissions**: Some operations might fail due to browser security restrictions
3. **Storage quota**: Check if you've exceeded the browser's storage quota

### Performance Issues

1. **Use Web Workers**: The library automatically runs in workers for non-blocking operations
2. **Batch operations**: Use `Promise.all()` for multiple concurrent operations
3. **Stream large files**: For very large files, consider chunked operations

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## 🔗 Links

- [GitHub Repository](https://github.com/your-username/opfs-worker)
- [NPM Package](https://www.npmjs.com/package/opfs-worker)
- [OPFS Specification](https://fs.spec.whatwg.org/)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)

---

**Note**: This library is designed for modern web applications that need persistent, high-performance file storage in the browser. Always check browser compatibility before using in production.
