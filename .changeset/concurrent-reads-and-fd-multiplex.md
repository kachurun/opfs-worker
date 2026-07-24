---
"opfs-worker": major
---

## 2.0 — clearer entry points + concurrent I/O fixes

### Migration

Preferred names (new):


| What you want                | Use                                              |
| ---------------------------- | ------------------------------------------------ |
| Node-like facade             | `createOPFS()` / `OPFSFacade`                    |
| Raw Comlink worker API       | `createOPFSWorker()` → `{ fs, worker, dispose }` |
| Class inside your own worker | `OPFSWorker` from `opfs-worker/pure`             |


Deprecated aliases:

- `createWorker` → `createOPFS`
- `OPFSFileSystem` → `OPFSFacade`

```diff
- import { createWorker, OPFSFileSystem } from 'opfs-worker';
- const fs: OPFSFileSystem = createWorker({ root: '/my-app' });
+ import { createOPFS, OPFSFacade } from 'opfs-worker';
+ const fs: OPFSFacade = createOPFS({ root: '/my-app' });
```

`opfs-worker/raw` is removed — use `opfs-worker/pure`:

```diff
- import { OPFSWorker } from 'opfs-worker/raw';
+ import { OPFSWorker } from 'opfs-worker/pure';
```

`opfs-worker/raw?worker` (bundler worker import) is also removed — use `createOPFSWorker()`, which ships its own inlined worker:

```diff
- import OPFSWorker from 'opfs-worker/raw?worker';
- const worker = new OPFSWorker();
+ import { createOPFSWorker } from 'opfs-worker';
+ const { fs, worker, dispose } = createOPFSWorker();
```

---

### Also in this release

- Concurrent `readFile` on the same path no longer fails with a bogus `ENOENT` (exclusive per-path lock, same as writes).
- Multi-open works Node-style: FDs for the same path share one sync access handle with independent cursors.
- `readFile` no longer masks every failure as `ENOENT` (`EISDIR`, etc. preserved).
- `dispose()` terminates the underlying browser `Worker`.
- `sideEffects: false` so unused facade can be tree-shaken when you only import `createOPFSWorker`.

