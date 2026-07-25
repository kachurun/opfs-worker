---
"opfs-worker": minor
---

## Async mode + SharedWorker

- **Async (no worker):** `createOPFSAsync()` — same Node-like `fs` API on the main thread via `createWritable()`. Import from `opfs-worker` or `opfs-worker/async`. Writing needs Safari 26+ (Chrome / Firefox are fine). File descriptors are not supported.
- **SharedWorker:** `createOPFSShared()` — one filesystem for all tabs. Same async backend limits. Import from `opfs-worker/sharedworker`; the worker script ships as `opfs-worker/shared.worker.js`.

Docs and the demo were updated to match the new modes.
