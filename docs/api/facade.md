# OPFSFacade

Node-ish API: encodings, auto-detect by extension, path as `string` or `URL`. You normally get one from [`createOPFS*`](./create.md); you can also `new OPFSFacade({ fs, worker?, dispose })`.

`fs.promises === fs`.

## Escape hatch

| Field | Notes |
| ----- | ----- |
| `backend` | Raw [`OPFSApi`](../types.md#opfsapi) — same methods without encoding helpers |
| `worker` | `Worker` / `SharedWorker` if this facade owns one; `undefined` for async |

## File I/O

| Method | Notes |
| ------ | ----- |
| `readFile` / `writeFile` / `appendFile` | Encoding as string, `{ encoding }`, or auto |
| `importStream` | Stream / Blob / File — [streaming](../guides/streaming.md) |
| `readText` / `writeText` / `appendText` | UTF-8 by default |

## Directories & metadata

| Method | Notes |
| ------ | ----- |
| `mkdir` | `{ recursive }`; numeric mode is accepted and ignored |
| `readDir` | `DirentData[]` |
| `stat` / `exists` / `realpath` | |
| `remove` | `{ recursive, force }` |
| `rename` / `copy` | `copy` takes `{ recursive, overwrite }` |
| `clear` | Empty a dir (default `/`) |
| `index` | `Map<path, FileStat>` |
| `createIndex` | Bulk `[path, string \| Uint8Array \| Blob][]` |

## Watch & lifecycle

| Method | Notes |
| ------ | ----- |
| `watch` | Returns `() => void` |
| `unwatch` | |
| `setOptions` | [Hashing](../guides/hashing.md) and friends |
| `dispose` | Tear down the backend |

## Node aliases

`unlink` / `rm` / `rmdir` → `remove`. `readdir` → `readDir`. `lstat` → `stat`. `chmod` is a no-op (no Unix modes in OPFS).

## File descriptors

`open`, `read`, `write`, `close`, `fstat`, `ftruncate`, `fsync` — dedicated / `OPFSSync` only. Async throws `ENOTSUP`.

Full story: [file descriptors](../file-descriptors.md).
