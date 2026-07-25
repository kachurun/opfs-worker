# Choosing a mode

Sync access handles only work in a **dedicated** worker. Async writes (`createWritable`) work on the main thread and in SharedWorkers too, but Safari needs **26+** for writing.

## Package entries

| Entry                             | What you get                                                    |
| --------------------------------- | --------------------------------------------------------------- |
| `opfs-worker`                     | Everything (plus 1.x aliases)                                   |
| `opfs-worker/sync`                | Dedicated worker only — `createOPFSDedicated`, `OPFSSync`       |
| `opfs-worker/async`               | No worker — `createOPFSAsync`, `OPFSAsync`                      |
| `opfs-worker/sharedworker`        | SharedWorker helpers                                            |
| `opfs-worker/pure`                | Classes only — you own the thread                               |
| `opfs-worker/dedicated.worker.js` | Prebuilt dedicated Worker script                                |
| `opfs-worker/shared.worker.js`    | Prebuilt SharedWorker script                                    |

## Modes

|       | API                                                       | When                            | FD        | Comlink |
| ----- | --------------------------------------------------------- | ------------------------------- | --------- | ------- |
| **1** | [`createOPFSDedicated()`](./guides/dedicated.md)          | Normal `fs`-like API            | yes       | yes     |
| **2** | [`OPFSSync` / `OPFSAsync` from `/pure`](./guides/pure.md) | Already in a worker             | sync only | no      |
| **3** | [`createOPFSAsync()`](./guides/async.md)                  | No worker                       | no        | no      |
| **4** | [`createOPFSShared()`](./guides/sharedworker.md)          | One fs shared by all tabs       | no        | yes     |

For the raw bytes API or the browser Worker, use `fs.backend` / `fs.worker` on any facade.

If size matters, import from `/sync`, `/async`, or `/sharedworker` instead of the main barrel.

## Trade-offs

|                           | Dedicated (`OPFSSync`)                                                                 | Async (`OPFSAsync`)            |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| File descriptors          | yes                                                                                    | `ENOTSUP`                      |
| Safari writes             | yes (via the worker)                                                                   | 26+                            |
| SharedWorker              | no                                                                                     | yes                            |
| One instance for all tabs | no (unless you build SharedWorker yourself)                                            | Mode 4                         |
| Bundle                    | ~80 KB inlined worker, or [prebuilt script](./guides/dedicated.md#diy-prebuilt-script) | small via `/async`             |
| CSP without `blob:`       | pass `url` / prebuilt script                                                           | no worker, or SharedWorker URL |

Aliases on the main entry: `createOPFS` / `createWorker` → `createOPFSDedicated`, `OPFSFileSystem` → `OPFSFacade`. See [Migration](./migration.md).
