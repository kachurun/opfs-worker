# Pure classes

Use this when you already run a Web Worker (or SharedWorker) and want OPFS inside it — without this package spawning another worker or wiring Comlink for you.

You get the low-level classes only. Main-thread setup (create the worker, `expose` / `wrap`, cleanup) is yours.

If you just want a ready-made `fs` from the main thread, prefer [dedicated](./dedicated.md), [async](./async.md), or [SharedWorker](./sharedworker.md) instead.

```typescript
import { OPFSSync, OPFSAsync } from 'opfs-worker/pure';
```

| Class       | Where it runs                                  | File descriptors |
| ----------- | ---------------------------------------------- | ---------------- |
| `OPFSSync`  | Dedicated worker only                          | yes              |
| `OPFSAsync` | Main thread, dedicated worker, or SharedWorker | no               |
| `BaseOPFS`  | Shared base — you usually don’t instantiate it | —                |

There’s no string I/O here — `readFile` / `writeFile` take and return `Uint8Array`. Turn text into bytes (and back) yourself with `TextEncoder` / `TextDecoder`, or whatever encoding you need.

## `OPFSSync` in your Worker

```typescript
// my-app.worker.ts
import { OPFSSync } from 'opfs-worker/pure';

const fs = new OPFSSync({ root: '/my-app' });

await fs.writeFile('/config.json', new TextEncoder().encode('{}'));
```

`/pure` does not take over your worker’s message port. If the main thread needs to call this, you expose it yourself (Comlink, or your own protocol).

## `OPFSAsync` in a Worker/SharedWorker/MainThread

```typescript
import { OPFSAsync } from 'opfs-worker/pure';

const fs = new OPFSAsync({ root: '/my-app' });

await fs.writeFile('/config.json', new TextEncoder().encode('{}'));
```

See also [Dedicated worker guide](./dedicated.md), [SharedWorker guide](./sharedworker.md), [Async guide](./async.md), and the [API overview](../api/README.md).
