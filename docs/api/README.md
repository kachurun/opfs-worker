# API

The sync backend works in every browser that has OPFS, but the browser only allows it inside a dedicated worker — `createOPFS()` / `createOPFSDedicated()` set that up for you. The async backend can run on the main thread or in a SharedWorker, but needs a modern browser — writes will not work in Safari before 26.

## Package entries

| Import from                | Worker                                     | Use it when                                                           |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `opfs-worker`              | Starts a dedicated worker                  | Default; fine if bundle size doesn’t matter or tree-shaking is set up |
| `opfs-worker/sync`         | Starts a dedicated worker                  | Same as the default, without async / shared code in the bundle        |
| `opfs-worker/async`        | Runs directly in the current thread        | Main thread or your own worker; Safari prior to 26 can’t write        |
| `opfs-worker/sharedworker` | Starts one SharedWorker shared by all tabs | One shared fs process for every tab; Safari prior to 26 can’t write   |
| `opfs-worker/pure`         | None                                       | Low-level classes to build your own custom worker                     |

## Facade

Every helper returns an `OPFSFacade` — the same Node-like API in all modes. The facade hides the actual work: depending on which helper you call, it either creates a dedicated worker and talks to it, works with OPFS directly in the current thread, or connects to a SharedWorker.

Each takes optional `[options](#options)`.

| Function           | From                                        | Under the hood                                   |
| ------------------ | ------------------------------------------- | ------------------------------------------------ |
| `createOPFS`       | `opfs-worker` or `opfs-worker/sync`         | Dedicated worker + `OPFSSync`                    |
| `createOPFSAsync`  | `opfs-worker` or `opfs-worker/async`        | OPFS directly, `OPFSAsync` in the current thread |
| `createOPFSShared` | `opfs-worker` or `opfs-worker/sharedworker` | SharedWorker + `OPFSAsync`                       |

```typescript
import { createOPFS, createOPFSAsync, createOPFSShared } from 'opfs-worker';

const fs = createOPFS(); // or createOPFSAsync(), createOPFSShared({ url: '...' })
```

### File I/O

| Method                                  | Notes                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `readFile` / `writeFile` / `appendFile` | Encoding as string, `{ encoding }`, or auto                                                   |
| `readBlob`                              | Disk-backed `Blob`, without copying into memory — [streaming](../guides/streaming.md)         |
| `importStream`                          | Stream / Blob / File — [streaming](../guides/streaming.md)                                    |
| `importFiles`                           | Bulk array / `Map` of `[path, data]` with rich progress — [streaming](../guides/streaming.md) |
| `readText` / `writeText` / `appendText` | UTF-8 by default                                                                              |

Paths can be a `string` or a `URL`. `readFile` / `writeFile` pick the encoding from the file extension (e.g. `.txt` → string, `.bin` → bytes) unless you pass one explicitly. For Node compatibility `fs.promises` returns the same instance, so code written against `fs.promises.readFile(...)` works as is.

### Directories & metadata

| Method                         | Notes                                                 |
| ------------------------------ | ----------------------------------------------------- |
| `mkdir`                        | `{ recursive }`; numeric mode is accepted and ignored |
| `readDir`                      | `DirentData[]`                                        |
| `stat` / `exists` / `realpath` |                                                       |
| `remove`                       | `{ recursive, force }`                                |
| `rename` / `copy`              | `copy` takes `{ recursive, overwrite }`               |
| `clear`                        | Empty a dir (default `/`)                             |
| `index`                        | `Map<path, FileStat>`                                 |

### Watch & lifecycle

| Method       | Notes                               |
| ------------ | ----------------------------------- |
| `watch`      | Returns `() => void`                |
| `unwatch`    |                                     |
| `setOptions` | See [hashing](../guides/hashing.md) |
| `dispose`    | Dispose the backend                 |

### File descriptors

| Method           | Notes                                            |
| ---------------- | ------------------------------------------------ |
| `open`           | Returns an fd; `{ create, exclusive, truncate }` |
| `read` / `write` | Positional I/O into / from a buffer              |
| `close`          | Release the fd                                   |
| `fstat`          | Stats by fd                                      |
| `ftruncate`      | Resize by fd                                     |
| `fsync`          | Flush to storage (best-effort in OPFS)           |

Works only in dedicated / `OPFSSync` mode; async throws `ENOTSUP`.
More details: [file descriptors](./file-descriptors.md).

### Node aliases

| Alias                     | Maps to                       |
| ------------------------- | ----------------------------- |
| `unlink` / `rm` / `rmdir` | `remove`                      |
| `readdir`                 | `readDir`                     |
| `lstat`                   | `stat`                        |
| `chmod`                   | no-op (no Unix modes in OPFS) |

### Backend access

`fs.backend` is the raw bytes API the facade wraps — a Comlink proxy to the worker for dedicated / SharedWorker, or the in-process `OPFSAsync` instance for async. Same methods as the facade, but without encoding helpers (you pass / get `Uint8Array`).

| Field        | Notes                                                               |
| ------------ | ------------------------------------------------------------------- |
| `fs.backend` | `[OPFSApi](../types.md#opfsapi)` — bytes in / bytes out             |
| `fs.worker`  | `Worker` / `SharedWorker` if one was created; `undefined` for async |

