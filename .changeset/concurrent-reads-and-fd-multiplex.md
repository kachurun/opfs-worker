---
"opfs-worker": major
---

## 2.0 — clearer entry points + concurrent I/O fixes

### Migration

Preferred names (new):


| What you want                | Use |
| ---------------------------- | --- |
| Convenience barrel           | `opfs-worker` (`createOPFSDedicated`, `createOPFSAsync`, `createOPFSShared`, …) |
| Worker backend only          | `opfs-worker/sync` (`createOPFSDedicated`, `createDedicatedWorker`, `OPFSSync`) |
| Async backend only           | `opfs-worker/async` (`createOPFSAsync`, `OPFSAsync`) |
| One fs for all tabs          | `opfs-worker/sharedworker` (`createOPFSShared`, `createSharedWorker`) |
| Prebuilt worker scripts      | `opfs-worker/dedicated.worker.js` (`OPFSSync`) / `opfs-worker/shared.worker.js` (`OPFSAsync`) |
| Raw classes                  | `opfs-worker/pure` (`OPFSSync`, `OPFSAsync`, `BaseOPFS`) |


Deprecated / short aliases on the main entry:

- `createOPFS` / `createWorker` → `createOPFSDedicated`
- `OPFSFileSystem` → `OPFSFacade`

```diff
- import { createWorker, OPFSFileSystem } from 'opfs-worker';
- const fs: OPFSFileSystem = createWorker({ root: '/my-app' });
+ import { createOPFSDedicated, OPFSFacade } from 'opfs-worker';
+ const fs: OPFSFacade = createOPFSDedicated({ root: '/my-app' });
```

`opfs-worker/raw` is removed, and the `OPFSWorker` class is now `OPFSSync` in `opfs-worker/pure`:

```diff
- import { OPFSWorker } from 'opfs-worker/raw';
+ import { OPFSSync } from 'opfs-worker/pure';
```

`opfs-worker/raw?worker` (bundler worker import) is also removed — use `createDedicatedWorker()`, which ships its own inlined worker:

```diff
- import OPFSWorker from 'opfs-worker/raw?worker';
- const worker = new OPFSWorker();
+ import { createDedicatedWorker } from 'opfs-worker';
+ const { fs, worker, dispose } = createDedicatedWorker();
```

---

### New: workerless async backend (`opfs-worker/async`)

`createOPFSAsync()` returns the same Node-like `OPFSFacade`, but backed by the promise-based File System API (`getFile()` / `createWritable()`) — no worker, no Comlink. Import from `opfs-worker` or from `opfs-worker/async` (use `/async` when you want a guaranteed worker-free bundle).

```typescript
import { createOPFSAsync } from 'opfs-worker';
// or: import { createOPFSAsync } from 'opfs-worker/async';
```

Trade-offs: writing needs `createWritable()` (Chrome, Firefox, Safari 26+), and file descriptors are not supported (`ENOTSUP`). The raw `OPFSAsync` class also runs inside any worker type, including SharedWorker.

---

### New: SharedWorker backend (`opfs-worker/sharedworker`)

`createOPFSShared()` connects every tab to a single `OPFSAsync` instance inside a SharedWorker — writes are serialized across tabs by per-path locks, watch events reach all tabs via `BroadcastChannel`. Same limitations as the async backend.

The worker script ships self-contained as `opfs-worker/shared.worker.js` (a SharedWorker is shared by script URL, so it can't be inlined):

```typescript
import workerUrl from 'opfs-worker/shared.worker.js?url'; // Vite
import { createOPFSShared } from 'opfs-worker/sharedworker';

const fs = createOPFSShared({ root: '/my-app', url: workerUrl });
```

Without a bundler (CDN / unbundled deps) the default url just works; you can also pass your own `SharedWorker` via `worker`. Raw proxy without the facade: `createSharedWorker()`.

---

### Also in this release

- Concurrent `readFile` on the same path no longer fails with a bogus `ENOENT` (exclusive per-path lock, same as writes).
- Multi-open works Node-style: FDs for the same path share one sync access handle with independent cursors.
- `readFile` no longer masks every failure as `ENOENT` (`EISDIR`, etc. preserved).
- `dispose()` terminates the underlying browser `Worker`.
- `sideEffects: false` so unused facade can be tree-shaken when you only import `createDedicatedWorker`.
- Facade `writeFile` / `appendFile` accept `Blob` / `File` directly (no manual `arrayBuffer()` needed).
- `importStream` writes `ReadableStream`, `Blob`, or `File` sources without buffering the whole file and can report cumulative byte progress.

