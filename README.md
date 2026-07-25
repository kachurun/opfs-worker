# OPFS Worker

<a href="https://www.npmjs.com/package/opfs-worker" target="_blank" rel="noreferrer"><img src="https://img.shields.io/npm/v/opfs-worker.svg" alt="npm"></a>
<a href="https://kachurun.github.io/opfs-worker/" target="_blank" rel="noreferrer"><img src="https://img.shields.io/badge/demo-live-brightgreen" alt="demo"></a>

## What is OPFS?

OPFS ([Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)) is a browser filesystem scoped to your origin. It sits under the usual site quota; clearing site data wipes it. The browser does not show a file picker or ask for access.

This package puts a Node-like API on top of it.

- **Facade API** — `readFile`, `writeFile`, `mkdir`, `stat`, `rename`, `copy`, `readDir`; encodings, extension-based detection, `string | URL` paths. → [facade](docs/api/facade.md)
- **File descriptors** — `open` / `read` / `write` at an offset, plus `ftruncate` and `fsync`. → [file descriptors](docs/file-descriptors.md)
- **Dedicated worker (default)** — `createOPFS()` uses sync access handles in a worker: fastest OPFS path, with FDs, including older Safari. → [dedicated](docs/guides/dedicated.md)
- **Async / SharedWorker** — `createWritable()` on the main thread or in a SharedWorker. Safari 26+ for writes. → [async](docs/guides/async.md) · [sharedworker](docs/guides/sharedworker.md)
- **Your own worker** — inlined dedicated worker, a prebuilt script, raw classes, or one SharedWorker for all tabs. → [choosing a mode](docs/choosing-a-mode.md)
- **Streaming** — `importStream` writes a `ReadableStream`, `Blob`, or `File` in chunks, with optional progress. → [streaming](docs/guides/streaming.md)
- **Watch** — changes over `BroadcastChannel` across contexts that share the filesystem. → [watching](docs/guides/watching.md)
- **Hashing** — `stat()` can include an etag or a SHA hash, with a size cap for SHA. → [hashing](docs/guides/hashing.md)
- **Types** — TypeScript types, ESM and CJS; two small deps (`comlink`, `minimatch`). The async entry does not pull in worker code. → [types](docs/types.md)

## Installation

```bash
npm install opfs-worker
```

## Quick start

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS({
  root: '/my-app',
  hashAlgorithm: 'SHA-256'
});

await fs.mkdir('/project');
await fs.writeFile('/project/hello.txt', 'Hello, OPFS!');
await fs.rename('/project/hello.txt', '/project/readme.txt');

const files = await fs.readDir('/project');
const text = await fs.readFile('/project/readme.txt'); // 'Hello, OPFS!'
```

## Choose a mode

| What you want                                                    | Use                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| Node-like `fs` via dedicated worker (default, works everywhere)  | `createOPFS()`                                       |
| Node-like `fs` on the main thread (modern browsers / Safari 26+) | `createOPFSAsync()` from `opfs-worker/async`         |
| Node-like `fs` via SharedWorker (modern browsers / Safari 26+)   | `createOPFSShared()` from `opfs-worker/sharedworker` |
| OPFS inside a worker you already run (classes only)              | `OPFSSync` / `OPFSAsync` from `opfs-worker/pure`     |

Trade-offs (FDs, Safari, size, CSP): [Choosing a mode](docs/choosing-a-mode.md).

## Docs

- [Docs index](docs/README.md)
- [Choosing a mode](docs/choosing-a-mode.md)
- Guides
  - [Dedicated worker](docs/guides/dedicated.md)
  - [Async](docs/guides/async.md)
  - [SharedWorker](docs/guides/sharedworker.md)
  - [Pure classes](docs/guides/pure.md)
  - [Streaming](docs/guides/streaming.md)
  - [Watching](docs/guides/watching.md)
  - [Hashing](docs/guides/hashing.md)
- API
  - [Create helpers & options](docs/api/create.md)
  - [Facade](docs/api/facade.md)
  - [Backend](docs/api/backend.md)
  - [File descriptors](docs/file-descriptors.md)
  - [Types](docs/types.md)
- [Migration from 1.x](docs/migration.md)

## Development

```bash
npm install
npm run build
npm run test
npm run lint
npm run type-check
```

Demo: `npm run dev:demo` / `npm run build:demo` / `npm run preview`.

## License

MIT

## Maintainer

<img src="https://github.com/kachurun.png" width="100" height="100" alt="@kachurun's avatar">

Maintained with ❤️ by [@kachurun](https://github.com/kachurun)
