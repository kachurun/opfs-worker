# Streaming

Write large files without buffering the whole payload.

| | Method |
| --- | --- |
| Facade | `importStream(path, source, options?)` |
| Backend / raw | `writeStream(path, stream, onProgress?)` |

Both create or overwrite the file, return bytes written, and fire a watch event when done.

## `importStream` (facade)

Takes a `ReadableStream<Uint8Array>`, or a `Blob` / `File` (we call `.stream()` for you):

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS({ root: '/my-app' });

const file = input.files[0];
await fs.importStream(`/uploads/${file.name}`, file, {
    onProgress: (n) => console.log(`wrote ${n} bytes`),
});

const res = await fetch('/large.bin');
await fs.importStream('/cache/large.bin', res.body!);
```

With a worker backend the facade transfers the stream and proxies `onProgress`.

## `writeStream` (raw)

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS();
await fs.backend.writeStream('/data.bin', someBlob.stream(), (n) => console.log(n));
```

## When to use what

| API | Good for |
| --- | -------- |
| `writeFile` | Data already in memory |
| `importStream` / `writeStream` | Large `File` / `Blob` / network bodies |
| `createIndex` | Many small entries (Blobs are still fully buffered) |

Dedicated path chunks through FDs; async path uses `createWritable()` (Safari 26+ for writes).

Also: [facade](../api/facade.md), [backend](../api/backend.md).
