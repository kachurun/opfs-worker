# SharedWorker

Use this when several tabs of your app should talk to **one** filesystem process. Writes go through that single instance, so tabs don’t race each other on the same paths. [Watch](./watching.md) events use `BroadcastChannel` as usual, so every listening tab sees the same changes.

Under the hood it’s the same async OPFS path as [async](./async.md): no file descriptors, and writes need Safari **26+** (or Chrome / Firefox). For older Safari writes, stick to the [dedicated worker](./dedicated.md).

Unlike dedicated mode, a SharedWorker can’t live in an inline blob — the browser ties shared workers to a real script URL. You load the file we ship: `opfs-worker/shared.worker.js`.

## With a bundler (Vite)

```typescript
import workerUrl from 'opfs-worker/shared.worker.js?url';
import { createOPFSShared } from 'opfs-worker/sharedworker';

const fs = createOPFSShared({ root: '/my-app', url: workerUrl });

await fs.writeText('/shared-config.json', '{}');
```

## Without a bundler

If you omit `url`, we look for `./shared.worker.js` next to the package files. That only works if your server actually serves the file there:

```typescript
import { createOPFSShared } from 'opfs-worker/sharedworker';

const fs = createOPFSShared({ root: '/my-app' });
```

Or build the `SharedWorker` yourself and hand it over (then the `name` is entirely yours — match ``opfs-worker:${root}`` if you want the same isolation as above):

```typescript
const worker = new SharedWorker(
    new URL('opfs-worker/shared.worker.js', import.meta.url),
    { type: 'module', name: 'opfs-worker:/my-app' }
);

const fs = createOPFSShared({ root: '/my-app', worker });
```

Tabs share one instance when they use the **same script URL** and the same SharedWorker `name`.

`createOPFSShared` builds that name for you as ``${name}:${root}`` (default prefix `'opfs-worker'`). So `root: '/my-app'` becomes a worker named `opfs-worker:/my-app`, and a different root gets a different SharedWorker — same idea as dedicated mode pooling by root. If you pass your own `name` (e.g. `'my-app'`), `root` is still appended (`my-app:/my-app`).

Only when you pass a ready-made `worker` instance do you control the name yourself — then make sure every tab that should share state uses the same script URL + name.

## Lifecycle

`dispose()` only closes **this tab’s** connection. Other tabs keep using the SharedWorker until they disconnect too.

`setOptions` applies to the shared instance for everyone. If two tabs pass different options, the last call wins — keep them consistent across tabs.

See also [async](./async.md), [watching](./watching.md), and the [API overview](../api/README.md).