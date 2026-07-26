# Async (no worker)

Uses the browser’s asynchronous OPFS APIs (`getFile()`, `createWritable()`, …) — see [MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system). Those run on the **current** thread (main or a worker you already own). Sync access handles need a dedicated worker instead.

Use it when you want a smaller bundle and don’t need file descriptors. Import from `opfs-worker/async` so the dedicated-worker code stays out of the bundle.

## Limits

Same limits as [SharedWorker](./sharedworker.md) — both use the async OPFS APIs:

- **Writes** need `createWritable()` — Chrome, Firefox, and Safari **26+**. Older Safari can read but not write. For writes everywhere OPFS exists, use the [dedicated worker](./dedicated.md).
- **No file descriptors** — `open` / `read` / `write` / … throw `ENOTSUP`.
- Each write goes through a swap file and commits on close. Fine for documents; slower if you do many tiny random writes.

## Basic usage

```typescript
import { createOPFSAsync } from 'opfs-worker/async';

const fs = createOPFSAsync({ root: '/my-app' });

await fs.writeFile('/note.txt', 'hello');
await fs.appendText('/note.txt', '!');
const text = await fs.readFile('/note.txt', 'utf-8');

fs.dispose();
```

Same Node-like API as the dedicated mode — encodings, `mkdir`, `stat`, watch, streaming, and so on.

## Bytes only

If you don’t need string encoding helpers and just want `Uint8Array` in and out:

```typescript
import { OPFSAsync } from 'opfs-worker/async';

const fs = new OPFSAsync({ root: '/my-app' });
await fs.writeFile('/x.bin', new Uint8Array([1, 2, 3]));
```

For one shared instance across tabs, use [SharedWorker](./sharedworker.md). For large uploads, see [streaming](./streaming.md). For pickers / paste / drop, see [uploading from disk](./uploading.md).
