---
"opfs-worker": minor
---

Watching: Node-style `fs.watch(path[, options], listener)` on the facade — no manual `BroadcastChannel` needed for filtered callbacks. Mutations always publish on the channel (so a tab that never called `watch` still notifies others); path / include / exclude filtering happens in the listener. Backend `watch` / `unwatch` removed — subscription lives on the facade only.

SharedWorker: `createOPFSShared` now names the worker `` `${name}:${root}` `` (default prefix `opfs-worker`) so different roots get different SharedWorkers, matching dedicated-mode pooling.

Streaming: `importStream` / `importFiles` accept `FileSystemFileHandle` and `FileSystemDirectoryHandle` (and lists of file handles). Directory handles are walked recursively; use `{ prefix }` to place them under a path. `importStream` `onProgress` now receives `{ path, bytesWritten, bytesTotal? }` (same shape idea as `importFiles`) instead of a bare number. Docs updated to match.
