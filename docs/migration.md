# Migration (1.x → 2.x)

## Renames

| Was                       | Now                                                  |
| ------------------------- | ---------------------------------------------------- |
| `createWorker`            | `createOPFS` (deprecated alias kept)                 |
| `OPFSFileSystem`          | `OPFSFacade` (deprecated alias kept)                 |
| `OPFSWorker`              | `OPFSSync`                                           |
| `opfs-worker/raw`         | `opfs-worker/pure`                                   |
| `fs.createIndex(entries)` | `fs.importFiles(entries)` (`createIndex` alias kept) |

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

Full entry map: [API](./api/README.md).

## From earlier 2.x

Breaking / behaviour changes since early 2.x (see the changelog for the exact release):

### Watching

| Was                                                                                                        | Now                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `fs.watch(path, options?)` only registered filters; you listened on `BroadcastChannel` yourself for events | Node-style `fs.watch(path[, options], listener)` — filtered callbacks on the facade                                          |
| Producer only broadcast if _that_ instance had called `watch`                                              | Every mutation publishes on the channel when one is configured; path / include / exclude filtering is local to each listener |
| Backend (`OPFSSync` / `OPFSAsync`) had `watch` / `unwatch`                                                 | Removed — subscription lives on `OPFSFacade` only                                                                            |

```diff
- const channel = new BroadcastChannel('opfs-worker');
- channel.onmessage = (e) => { /* filter yourself */ };
- fs.watch('/');
+ const stop = fs.watch('/', { recursive: true }, (event) => {
+   console.log(event.type, event.path);
+ });
+ // stop(); or fs.unwatch('/')
```

Raw `BroadcastChannel` still works if you want every unfiltered event — see [watching](./guides/watching.md).

### SharedWorker name

`createOPFSShared` used to use a fixed worker name (`'opfs-worker'` by default). Different `root`s could share one SharedWorker and fight via `setOptions`.

Now the browser name is `` `${name}:${root}` `` (default prefix still `opfs-worker`). Tabs that must share one instance need the same `name` **and** `root`.

### Streaming

| Was                                                              | Now                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `importStream` / `importFiles` took `Blob` / `File` / pairs only | Also `FileSystemFileHandle` / `FileSystemDirectoryHandle` (and lists of file handles); `{ prefix }` for handle imports |
| `importStream` `onProgress: (bytesWritten: number) => …`         | `onProgress: (progress: { path, bytesWritten, bytesTotal? }) => …`                                                     |
| Type `ImportFilesEntries`                                        | Removed — use `ImportFilesSource`                                                                                      |

```diff
- await fs.importStream(path, file, { onProgress: (n) => console.log(n) });
+ await fs.importStream(path, file, {
+   onProgress: ({ path, bytesWritten, bytesTotal }) => { /* … */ },
+ });
```

Details: [streaming](./guides/streaming.md), [uploading from disk](./guides/uploading.md).
