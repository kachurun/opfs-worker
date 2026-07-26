# File Descriptors

File descriptors (FDs) let you open a file once and then read or write it in chunks — like Node’s `fs.open` / `fs.read` / `fs.write`. Useful for large files or when you need a cursor (seek to a position, read a bit, write a bit).

For most work, [`readFile` / `writeFile`](./README.md#file-io) is simpler. Reach for FDs when you want positional or streaming-style I/O on one open handle.

**Only works with the dedicated / sync backend** — `createOPFS()`, `createOPFSDedicated()`, or `OPFSSync` from `/pure`. Async and SharedWorker throw `ENOTSUP`.

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS();
```

## Quick example

```typescript
const fd = await fs.open('/data/log.txt', { create: true });

try {
    await fs.write(fd, new TextEncoder().encode('hello\n'));

    const buf = new Uint8Array(64);
    const { bytesRead } = await fs.read(fd, buf, 0, 64, 0); // read from start
    console.log(new TextDecoder().decode(buf.subarray(0, bytesRead)));
} finally {
    await fs.close(fd); // always close
}
```

## `open(path, options?)` → `Promise<number>`

Returns a number you pass to the other FD methods.

```typescript
const fd = await fs.open('/data/config.json');
const fd = await fs.open('/data/new.txt', { create: true });
const fd = await fs.open('/data/unique.txt', { create: true, exclusive: true });
const fd = await fs.open('/data/log.txt', { create: true, truncate: true });
```

| Option      | Default | What it does                                   |
| ----------- | ------- | ---------------------------------------------- |
| `create`    | `false` | Create the file if it doesn’t exist            |
| `exclusive` | `false` | With `create`, fail if the file already exists |
| `truncate`  | `false` | Wipe the file to zero length on open           |

Throws `AlreadyExistsError` (`exclusive`), `FileTypeError` (path is a directory), or `FileSystemOperationError`.

`exclusive` is best-effort — two workers can still race. OPFS has no real file locking.

## `read(fd, buffer, offset, length, position?)`

Fills your buffer with file bytes. Returns `{ bytesRead, buffer }`.

```typescript
const buffer = new Uint8Array(1024);
const { bytesRead } = await fs.read(fd, buffer, 0, 1024, null);
// data is in buffer[0 .. bytesRead)
```

- `position` omitted / `null` / `undefined` — read from the current cursor, then move the cursor forward
- `position` number — read from that byte offset; cursor stays put
- `bytesRead === 0` means end of file

### Chunked read

Prefer small chunks over allocating a buffer the size of the whole file:

```typescript
const fd = await fs.open('/data/large-file.txt');
const chunkSize = 1024;
const buffer = new Uint8Array(chunkSize);

try {
    while (true) {
        const { bytesRead } = await fs.read(fd, buffer, 0, chunkSize, null);
        if (bytesRead === 0) break;
        processChunk(buffer.subarray(0, bytesRead));
    }
} finally {
    await fs.close(fd);
}
```

## `write(fd, buffer, offset?, length?, position?)` → `Promise<number>`

Writes bytes and returns how many were written.

```typescript
const data = new TextEncoder().encode('Hello, World!');
const n = await fs.write(fd, data);
const n2 = await fs.write(fd, data2, 0, 10, 100); // 10 bytes at offset 100
```

Same `position` rules as `read`. Writing past EOF grows the file. Triggers watch events.

## Cursor (positioning)

Each open FD keeps a cursor. Sequential reads/writes advance it; an explicit `position` does not.

```typescript
await fs.read(fd, buf, 0, 10, null); // cursor 0 → 10
await fs.read(fd, buf, 0, 10, null); // cursor 10 → 20
await fs.read(fd, buf, 0, 10, 0);    // reads at 0, cursor stays 20
```

## `fstat` / `ftruncate` / `fsync`

```typescript
const stats = await fs.fstat(fd);   // like stat(), but by fd
await fs.ftruncate(fd, 5);         // shrink or grow to 5 bytes
await fs.fsync(fd);                // best-effort flush
```

`ftruncate` moves the cursor back if it was past the new size, emits a watch event, and flushes.

`fsync` is best-effort. Unlike POSIX, the browser does not guarantee durability on power loss.

## `close(fd)`

Always close in a `finally`. Pending writes are flushed. Open FDs are also closed when you `dispose()` the worker.

```typescript
const fd = await fs.open('/data/file.txt');
try {
    // …
} finally {
    await fs.close(fd);
}
```

## Using `fs.backend` directly (advanced)

Normal `fs.read` / `fs.write` go through the [facade](./README.md#facade), which handles buffers for you. You do **not** need Comlink’s `transfer`.

If you call `read` / `write` on **`fs.backend`** from the main thread (Comlink proxy to the worker), buffers must be transferred across the worker boundary — otherwise you pay a costly structured clone, and for `read` the filled buffer may not come back correctly.

```typescript
import { transfer } from 'comlink';

const buffer = new Uint8Array(64);
const { bytesRead, buffer: out } = await fs.backend.read(
    fd,
    transfer(buffer, [buffer.buffer]),
    0,
    buffer.length,
    null
);
// Use `out` — the original `buffer` is detached after transfer
```

Inside a worker with `OPFSSync` directly, plain buffers are fine — no `transfer`.

## Errors

| Error                                  | When                              |
| -------------------------------------- | --------------------------------- |
| `AlreadyExistsError`                   | `exclusive: true` and file exists |
| `ExistenceError`                       | Missing path                      |
| `FileTypeError`                        | File vs directory mismatch        |
| `ValidationError`                      | Bad offset / length / args        |
| `FileSystemOperationError` / `IOError` | Underlying FS / I/O failure       |
| `PermissionError`                      | Access denied                     |
