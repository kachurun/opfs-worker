# Create helpers

Sync access handles only work in a **dedicated** worker. Async writes work on the main thread and in SharedWorkers too, but Safari needs **26+** for writing.

## Package entries

| Import from                | Worker                                     | Use it when                                                           |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `opfs-worker`              | Starts a dedicated worker                  | Default; fine if bundle size doesn’t matter or tree-shaking is set up |
| `opfs-worker/sync`         | Starts a dedicated worker                  | Same as the default, without async / shared code in the bundle        |
| `opfs-worker/async`        | Runs directly in the current thread        | Main thread or your own worker; Safari prior to 26 can’t write        |
| `opfs-worker/sharedworker` | Starts one SharedWorker shared by all tabs | One shared fs process for every tab; Safari prior to 26 can’t write   |
| `opfs-worker/pure`         | None                                       | Low-level classes to build your own custom worker                     |

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

On `.` and `/sync`:

- `createOPFS` → `createOPFSDedicated`

On the main entry only:

- `createWorker` → same (deprecated)
- `OPFSFileSystem` → `OPFSFacade` (deprecated)

## Backend access

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

Not imports for app code — URLs for `new Worker` / `new SharedWorker` (or `{ url }` on the helpers):

| Export                            | Hook up with                                             |
| --------------------------------- | -------------------------------------------------------- |
| `opfs-worker/dedicated.worker.js` | `new Worker(url, { type: 'module' })` or `{ url }`       |
| `opfs-worker/shared.worker.js`    | `new SharedWorker(url, { type: 'module' })` or `{ url }` |

Walkthroughs: [dedicated](../guides/dedicated.md), [sharedworker](../guides/sharedworker.md).

## Trade-offs

|                           | Dedicated (`OPFSSync`)                                                                 | Async (`OPFSAsync`)            |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| File descriptors          | yes                                                                                    | `ENOTSUP`                      |
| Safari writes             | yes (via the worker)                                                                   | 26+                            |
| SharedWorker              | no                                                                                     | yes                            |
| One instance for all tabs | no (unless you build SharedWorker yourself)                                            | `createOPFSShared`             |
| Bundle                    | ~80 KB inlined worker, or [prebuilt script](../guides/dedicated.md#diy-prebuilt-script) | small via `/async`             |
| CSP without `blob:`       | pass `url` / prebuilt script                                                           | no worker, or SharedWorker URL |
