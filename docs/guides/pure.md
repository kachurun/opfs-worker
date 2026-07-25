# Pure classes

Use the classes inside a worker (or thread) you already own. This package does not spawn a nested worker or call Comlink `expose()` — main-thread wiring is yours.

```typescript
import { OPFSSync, OPFSAsync } from 'opfs-worker/pure';
```

| Class | Runs where | FD |
| ----- | ---------- | -- |
| `OPFSSync` | Dedicated worker only | yes |
| `OPFSAsync` | Main thread, dedicated, or SharedWorker | no |
| `BaseOPFS` | Shared base — usually you don’t instantiate it | — |

## OPFSSync in your dedicated worker

```typescript
// my-app.worker.ts
import { OPFSSync } from 'opfs-worker/pure';

const fs = new OPFSSync({
    root: '/my-app',
    broadcastChannel: 'my-app-events', // name only — instances can’t cross the wire
});

await fs.writeFile('/config.json', new TextEncoder().encode('{}'));
```

`/pure` does not take over your worker’s message port.

## OPFSAsync in a SharedWorker you write

```typescript
import { expose } from 'comlink';
import { OPFSAsync } from 'opfs-worker/pure';

const fs = new OPFSAsync({ root: '/my-app' });

onconnect = (e) => {
    expose(fs, e.ports[0]);
};
```

Or use the [SharedWorker guide](./sharedworker.md).

Also: [backend API](../api/backend.md), [dedicated](./dedicated.md), [async](./async.md).
