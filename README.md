# OPFS Worker

[npm version](https://www.npmjs.com/package/opfs-worker)

A robust TypeScript library for working with Origin Private File System (OPFS) through Web Workers, providing a Node.js-like file system API for browser environments.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Demo](#demo)
- [API Reference](#api-reference)
- [Types](#types)
- [Browser Support](#browser-support)
- [Development](#development)
- [License](#license)

## Features

### 🚀 **Performance & Architecture**

- **Web Worker-based**: Runs in a separate thread, keeping your main thread responsive
- **Zero-copy data transfer**: Efficient binary data handling with Comlink transfer
- **Faster than IndexedDB hacks**: Direct OPFS access without the overhead of database abstractions
- **Efficient file watching**: Real-time change detection with minimatch patterns, no polling delays

### 🛠️ **Developer Experience**

- **Better DX vs File System Access API**: Familiar Node.js-like API instead of complex browser APIs
- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **Comlink-powered**: Seamless RPC communication between main thread and worker

### 🌐 **Compatibility & Standards**

- **Cross-browser compatible**: Works in all modern browsers including Safari, Firefox, Chrome, and Edge
- **OPFS-native**: Built directly on Origin Private File System standards
- **No polyfills needed**: Uses native browser capabilities

### 📁 **File System Operations**

- **Complete API**: `readFile`, `writeFile`, `mkdir`, `remove`, `copy`, `rename`, and more
- **Binary file support**: Handle images, documents, and any binary data seamlessly
- **Hash support**: Cheap `etag` by default (`mtime-size`), plus optional content hashes (SHA-1 / SHA-256 / SHA-384 / SHA-512)
- **File indexing**: Complete file system indexing with metadata and search

### 🔄 **Advanced Features**

- **Sync operations**: Bulk file synchronization from external data sources
- **Event broadcasting**: Real-time file change notifications via BroadcastChannel
- **Include/exclude filters**: Fine-grained control over file watching patterns
- **Comprehensive error handling**: Detailed error types for better debugging

## When to Use

**Use OPFS Worker when you need a persistent file system directly in the browser with an API almost like Node.js `fs`.** It's faster than IndexedDB for file operations and provides better DX than raw File System Access API.

Here are the key use cases:

### 🚀 **Offline-First Applications**

- **Progressive Web Apps (PWAs)**: Store user data, cached resources, and app state locally
- **Media applications**: Cache images, videos, and audio files for offline playback
- **Data synchronization**: Local-first data with background sync to remote servers

### 💾 **Performance & Caching**

- **Asset caching**: Store and serve static files (CSS, JS, images) from local storage
- **Database caching**: Cache API responses and database queries locally
- **Session persistence**: Maintain user sessions and preferences across browser restarts
- **Resource preloading**: Preload critical resources for instant access

### 🎨 **Editor & IDE Features**

- **Code editors**: File tree navigation, syntax highlighting, and project management
- **Design tools**: Canvas state persistence, project files, and asset management
- **Document editors**: Rich text, markdown, and collaborative editing with local storage
- **Build tools**: Local development servers, build caches, and project configurations

### 🔄 **State Management**

- **Application state**: Persist complex application state and user preferences
- **Form data**: Auto-save forms and restore user input on page refresh
- **Game state**: Save game progress, levels, and user achievements
- **User preferences**: Settings, themes, and personalized configurations

### 📱 **Mobile & Cross-Platform**

- **Mobile web apps**: Native-like file management on mobile devices
- **Cross-tab synchronization**: Share data between multiple browser tabs
- **Worker-based processing**: Offload file operations to background threads
- **Progressive Web Apps**: Full offline capabilities with file system access

### ❌ **When NOT to Use**

- **Server-side storage**: This is a client-side solution, not a replacement for server storage
- **Cross-origin access**: Files are isolated to the specific domain/origin
- **Large datasets**: OPFS has browser-specific storage limitations:
  - **Chrome/Edge**: Up to ~50% of free disk space (check via `navigator.storage.estimate()`)
  - **Safari**: Usually 1-2 GB, sometimes less
  - **Firefox**: Shared limit with IndexedDB, similar to Chromium

### ⚡ **Performance Notes**

- **Faster than IndexedDB**: Direct file system access without database overhead
- **Slower than native FS**: Browser APIs have performance limitations compared to desktop file systems
- **Worker-based**: File operations run in background threads, keeping main thread responsive
- **Memory efficient**: Files are stored in browser's native file system, not in memory

## Installation

```bash
npm install opfs-worker
```

**Dependencies:**

- Modes 1 and 2 depend on `comlink` (worker communication is handled for you)
- Mode 3 does not use Comlink — you run the class inside your own worker
- Modes 1 and 2 ship an inlined worker, so your bundler does not need a `?worker` setup

## Quick Start

OPFS sync I/O only works inside a dedicated Web Worker. The library covers three common setups:

|            | Import                                  | Best when                                                         |
| ---------- | --------------------------------------- | ----------------------------------------------------------------- |
| **Mode 1** | `createOPFS()` from `opfs-worker`       | You want a Node-like `fs` API on the main thread                  |
| **Mode 2** | `createOPFSWorker()` from `opfs-worker` | You want the low-level worker API, but still from the main thread |
| **Mode 3** | `OPFSWorker` from `opfs-worker/pure`    | Your code already runs inside a worker                            |

Modes 1 and 2 both pull Comlink. Mode 3 does not.

### Mode 1: Node-like facade (recommended)

The usual path. `createOPFS()` starts an inlined worker and returns a facade with a Node-like API — strings, encodings, auto-detection. Comlink stays under the hood.

> 1.x alias: `createWorker` still works and returns the same facade — prefer `createOPFS`.

```typescript
import { createOPFS } from 'opfs-worker';

async function basicExample() {
    const fs = createOPFS();

    await fs.writeFile('/config.json', JSON.stringify({ theme: 'dark' }));
    const config = await fs.readFile('/config.json');
    console.log(JSON.parse(config as string));
}

async function extendedExample() {
    const broadcastChannel = new BroadcastChannel('my-app-events');

    const fs = createOPFS({
        root: '/my-app',
        namespace: 'my-app:fs',
        hashAlgorithm: 'SHA-256',
        maxFileSize: 100 * 1024 * 1024, // 100MB
        broadcastChannel
    });

    const imageData = new Uint8Array([58 /* binary data */]);
    await fs.writeFile('/image.png', imageData);
    const binaryData = await fs.readFile('/image.png', 'binary');

    await fs.writeFile('/config.txt', 'Hello, World!');
    const textContent = await fs.readFile('/config.txt'); // string

    await fs.watch('/', {
        recursive: true,
        include: ['*.json'],
        exclude: ['dist/**']
    });

    broadcastChannel.onmessage = (event) => {
        console.log('File changed:', event.data);
    };

    const stats = await fs.stat('/image.png');
    console.log(`File size: ${stats.size} bytes`, `Hash: ${stats.hash}`);
}
```

> Watch events go over `BroadcastChannel` (default name `opfs-worker`). Pass `broadcastChannel` to customize. Only watched paths emit events.

### Mode 2: Raw worker API from the main thread

Same package entry, same inlined worker but without the facade. You get a Comlink proxy to `OPFSWorker`: bytes in, bytes out. Useful if you want to wrap it yourself or prefer the lower-level API.

```typescript
import { createOPFSWorker } from 'opfs-worker';

const { fs, dispose } = createOPFSWorker({
    root: '/my-app',
    namespace: 'my-app:fs',
    hashAlgorithm: 'SHA-256',
    maxFileSize: 100 * 1024 * 1024,
    broadcastChannel: 'my-app-events',
});

await fs.writeFile('/config.json', new TextEncoder().encode(JSON.stringify({ theme: 'dark' })));
const bytes = await fs.readFile('/config.json');
console.log(JSON.parse(new TextDecoder().decode(bytes)));

dispose(); // worker.dispose() + terminate()
```

> Want your own facade? Our `OPFSFacade` is built on `createOPFSWorker` — copy [`src/OPFSFacade.ts`](src/OPFSFacade.ts), swap the imports to `opfs-worker` and change what you need.

### Mode 3: `OPFSWorker` inside your own worker

If you already have a worker (or want full control over it), import the class and use it directly. No nested worker, no Comlink. Bundling that worker and talking to the main thread — if you need that at all — is up to you.

```typescript
// my-app.worker.ts  (this file IS the worker)
import { OPFSWorker } from 'opfs-worker/pure';

const fs = new OPFSWorker({
    root: '/my-app',
    namespace: 'my-app:fs',
    hashAlgorithm: 'SHA-256',
    broadcastChannel: 'my-app-events', // name only — BroadcastChannel instances can't cross the wire
});

await fs.writeFile('/config.json', new TextEncoder().encode(JSON.stringify({ theme: 'dark' })));
const bytes = await fs.readFile('/config.json');
console.log(JSON.parse(new TextDecoder().decode(bytes)));
```

`opfs-worker/pure` does not call Comlink `expose()`, so it will not take over your worker's message port.

### Hash Algorithm Configuration

Set once via options / `setOptions()` — used by `stat()`, `index()`, and watch events.

Default is `'etag'`: a cheap weak tag from `File.lastModified` + size (no content read). Switch to a SHA algorithm when you need a real content hash.

```typescript
import { createOPFS } from 'opfs-worker';

async function hashExample() {
    // Default: etag (fast, no content read)
    const fs = createOPFS();
    await fs.writeFile('/data.txt', 'Hello World');

    const etagStat = await fs.stat('/data.txt');
    console.log(`ETag: ${etagStat.hash}`); // e.g. "m1abc-c"  (mtime36-size36)

    // Opt into a cryptographic content hash
    await fs.setOptions({ hashAlgorithm: 'SHA-256' });
    const shaStat = await fs.stat('/data.txt');
    console.log(`SHA-256: ${shaStat.hash}`);

    // Index / watch events also include hash when enabled
    const index = await fs.index();
    for (const [path, stat] of index) {
        if (stat.isFile && stat.hash) {
            console.log(`${path}: ${stat.hash}`);
        }
    }

    const channel = new BroadcastChannel('opfs-worker');
    channel.onmessage = (event) => {
        if (event.data.hash) {
            console.log(`File ${event.data.path} changed, hash: ${event.data.hash}`);
        }
    };
}

// maxFileSize only applies to SHA-* (content) hashing — etag ignores it
async function maxFileSizeExample() {
    const fs = createOPFS({
        hashAlgorithm: 'SHA-256',
        maxFileSize: 100 * 1024 * 1024 // 100MB (default 50MB)
    });

    const stats = await fs.stat('/large-file.dat');
    if (stats.hash) {
        console.log(`Hash: ${stats.hash}`);
    } else {
        console.log('File too large for content hashing');
    }
}
```

**Supported Hash Algorithms:**

- `'etag'` — **default**. Weak tag from mtime + size; free, no content read
- `'SHA-1'` / `'SHA-256'` / `'SHA-384'` / `'SHA-512'` — content hashes via Web Crypto (bounded by `maxFileSize`)
- `null` / `false` — disable hashing

**Note:** Prefer `'etag'` for watch / change-detection. Use SHA only when you need integrity of file bytes. Set to `null`/`false` if you don't need `hash` at all.

### Root Path Configuration

The file system supports configuring the root path through options. The root path determines where in OPFS the file system's root will be created. All file paths passed to the API are relative to this root path.

```typescript
import { createOPFS } from 'opfs-worker';

async function rootPathExample() {
    // Use default root path '/'
    const fsDefault = createOPFS();
    await fsDefault.writeFile('/config.json', '{}');
    // This creates /config.json in OPFS root

    // Use custom root path
    const fsCustom = createOPFS({ root: '/my-app' });
    await fsCustom.writeFile('/config.json', '{}');
    // This creates /my-app/config.json in OPFS root

    // Change root path dynamically
    await fsCustom.setOptions({ root: '/new-app' });
    await fsCustom.writeFile('/config.json', '{}');
    // This creates /new-app/config.json in OPFS root
}
```

**Root Path Behavior:**

- **Default**: Uses `/` (OPFS root directory)
- **Custom**: Creates a subdirectory within OPFS for isolation
- **Dynamic**: Can be changed at runtime via `setOptions()`
- **Auto-mount**: Automatically mounts to the specified root when needed
- **Path Resolution**: All API paths are relative to the configured root

## Demo

Check out the live demo powered by Vite and hosted on GitHub Pages.

[Live Demo](https://kachurun.github.io/opfs-worker/)

## API Reference

The complete API reference is available in the [docs/api-reference.md](docs/api-reference.md) file.

**Additional Documentation:**

- [File Descriptors Guide](docs/file-descriptors.md) - Comprehensive guide to low-level file I/O operations
- [Types Reference](docs/types.md) - Complete TypeScript type definitions

### Quick API Overview

**Entry Points:**

- `createOPFS(options?)` — Mode 1: Node-like facade on the main thread
- `createOPFSWorker(options?)` — Mode 2: raw `OPFSWorker` proxy on the main thread
- `OPFSWorker` from `opfs-worker/pure` — Mode 3: use the class inside your own worker
- `OPFSFacade` — Mode 1 class returned by `createOPFS`

**Core File Operations:**

- `readFile(path, encoding?)` - Read files as text or binary with auto-detection
- `writeFile(path, data, encoding?)` - Write text or binary data with auto-detection
- `readText(path, encoding?)` - Read files as text with specified encoding
- `writeText(path, text, encoding?)` - Write text with specified encoding
- `appendText(path, text, encoding?)` - Append text with specified encoding

**Common Operations:**

- `mkdir(path, options?)` - Create directories
- `readDir(path)` - List directory contents
- `stat(path)` - Get file/directory statistics
- `remove(path, options?)` - Remove files/directories
- `copy(source, destination, options?)` - Copy files/directories
- `rename(oldPath, newPath)` - Rename files/directories

**File Descriptors (Low-level I/O):**

- `open(path, options?)` - Open file and return descriptor
- `read(fd, buffer, offset, length, position?)` - Read from descriptor (returns `{bytesRead, buffer}`)
- `write(fd, buffer, offset?, length?, position?)` - Write to descriptor
- `fstat(fd)` - Get stats by descriptor
- `ftruncate(fd, size?)` - Truncate file by descriptor
- `fsync(fd)` - Sync file data to storage
- `close(fd)` - Close file descriptor

**Note**: The `read()` method uses `Comlink.transfer()` for efficient buffer handling. **From the main window**, you must transfer buffer ownership to the worker, and **from the worker**, the buffer is transferred back to you. See [File Descriptors Guide](docs/file-descriptors.md) for complete usage examples.

_For detailed file descriptor documentation, see [File Descriptors Guide](docs/file-descriptors.md)_

**Advanced Features:**

- `watch(path, options?)` - Watch for file changes with minimatch patterns
- `index()` - Get complete file system index
- `sync(entries, options?)` - Bulk synchronization
- `setOptions(options)` - Update configuration

**Binary File Support:**

- Full support for images, documents, and any binary data
- Automatic conversion between Uint8Array, ArrayBuffer, and Blob
- Multiple text encodings (UTF-8, UTF-16, ASCII, Base64, etc.)

**Utility Functions:**

- Path manipulation (`basename`, `dirname`, `normalizePath`, etc.)
- Data conversion helpers
- OPFS support detection

For detailed API documentation with examples, see [docs/api-reference.md](docs/api-reference.md).

## Types

Full TypeScript types are provided — see [docs/types.md](docs/types.md) for complete type definitions including `FileStat`, `DirentData`, `WatchOptions`, `OPFSOptions`, and more.

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
```

## License

MIT

## Contributing

Contributions are welcome!

**How to contribute:**

- 🐛 **Report bugs** or suggest features via [GitHub Issues](https://github.com/kachurun/opfs-worker/issues)
- 💡 **Submit ideas** for improvements or new features
- 🔧 **Send PRs** for bug fixes, documentation, or enhancements
- 📚 **Improve docs** - help make the library more accessible

**Getting started:**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a Pull Request

_We welcome all contributions, big and small!_