## Options

Passed to any `createOPFS*` (and to `setOptions()` later).

| Option             | Default                 | What it does                                                                                                                   |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `root`             | `'/'`                   | Scope all paths under this OPFS subdirectory                                                                                   |
| `namespace`        | `'opfs-worker:${root}'` | Stamp on every [watch](../guides/watching.md) event                                                                            |
| `hashAlgorithm`    | `'etag'`                | File hash on `stat` / `index` / watch — `'etag'`, `'SHA-*'`, or `null`/`false` to disable. See [hashing](../guides/hashing.md) |
| `maxFileSize`      | `50MB`                  | Skip SHA- hashing above this size (`etag` ignores it)                                                                          |
| `broadcastChannel` | `'opfs-worker'`         | Channel name, a `BroadcastChannel` instance, or `null` to disable                                                              |

```typescript
const fs = createOPFS({
    root: '/my-app',
    hashAlgorithm: 'SHA-256',
    maxFileSize: 10 * 1024 * 1024,
});
```

### Dedicated worker only

| Option   | Type     | Default | What it does                                |
| -------- | -------- | ------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `url`    | `string  | URL`    | inlined worker                              | Script URL for `opfs-worker/dedicated.worker.js` (or your own) instead of the blob |
| `worker` | `Worker` | —       | Pass an existing `Worker` (overrides `url`) |

Leave these unset unless you need them — the default inlined worker is enough.

```typescript
const fs = createOPFS({ root: '/my-app' });

// Escape hatches only:
// createOPFS({ root: '/my-app', url: workerUrl })           // CSP without blob:
// createOPFS({ root: '/my-app', worker: existingWorker })   // bring your own Worker
```

### SharedWorker only

| Option   | Type           | Default         | What it does                                            |
| -------- | -------------- | --------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `url`    | `string        | URL`            | next to the package                                     | Script URL for `opfs-worker/shared.worker.js` — with Vite: `import url from '…/shared.worker.js?url'` |
| `worker` | `SharedWorker` | —               | Pass an existing `SharedWorker` (overrides `url`)       |
| `name`   | `string`       | `'opfs-worker'` | Tabs with the same script URL + name share one instance |

```typescript
import workerUrl from 'opfs-worker/shared.worker.js?url'; // Vite
import { createOPFSShared } from 'opfs-worker/sharedworker';

const fs = createOPFSShared({
    root: '/my-app',
    url: workerUrl,
    name: 'opfs-worker',
});
```

## Ready-made worker files

These files already contain a backend (`OPFSSync` or `OPFSAsync`) wrapped in Comlink expose.

| Export                            | Inside                | Start with                                               |
| --------------------------------- | --------------------- | -------------------------------------------------------- |
| `opfs-worker/dedicated.worker.js` | Comlink + `OPFSSync`  | `new Worker(url, { type: 'module' })` or `{ url }`       |
| `opfs-worker/shared.worker.js`    | Comlink + `OPFSAsync` | `new SharedWorker(url, { type: 'module' })` or `{ url }` |

### Use the facade with a worker URL

This is required for SharedWorker. For dedicated workers, use it only when the default inlined worker is blocked by CSP or you want to host the script yourself.

```typescript
import workerUrl from 'opfs-worker/dedicated.worker.js?url';

const fs = createOPFS({ root: '/my-app', url: workerUrl });
```

You can also create the `Worker` yourself and pass it to the facade. The facade still handles Comlink, options, encoding helpers, buffer transfers, and cleanup.

```typescript
const worker = new Worker(workerUrl, { type: 'module' });
const fs = createOPFS({ root: '/my-app', worker });
```

### Use the worker without the facade

Wrap it with Comlink and configure the backend manually. This exposes the bytes API directly: no encoding helpers, automatic FD buffer transfers, or automatic worker termination.

```typescript
import { wrap } from 'comlink';
import type { OPFSApi } from 'opfs-worker';
import workerUrl from 'opfs-worker/dedicated.worker.js?url';

const worker = new Worker(workerUrl, { type: 'module' });
const backend = wrap<OPFSApi>(worker);

await backend.setOptions({ root: '/my-app' });
await backend.writeFile('/hello.txt', new TextEncoder().encode('hello'));

await backend.dispose();
worker.terminate();
```

Guides: [Dedicated worker](../guides/dedicated.md), [SharedWorker](../guides/sharedworker.md).

## Trade-offs

|                                     | Dedicated (`OPFSSync`)                           | Async (`OPFSAsync`)          |
| ----------------------------------- | ------------------------------------------------ | ---------------------------- |
| File descriptors                    | yes                                              | throw `ENOTSUP`              |
| Browser support                     | every browser that has OPFS                      | Safari before 26 can’t write |
| SharedWorker                        | no                                               | yes                          |
| One instance for all tabs           | no                                               | yes, with `createOPFSShared` |
| Bundle                              | ~80 KB inlined worker, or ready-made worker file | small via `/async`           |
| Works under strict CSP (no `blob:`) | pass a worker `url` instead of the inlined blob  | n/a                          |
