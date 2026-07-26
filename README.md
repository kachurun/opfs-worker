<a href="https://www.npmjs.com/package/opfs-worker" target="_blank" rel="noreferrer"><img src="https://img.shields.io/npm/v/opfs-worker.svg" alt="npm version"></a>
<a href="https://www.npmjs.com/package/opfs-worker" target="_blank" rel="noreferrer"><img src="https://img.shields.io/npm/dw/opfs-worker.svg" alt="npm downloads"></a>
<a href="https://kachurun.github.io/opfs-worker/" target="_blank" rel="noreferrer"><img src="https://img.shields.io/badge/demo-live-brightgreen" alt="demo"></a>

# OPFS Worker

A full-featured filesystem layer for the browser, built on the [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).

`opfs-worker` gives your app a familiar Node.js-style API for working with files and directories while handling the awkward browser parts for you: Worker setup, concurrent access, encodings, large-file streaming, change events, and cross-tab coordination.

Choose the runtime that fits your app: use a dedicated Worker for the fastest and widest-compatible path, run the async backend directly on the current thread, or share one filesystem process across every tab with SharedWorker.

No permission prompt or file picker is required. Files stay private to the current origin and live within the browser’s site storage, so clearing site data removes them.

**[Try the demo →](https://kachurun.github.io/opfs-worker/)**

## Features

→ **File API** — `readFile`, `writeFile`, `mkdir`, `stat`, `rename`, `copy`, `readDir`; encodings, extension-based detection, `string | URL` paths. [Docs](docs/api/README.md#facade)

→ **File descriptors** — `open` / `read` / `write` at an offset, plus `ftruncate` and `fsync`. [Docs](docs/api/file-descriptors.md)

→ **Concurrent access** — operations on the same path are serialized, so parallel reads and writes do not fail because another sync access handle is open.

→ **Dedicated worker (default)** — `createOPFS()` sets up the worker for you. Fastest path, supports FDs, writes work in older Safari too. [Docs](docs/guides/dedicated.md)

→ **Async** — same API on the main thread, no worker. No FDs. Writes need Safari 26+ (Safari 18 and older can only read). [Docs](docs/guides/async.md)

→ **SharedWorker** — one instance shared across tabs. Same limits as async (no FDs, Safari 26+ for writes). [Docs](docs/guides/sharedworker.md)

→ **Bring your own worker** — use it directly in a worker you already run, or load a prebuilt worker script. [Docs](docs/guides/pure.md)

→ **Large files** — stream reads (`readBlob`) and writes (`importStream` / `importFiles`) without buffering everything. [Docs](docs/guides/streaming.md) · [Upload](docs/guides/uploading.md) · [Download](docs/guides/downloading.md)

→ **Watch** — change events with a Node-style `watch(path, listener)` (BroadcastChannel under the hood, including across tabs). [Docs](docs/guides/watching.md)

→ **Hashing** — `stat()` can include an etag or a SHA hash (SHA skipped above a size cap). [Docs](docs/guides/hashing.md)

## Installation

```bash
npm install opfs-worker
```

## Quick start

```typescript
import { createOPFS } from 'opfs-worker';

// Starts a dedicated worker and returns a Node-like fs API
const fs = createOPFS({
  root: '/my-app',
  hashAlgorithm: 'SHA-256'
});

await fs.mkdir('/project');
await fs.writeFile('/project/hello.txt', 'Hello, OPFS!');
await fs.rename('/project/hello.txt', '/project/readme.txt');

const files = await fs.readDir('/project');
const text = await fs.readFile('/project/readme.txt'); // 'Hello, OPFS!'

// Tear down watches, close the backend, and terminate the worker
fs.dispose();
```

## Choose a mode

| What you want                                                    | Use                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| Node-like `fs` via dedicated worker (default, works everywhere)  | `createOPFS()`                                       |
| Node-like `fs` on the main thread (modern browsers / Safari 26+) | `createOPFSAsync()` from `opfs-worker/async`         |
| Node-like `fs` via SharedWorker (modern browsers / Safari 26+)   | `createOPFSShared()` from `opfs-worker/sharedworker` |
| OPFS inside a worker you already run (classes only)              | `OPFSSync` / `OPFSAsync` from `opfs-worker/pure`     |

## Docs

- [API overview](docs/api/README.md) — entries, facade methods, options, trade-offs
- [File descriptors](docs/api/file-descriptors.md) — positional `open` / `read` / `write`
- [Types](docs/types.md)
- [Migration from 1.x](docs/migration.md)

## Guides

| Guide                                             | About                                                     |
| ------------------------------------------------- | --------------------------------------------------------- |
| [Dedicated worker](docs/guides/dedicated.md)      | How to use OPFS via a dedicated worker (the default path) |
| [Async](docs/guides/async.md)                     | How to use OPFS on the main thread, without a worker      |
| [SharedWorker](docs/guides/sharedworker.md)       | How to share one filesystem across all tabs               |
| [Pure classes](docs/guides/pure.md)               | How to drop OPFS into a worker you already run            |
| [Streaming](docs/guides/streaming.md)             | How to read/write large files without buffering           |
| [Uploading from disk](docs/guides/uploading.md)   | Pickers, paste, drag-and-drop into `importFiles`          |
| [Downloading to disk](docs/guides/downloading.md) | `readBlob` → `<a download>` / `showSaveFilePicker`        |
| [Watching](docs/guides/watching.md)               | How to listen for file changes across tabs                |
| [Hashing](docs/guides/hashing.md)                 | How file hashes / etags work on `stat` and watch events   |

## Development

```bash
npm install
npm run build
npm run test
npm run lint
npm run type-check
```

Demo: `npm run dev:demo` / `npm run build:demo` / `npm run preview`.

## Maintainer

<img src="https://github.com/kachurun.png" width="100" height="100" alt="@kachurun's avatar">

Maintained with ❤️ by [@kachurun](https://github.com/kachurun)
