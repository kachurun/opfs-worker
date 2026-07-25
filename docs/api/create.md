# Create helpers

Factories from the package entries. For when to pick which: [Choosing a mode](../choosing-a-mode.md).

## Facade

| Function                        | From                   | Backend                       |
| ------------------------------- | ---------------------- | ----------------------------- |
| `createOPFSDedicated(options?)` | `.` or `/sync`         | Dedicated worker + `OPFSSync` |
| `createOPFSAsync(options?)`     | `.` or `/async`        | In-process `OPFSAsync`        |
| `createOPFSShared(options?)`    | `.` or `/sharedworker` | SharedWorker + `OPFSAsync`    |

All return [`OPFSFacade`](./facade.md).

```typescript
import { createOPFSDedicated, createOPFSAsync, createOPFSShared } from 'opfs-worker';
```

On the main entry only:

- `createOPFS` → `createOPFSDedicated`
- `createWorker` → same (deprecated)
- `OPFSFileSystem` → `OPFSFacade` (deprecated)

## Escape hatch

Every facade exposes:

| Field        | Meaning                                                               |
| ------------ | --------------------------------------------------------------------- |
| `fs.backend` | Raw [`OPFSApi`](../types.md#opfsapi) — bytes in / bytes out           |
| `fs.worker`  | `Worker` / `SharedWorker` when one was created; `undefined` for async |

```typescript
const fs = createOPFSDedicated({ root: '/my-app' });
await fs.backend.writeFile('/a.bin', bytes);
fs.worker; // Worker
```

## Options

Passed to any `createOPFS*` (and to `setOptions()` later). Full type: [`OPFSOptions`](../types.md#opfsoptions).

| Option             | Default                 | What it does                                                                                                                   |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `root`             | `'/'`                   | Scope all paths under this OPFS subdirectory                                                                                   |
| `namespace`        | `'opfs-worker:${root}'` | Stamp on every [watch](../guides/watching.md) event                                                                            |
| `hashAlgorithm`    | `'etag'`                | File hash on `stat` / `index` / watch — `'etag'`, `'SHA-*'`, or `null`/`false` to disable. See [hashing](../guides/hashing.md) |
| `maxFileSize`      | `50MB`                  | Skip SHA-\* hashing above this size (`etag` ignores it)                                                                        |
| `broadcastChannel` | `'opfs-worker'`         | Channel name, a `BroadcastChannel` instance, or `null` to disable                                                              |

### Dedicated worker only

| Option   | Type            | Default        | What it does                                                                       |
| -------- | --------------- | -------------- | ---------------------------------------------------------------------------------- |
| `url`    | `string \| URL` | inlined worker | Script URL for `opfs-worker/dedicated.worker.js` (or your own) instead of the blob |
| `worker` | `Worker`        | —              | Pass an existing `Worker` (overrides `url`)                                        |

### SharedWorker only

| Option   | Type            | Default             | What it does                                                                                          |
| -------- | --------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `url`    | `string \| URL` | next to the package | Script URL for `opfs-worker/shared.worker.js` — with Vite: `import url from '…/shared.worker.js?url'` |
| `worker` | `SharedWorker`  | —                   | Pass an existing `SharedWorker` (overrides `url`)                                                     |
| `name`   | `string`        | `'opfs-worker'`     | Tabs with the same script URL + name share one instance                                               |

```typescript
const fs = createOPFS({
    root: '/my-app',
    hashAlgorithm: 'SHA-256',
    maxFileSize: 10 * 1024 * 1024,
});
```

## Prebuilt scripts

| Export                            | Hook up with                                             |
| --------------------------------- | -------------------------------------------------------- |
| `opfs-worker/dedicated.worker.js` | `new Worker(url, { type: 'module' })` or `{ url }`       |
| `opfs-worker/shared.worker.js`    | `new SharedWorker(url, { type: 'module' })` or `{ url }` |

Walkthroughs: [dedicated](../guides/dedicated.md), [sharedworker](../guides/sharedworker.md).
