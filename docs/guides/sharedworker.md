# SharedWorker

One `OPFSAsync` for every tab. Locks live in that instance, so writes across tabs don’t collide. Watch events use `BroadcastChannel` as usual.

Same limits as [async](./async.md): Safari 26+ for writes, no FDs.

SharedWorkers are keyed by **script URL**, so we can’t inline the worker. Use the shipped file: `opfs-worker/shared.worker.js`.

## With a bundler (Vite example)

```typescript
import workerUrl from 'opfs-worker/shared.worker.js?url';
import { createOPFSShared } from 'opfs-worker/sharedworker';

const fs = createOPFSShared({ root: '/my-app', url: workerUrl });

await fs.writeText('/shared-config.json', '{}');
```

## Without a bundler

Default URL looks for `./shared.worker.js` next to the package files:

```typescript
import { createOPFSShared } from 'opfs-worker/sharedworker';

const fs = createOPFSShared({ root: '/my-app' });
```

Or pass your own instance:

```typescript
const worker = new SharedWorker(
    new URL('opfs-worker/shared.worker.js', import.meta.url),
    { type: 'module', name: 'opfs-worker' }
);
const fs = createOPFSShared({ root: '/my-app', worker });
```

## Raw backend

```typescript
const fs = createOPFSShared({ root: '/my-app', url: workerUrl });

await fs.backend.writeFile('/a.bin', bytes);
fs.worker; // SharedWorker

fs.dispose(); // closes this tab’s port only
```

## Notes

- `dispose()` does **not** kill the worker for other tabs — only your port.
- `setOptions` hits the shared instance, so keep options consistent across tabs.
- Same script URL + `name` (default `'opfs-worker'`) → same instance.

Also: [async](./async.md), [watching](./watching.md), [create helpers](../api/create.md).
