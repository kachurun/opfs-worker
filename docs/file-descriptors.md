# File Descriptors

Positional I/O on the **dedicated / sync** backend (`createOPFSDedicated` / `createOPFS`, or `OPFSSync` from `/pure`). Async and SharedWorker throw `ENOTSUP`.

If you call FD `read`/`write` on **`fs.backend`** from the main thread, transfer buffers with Comlink. The [facade](./api/facade.md) does that for you.

```typescript
import { transfer } from 'comlink';
```

## `open(path, options?): Promise<number>`

```typescript
const fd = await fs.open('/data/config.json');
const fd = await fs.open('/data/new.txt', { create: true });
const fd = await fs.open('/data/unique.txt', { create: true, exclusive: true });
const fd = await fs.open('/data/log.txt', { create: true, truncate: true });
```

| Option | Default | |
| ------ | ------- | --- |
| `create` | `false` | Create the file if missing |
| `exclusive` | `false` | With `create`, fail if the file already exists |
| `truncate` | `false` | Truncate to zero length |

Throws `AlreadyExistsError` (`exclusive`), `FileTypeError` (path is a directory), or `FileSystemOperationError`.

`exclusive` is best-effort only — two workers can still race. OPFS has no real file locking.

## `read(fd, buffer, offset, length, position?): Promise<{ bytesRead, buffer }>`

```typescript
const buffer = new Uint8Array(1024);
const { bytesRead, buffer: out } = await fs.read(fd, buffer, 0, 1024, null);
```

- `position` `null` / `undefined` — current cursor, then advance
- `position` number — that offset, cursor unchanged
- Returns `bytesRead === 0` at EOF

With a Comlink proxy, buffers are transferred both ways. Use the **returned** buffer; the original is detached after transfer.

```typescript
import { transfer } from 'comlink';

const buffer = new Uint8Array(64);
const { bytesRead, buffer: out } = await fs.read(
    fd,
    transfer(buffer, [buffer.buffer]),
    0,
    buffer.length,
    null
);
```

Inside a worker with `OPFSSync` directly, plain buffers are fine — no `transfer`.

Chunked read from the main thread:

```typescript
const fd = await fs.open('/data/large-file.txt');
const chunkSize = 1024;
let buffer = new Uint8Array(chunkSize);

try {
    while (true) {
        const result = await fs.read(
            fd,
            transfer(buffer, [buffer.buffer]),
            0,
            chunkSize,
            null
        );
        if (result.bytesRead === 0) break;
        processChunk(result.buffer.subarray(0, result.bytesRead));
        buffer = new Uint8Array(chunkSize);
    }
} finally {
    await fs.close(fd);
}
```

Prefer small chunks over allocating a buffer the size of the whole file.

## `write(fd, buffer, offset?, length?, position?): Promise<number>`

```typescript
const data = new TextEncoder().encode('Hello, World!');
const bytesWritten = await fs.write(fd, data);
const bytesWritten2 = await fs.write(fd, data2, 0, 10, 100);
```

Same `position` rules as `read`. Extends the file if you write past EOF. Triggers watch events.

## Positioning

```typescript
await fs.read(fd, buf, 0, 10, null); // cursor 0 → 10
await fs.read(fd, buf, 0, 10, null); // cursor 10 → 20
await fs.read(fd, buf, 0, 10, 0);    // reads at 0, cursor stays 20
```

## `fstat` / `ftruncate` / `fsync`

```typescript
const stats = await fs.fstat(fd);
await fs.ftruncate(fd, 5);
await fs.fsync(fd);
```

`ftruncate` clamps the cursor if it sits past the new size, emits a watch event, and flushes.

`fsync` is best-effort. Unlike POSIX, the browser does not guarantee durability on power loss.

## `close(fd)`

Always close in a `finally`. Pending writes are flushed; open FDs are also closed when the worker is disposed.

```typescript
const fd = await fs.open('/data/file.txt');
try {
    // …
} finally {
    await fs.close(fd);
}
```

## Errors

| Error | When |
| ----- | ---- |
| `AlreadyExistsError` | `exclusive: true` and file exists |
| `ExistenceError` | Missing path |
| `FileTypeError` | File vs directory mismatch |
| `ValidationError` | Bad offset / length / args |
| `FileSystemOperationError` / `IOError` | Underlying FS / I/O failure |
| `PermissionError` | Access denied |
