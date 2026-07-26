# Hashing

`stat()`, `index()`, and [watch](./watching.md) events can include a `hash` field on files (not directories). You pick the algorithm once via options or `setOptions()`.

| Value                   | What you get                                                 |
| ----------------------- | ------------------------------------------------------------ |
| `'etag'` (default)      | Cheap tag from mtime + size — the file contents are not read |
| `'SHA-1'` … `'SHA-512'` | Real content hash via Web Crypto                             |
| `null` / `false`        | No `hash` field                                              |

`maxFileSize` (default 50MB) only applies to SHA-\* hashing. Files larger than that skip the hash so a huge upload doesn’t stall `stat`. The default `'etag'` ignores `maxFileSize`.

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS();

await fs.writeFile('/data.txt', 'Hello');
console.log((await fs.stat('/data.txt')).hash); // e.g. "m1abc-c" (etag)

await fs.setOptions({ hashAlgorithm: 'SHA-256' });
console.log((await fs.stat('/data.txt')).hash); // hex digest of the contents
```

Set it at create time if you already know what you want:

```typescript
const fs = createOPFS({
    hashAlgorithm: 'SHA-256',
    maxFileSize: 10 * 1024 * 1024, // skip SHA above 10MB
});
```

## On watch events

The same `hash` lands on [watch](./watching.md) events for files (`added` / `changed`). Directories and `removed` events don’t include it. Disable hashing (`null` / `false`) and the field is omitted.

**Think twice before enabling SHA-\* here.** Every write / create / delete that goes out as a watch event will run that hash algorithm on the file (subject to `maxFileSize`). With `'etag'` that’s cheap (mtime + size). With `'SHA-256'` you’re hashing the contents on every mutation — fine if you need content digests in the event stream, wasteful if you only wanted hashes on occasional `stat()` calls.

```typescript
const fs = createOPFS({ hashAlgorithm: 'SHA-256' });

const stop = fs.watch('/', { recursive: true }, (event) => {
    // event.hash — same value you’d get from fs.stat(event.path)
    console.log(event.type, event.path, event.hash);
});

await fs.writeFile('/data.txt', 'Hello');
// → { type: 'added', path: '/data.txt', hash: '185f8db3…', … }

await fs.writeFile('/data.txt', 'Hello!');
// → { type: 'changed', path: '/data.txt', hash: 'a0b65939…', … }

stop();
```

Handy for cache keys or skipping work when content hasn’t changed — when you’re sure the hashing cost is worth it.

For the full options table, see [API → Options](../api/README.md#options).
