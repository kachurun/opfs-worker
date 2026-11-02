---
"opfs-worker": patch
---

File descriptors: concurrent `open()` calls on one file now share a single sync access handle instead of each creating one. Overlapping `open()` / `readFile()` / `writeFile()` on the same path no longer fail with `EIO`. `NoModificationAllowedError` (a handle held elsewhere, e.g. in another tab) now maps to `EBUSY`.

Watching: the facade's default namespace now matches the worker's for roots without a leading slash (`root: 'app'`), so listeners receive events without an explicit `namespace`. A listener registered on overlapping watches (a recursive folder watch and a file inside it) is called once per change.

SharedWorker: the default worker URL now points at the built `shared.worker.js` next to the package files instead of inlining the TypeScript source as a `data:` URL.
