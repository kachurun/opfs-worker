# Watching

Listen for file changes — including from other tabs.

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS({
    root: '/my-app',
    namespace: 'my-app:fs', // stamped on every event so you can tell sources apart
});

const stop = fs.watch('/', { recursive: true }, (event) => {
    console.log(event.type, event.path, event.hash);
});

await fs.writeFile('/config.json', '{}');
// → {
//     namespace: 'my-app:fs',
//     path: '/config.json',
//     type: 'added' | 'changed' | 'removed',
//     isDirectory: false,
//     timestamp: …,
//     hash?: '…',
// }

stop(); // or fs.unwatch('/')
```

Same shape as Node’s `fs.watch(path[, options][, listener])`. Events also arrive from other tabs that share the same channel name (default `'opfs-worker'`).

## What gets notified

You only see changes made **through this library** (`writeFile`, `mkdir`, `remove`, …). OPFS itself has no watch API — if something else writes into OPFS outside `opfs-worker`, you won’t hear about it.

A write in another tab still shows up in your listener, even if that tab never called `watch`.

## Paths and globs

The first argument is a path or a minimatch glob:

```typescript
fs.watch('/data');                         // → /data/** (recursive is the default)
fs.watch('/config.json');                  // one file
fs.watch('/**/*.json');                    // all JSON under root
fs.watch('/data/*', { recursive: false }); // only immediate children
```

If the string has no `*`, `recursive: true` appends `/**`. If it already contains a glob, the string is used as-is.

## `include` / `exclude`

Further minimatch filters (string or array). An event reaches your listener only if it matches the watch target, matches at least one `include` (default: everything), and matches none of the `exclude` patterns:

```typescript
fs.watch('/my-app', {
    include: ['**/*.json'],
    exclude: ['**/tmp/**'],
}, (event) => {
    console.log(event.path); // /my-app/config.json — not /my-app/tmp/x.json
});

// Same idea — put the extension in the path instead of include
fs.watch('/my-app/**/*.json', {
    exclude: ['**/tmp/**'],
}, (event) => { /* … */ });
```

Just pick whatever reads clearer. The first-argument string is also the key for `unwatch`.

Options: [`WatchOptions`](../types.md#watchoptions). Event: [`WatchEvent`](../types.md#watchevent). Hash on events: [hashing](./hashing.md).

## BroadcastChannel

By default events use the channel name `'opfs-worker'`. Pass a string or a `BroadcastChannel` instance in options:

```typescript
const fs = createOPFS({
    broadcastChannel: 'my-app-fs', // or new BroadcastChannel('my-app-fs')
});
```

If you open the channel yourself, you get every event with no path filter. For filtered delivery, stick to `watch(path, listener)`.

```typescript
const channel = new BroadcastChannel('opfs-worker');
channel.onmessage = (e) => console.log(e.data);
```

## Across tabs

With a [SharedWorker](./sharedworker.md), every tab shares one filesystem and the same events on the channel.

With a dedicated worker, each tab has its own worker, but the shared channel name still delivers change events between tabs.
