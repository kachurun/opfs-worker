# Dedicated worker

The default path: `OPFSSync` inside a dedicated Web Worker. You get file descriptors and the fastest write path the browser allows for OPFS.

See also [API](../api/README.md).

## Facade

```typescript
import { createOPFSDedicated } from 'opfs-worker';
// or from 'opfs-worker/sync'

const fs = createOPFSDedicated({ root: '/my-app' });

await fs.writeFile('/config.json', JSON.stringify({ theme: 'dark' }));
const config = await fs.readFile('/config.json'); // string — auto-detected
```

`createOPFS` is the same thing with a shorter name (also from `opfs-worker/sync`).

The worker is inlined by default, so you don’t need a special bundler worker setup.

## Raw backend

Bytes in, bytes out — no encoding helpers. Same facade, via `backend`:

```typescript
const fs = createOPFSDedicated({ root: '/my-app' });

await fs.backend.writeFile('/config.json', new TextEncoder().encode('{}'));
const bytes = await fs.backend.readFile('/config.json');

// Browser Worker:
fs.worker; // Worker

fs.dispose(); // dispose + terminate
```

## Loading a real worker file

Pass `url` or `worker` when you can’t use the inline blob (strict CSP, custom hosting):

```typescript
import workerUrl from 'opfs-worker/dedicated.worker.js?url'; // Vite

const fs = createOPFSDedicated({ root: '/my-app', url: workerUrl });
```

## DIY prebuilt script

`opfs-worker/dedicated.worker.js` is a self-contained Worker (Comlink + `OPFSSync` already inside):

```typescript
import { wrap } from 'comlink';
import { OPFSFacade } from 'opfs-worker';
import workerUrl from 'opfs-worker/dedicated.worker.js?url';

const worker = new Worker(workerUrl, { type: 'module' });
const remote = wrap(worker);

const fs = new OPFSFacade({
    fs: remote,
    worker,
    dispose: () => {
        void remote.dispose();
        worker.terminate();
    },
});
```

## Notes

- Same `root` (and same `url`) on one page reuses one Worker; different roots get different Workers. `dispose()` drops your port and terminates the Worker only when the last facade for that pool entry is gone.
- Tabs don’t share a dedicated Worker — use [SharedWorker](./sharedworker.md) for that.
- Sync access handles only work in a dedicated worker.
- `setOptions` hits the shared instance for a pooled root — keep options consistent.

Also: [file descriptors](../api/file-descriptors.md), [streaming](./streaming.md), [API](../api/README.md).
