# Hashing

Set once via `hashAlgorithm` / `maxFileSize` in options or `setOptions()`. Shows up on `stat()`, `index()`, and [watch](./watching.md) events (files only).

| Value | What you get |
| ----- | ------------ |
| `'etag'` (default) | Cheap tag from mtime + size — no content read |
| `'SHA-1'` … `'SHA-512'` | Real content hash (Web Crypto) |
| `null` / `false` | No `hash` field |

`maxFileSize` (default 50MB) only limits SHA-\* hashing. Oversized files skip the hash.

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS();

await fs.writeFile('/data.txt', 'Hello');
console.log((await fs.stat('/data.txt')).hash); // etag-ish, e.g. "m1abc-c"

await fs.setOptions({ hashAlgorithm: 'SHA-256' });
console.log((await fs.stat('/data.txt')).hash); // hex digest
```

`root` scopes you under a subdirectory of OPFS. `namespace` is stamped on every watch event:

```typescript
const fs = createOPFS({
    root: '/my-app',
    namespace: 'my-app:fs',
});
```

Full options table: [`create` helpers](../api/create.md#options).
