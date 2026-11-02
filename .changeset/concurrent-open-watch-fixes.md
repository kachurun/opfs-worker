---
"opfs-worker": patch
---

File descriptors: an open descriptor now holds the path lock until `close()`, the same lock `readFile` / `writeFile` take. Whole-file operations on the path wait for open descriptors instead of failing with `EIO`. Descriptors opened without `truncate` share the file; an open with `truncate` waits for the others to close and keeps new ones out until it closes, so a reader never sees a write's truncate mid-write. `exclusive` creates are atomic. Concurrent `open()` calls on one file share a single sync access handle instead of each creating one. `NoModificationAllowedError` now maps to `EBUSY`. Upgrading: `readFile`, `writeFile` or `rm` on a path while you hold a descriptor on it now waits for that descriptor to close (it used to fail fast), so close descriptors before those calls.

Watching: the facade's default namespace now matches the worker's for roots without a leading slash (`root: 'app'`), so listeners receive events without an explicit `namespace`. A listener registered on overlapping watches (a recursive folder watch and a file inside it) is called once per change.

SharedWorker: the default worker URL now points at the built `shared.worker.js` next to the package files instead of inlining the TypeScript source as a `data:` URL.
