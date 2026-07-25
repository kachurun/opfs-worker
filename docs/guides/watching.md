# Watching

Changes go out on a `BroadcastChannel` (default name `opfs-worker`). Nothing is emitted unless you `watch` a path.

```typescript
import { createOPFS } from 'opfs-worker';

const channel = new BroadcastChannel('opfs-worker');
channel.onmessage = (e) => console.log(e.data);

const fs = createOPFS({
    root: '/my-app',
    namespace: 'my-app:fs',
    broadcastChannel: channel, // or just the string 'opfs-worker'
});

const stop = fs.watch('/', {
    recursive: true,
    include: ['**/*.json'],
    exclude: ['tmp/**'],
});

await fs.writeFile('/config.json', '{}');
// → { namespace, path, type: 'added' | 'changed' | 'removed', isDirectory, timestamp, hash? }

stop(); // or fs.unwatch('/')
```

`watch` returns an unsubscribe function. Options: [`WatchOptions`](../types.md#watchoptions). Payload: [`WatchEvent`](../types.md#watchevent).

## Gotchas

- Into a worker, pass a **channel name** (string). You can’t post a `BroadcastChannel` instance across the wire. On the main thread the facade accepts either.
- SharedWorker: one backend + one channel → every listening tab sees the same events.
- Whether events include `hash` depends on [hashing](./hashing.md) settings.
