# Backend API

Classes from `opfs-worker/pure` (also re-exported from `/sync`, `/async`, `/sharedworker` where it makes sense). Bytes only — no encoding helpers.

```
BaseOPFS     mkdir, stat, readDir, watch, index, createIndex, …
  ├─ OPFSSync   sync access handles + FDs + writeStream
  └─ OPFSAsync  getFile / createWritable + writeStream (no FDs)
```

`OPFSApi` = the `OPFSSync` method surface — both backends and Comlink proxies satisfy it.

## Shared methods (`BaseOPFS`)

Path ops: `mkdir`, `stat`, `readDir`, `exists`, `clear`, `remove`, `rename`, `copy`, `realpath`, `index`, `createIndex`, `watch`, `unwatch`, `setOptions`, `dispose`.

Subclasses implement:

- `readFile` / `writeFile` / `appendFile`
- `writeStream(path, stream, onProgress?)`

## `OPFSSync`

Dedicated-worker backend. Adds FD methods (`open` … `fsync`) and streams via chunked FD writes.

→ [File descriptors](../file-descriptors.md), [dedicated guide](../guides/dedicated.md).

## `OPFSAsync`

Promise File System API. Streams via `createWritable()`. FDs always throw `OperationNotSupportedError`. Writes need Safari 26+ (or Chrome / Firefox).

→ [Async guide](../guides/async.md).

## Comlink

Dedicated and SharedWorker facades expose the same backend surface on `fs.backend` (a Comlink proxy). For FD `read`/`write` from the main thread, transfer buffers with Comlink — the facade does that for you.
