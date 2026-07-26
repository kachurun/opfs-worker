# Dedicated worker

This is the default mode. `createOPFS()` starts a dedicated Web Worker with the sync OPFS implementation inside, and gives you a Node-like `fs` on the main thread.

Use it when you want the widest browser support and the fastest write path. File descriptors work here. Writes work in older Safari too — the sync access handles only exist inside a dedicated worker, which is why this mode exists.

## Basic usage

```typescript
import { createOPFS } from 'opfs-worker';
// same thing, longer name:
// import { createOPFSDedicated } from 'opfs-worker';
// or from 'opfs-worker/sync' if you want a smaller bundle without async/shared code

const fs = createOPFS({ root: '/my-app' });

await fs.writeFile('/config.json', JSON.stringify({ theme: 'dark' }));
const config = await fs.readFile('/config.json'); // string — encoding auto-detected from the extension

fs.dispose(); // tear down watches and stop the worker
```

You don’t need any special bundler worker setup. The worker script is inlined by default.

For positional I/O (`open` / `read` / `write` by offset), see [file descriptors](../api/file-descriptors.md).

## When you need a real worker file

The inlined worker is a blob URL. That fails under a strict CSP that blocks `blob:`, or if you want to host the script yourself. Pass a URL to the shipped file instead:

```typescript
import workerUrl from 'opfs-worker/dedicated.worker.js?url'; // Vite

const fs = createOPFS({ root: '/my-app', url: workerUrl });
```

Or pass a Worker you already created:

```typescript
const worker = new Worker(workerUrl, { type: 'module' });
const fs = createOPFS({ root: '/my-app', worker });
```

For ready-made worker files and wiring them yourself, see [API → Ready-made worker files](../api/README.md#ready-made-worker-files).

## How workers are shared on one page

Calls with the same `root` (and the same `url`, if any) reuse one Worker on that page. Different roots get different Workers. If you pass your own `worker`, that pooling is skipped.

`dispose()` drops your connection. The Worker itself is terminated only when nothing else on the page is still using that pooled entry.

`setOptions` applies to the shared instance for that root — keep options consistent if several `createOPFS()` calls point at the same pool entry.

Dedicated workers are **not** shared across tabs. For one filesystem process for every tab, use [SharedWorker](./sharedworker.md).

See also [streaming](./streaming.md), [uploading from disk](./uploading.md), [downloading to disk](./downloading.md), [watching](./watching.md), and the [API overview](../api/README.md).
