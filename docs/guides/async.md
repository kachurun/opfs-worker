# Async

`OPFSAsync` on the **current** thread (main or a worker you already run). Does not create a worker. Uses `getFile()` / `createWritable()`, no Comlink.

Same limits apply as SharedWorker (it’s the same backend).

## Facade

```typescript
import { createOPFSAsync } from 'opfs-worker/async';

const fs = createOPFSAsync({ root: '/my-app' });

await fs.writeFile('/note.txt', 'hello');
await fs.appendText('/note.txt', '!');
const text = await fs.readFile('/note.txt', 'utf-8');
```

Import from `opfs-worker/async` to keep the dedicated-worker code out of the bundle.

## Raw class

```typescript
import { OPFSAsync } from 'opfs-worker/async';

const fs = new OPFSAsync({ root: '/my-app' });
await fs.writeFile('/x.bin', new Uint8Array([1, 2, 3]));
```

## Limits

- **Writes** need `createWritable()` — Chrome, Firefox, Safari **26+**. Reads work anywhere OPFS does.
- **No file descriptors** — `open` / `read` / `write` / … throw `ENOTSUP`.
- Each write goes through a swap file and commits on close — fine for documents, slow for many tiny random writes.

Streaming still works: [streaming](./streaming.md). For one fs across tabs: [SharedWorker](./sharedworker.md).
