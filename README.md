# OPFS Worker

[npm](https://www.npmjs.com/package/opfs-worker)
[demo](https://kachurun.github.io/opfs-worker/)

## What is OPFS?

OPFS ([Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)) is a private file store for your origin. No file picker, no permission prompts. It lives under the usual site quota, and clearing site data wipes it.

This library gives you a real filesystem on top of it — read, write, and watch files with a familiar Node-like API.

- **High-level Node-like API.** `readFile`, `writeFile`, `mkdir`, `stat`, `rename`, `copy`, `readDir` — with encodings, auto-detection by extension, and `string | URL` paths. You write `fs` code, not handle plumbing. → [facade API](docs/api/facade.md)
- **Low-level positional I/O.** `open` / `read` / `write` at an offset, plus `ftruncate` and `fsync` — enough for random-access formats and databases. → [file descriptors](docs/file-descriptors.md)
- **Sync API by default.** `createOPFS()` runs sync access handles in a dedicated worker: the fastest path OPFS offers, with file descriptors, and it works in every browser that has OPFS — including older Safari. You don't manage `Worker`, Comlink, or handles yourself. → [dedicated](docs/guides/dedicated.md)
- **Async API for modern browsers / SharedWorkers.** Uses `createWritable()` — runs on the main thread or inside a SharedWorker, no dedicated worker needed. Safari 26+ for writes. → [async](docs/guides/async.md) · [sharedworker](docs/guides/sharedworker.md)
- **Any way you want to run it.** Inlined dedicated worker, your own worker file, raw classes inside a worker you control, or one SharedWorker for every tab. Same methods in all of them. → [choosing a mode](docs/choosing-a-mode.md)
- **Memory-friendly for big files.** Streaming support means you can pull in gigabyte-sized files without blowing RAM — `importStream` writes a `ReadableStream`, `Blob`, or `File` chunk by chunk, with optional progress callbacks. → [streaming](docs/guides/streaming.md)
- **Cross-tab `watch()`.** Changes broadcast over `BroadcastChannel`, so listeners fire in every context that shares the filesystem. → [watching](docs/guides/watching.md)
- **Built-in file hashing.** `stat()` can carry a cheap etag or a real SHA hash, with a size cap so big files don't get hashed by accident — handy for caching and diffing. → [hashing](docs/guides/hashing.md)
- **Small and typed.** Full TypeScript types, ESM and CJS, two small runtime deps (`comlink`, `minimatch`) — and the async entry pulls in no worker code at all. → [types](docs/types.md)

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
bun install
bun run build
bun run test
bun run lint
bun run type-check
```

Demo app: `bun run dev:demo` / `bun run build:demo` / `bun run preview`.

## License

MIT

## 👤 Maintainer

<img src="https://github.com/kachurun.png" width="100" height="100" alt="@kachurun's avatar">

Maintained with ❤️ by [@kachurun](https://github.com/kachurun)
