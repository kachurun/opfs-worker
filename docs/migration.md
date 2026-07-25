# Migration (1.x → 2.x)

## Renames

| Was                      | Now                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `createWorker`           | `createOPFSDedicated` (`createOPFS` alias; deprecated `createWorker` still exported) |
| `OPFSFileSystem`         | `OPFSFacade` (deprecated alias kept)                                                 |
| `OPFSWorker`             | `OPFSSync`                                                                           |
| `opfs-worker/raw`        | `opfs-worker/pure`                                                                   |
| `opfs-worker/raw?worker` | `createOPFSDedicated()` + `fs.backend` / `fs.worker`, or `dedicated.worker.js`       |
| `fs.sync(entries)`       | `fs.createIndex(entries)`                                                            |

```diff
- import { createWorker, OPFSFileSystem } from 'opfs-worker';
- const fs: OPFSFileSystem = createWorker({ root: '/my-app' });
+ import { createOPFS, OPFSFacade } from 'opfs-worker';
+ const fs: OPFSFacade = createOPFS({ root: '/my-app' });
```

```diff
- import { OPFSWorker } from 'opfs-worker/raw';
+ import { OPFSSync } from 'opfs-worker/pure';
```

## New in 2.x

- Async: `createOPFSAsync` / `opfs-worker/async`
- SharedWorker: `createOPFSShared` / `opfs-worker/sharedworker`
- Prebuilt scripts: `dedicated.worker.js`, `shared.worker.js`
- Streaming: `importStream` / `writeStream`
- `fs.backend` / `fs.worker` on every facade
- `createOPFSDedicated`, `createOPFSAsync`, `createOPFSShared`

## Behaviour

- Concurrent `readFile` on one path takes the same exclusive lock as writes
- Multiple FDs on one path share one sync handle, each with its own cursor
- Dedicated `dispose()` terminates the browser `Worker`

Full entry map: [Choosing a mode](./choosing-a-mode.md).
