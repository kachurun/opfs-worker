# Streaming

With large files, a naive `readFile` / `writeFile` can mean pulling the whole thing into memory.
Streaming avoids that: read media back as a disk-backed `Blob` the browser can play without copying every byte first, and write from a `File`, `Blob`, or network body in chunks.

| Goal                                               | Method                                    |
| -------------------------------------------------- | ----------------------------------------- |
| Play or download without buffering                 | `fs.readBlob(path)`                       |
| One large upload (`File`, `Blob`, or network body) | `fs.importStream(path, source, options?)` |
| Many files / a folder                              | `fs.importFiles(entries, options?)`       |

For picking files from disk (input, File System Access, paste, drag-and-drop), see [Uploading from disk](./uploading.md).
For saving files out of OPFS, see [Downloading to disk](./downloading.md).

## Reading without buffering: `readBlob`

`readFile` copies the whole file into memory. For video, audio, or anything you’d hand the browser as a `Blob`, use `readBlob` instead. It returns the disk-backed blob OPFS already has — nothing is read until something actually asks for bytes:

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS({ root: '/my-app' });

const blob = await fs.readBlob('/media/clip.mp4');
const url = URL.createObjectURL(blob);

video.src = url;
// later: URL.revokeObjectURL(url);
```

The browser then seeks and buffers only the ranges it plays, so a multi-gigabyte file costs no memory up front. The same `Blob` works for `<img>`, `<audio>`, `<iframe>` (PDF), `fetch()` bodies, and downloads — see [Downloading to disk](./downloading.md).

Reading a small header stays cheap too — `slice()` does not touch the rest of the file:

```typescript
const magic = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
```

## Writing: `importStream` / `importFiles`

The write helpers create or overwrite the file, return how many bytes were written, and emit a watch event when finished.

### `importStream` — one file

Pass a `ReadableStream<Uint8Array>`, a `Blob` / `File`, or a `FileSystemFileHandle`. Returns bytes written:

```typescript
const file = document.querySelector<HTMLInputElement>('#file')!.files![0]!;
const n = await fs.importStream(`/uploads/${file.name}`, file, {
    onProgress: ({ path, bytesWritten, bytesTotal }) => {
        console.log(`${path}: ${bytesWritten}/${bytesTotal ?? '?'}`);
    },
});
console.log(`done: ${n} bytes`);

// From the network — stream the response body straight into OPFS
const res = await fetch('/large.bin');
await fs.importStream('/cache/large.bin', res.body!);
```

`onProgress` receives `{ path, bytesWritten, bytesTotal? }` — `bytesTotal` is set for `Blob` / `File`, omitted for raw streams. Same API in dedicated, async, and SharedWorker modes.

### `importFiles` — many files

Same idea for a batch. Pass:

- `[path, data]` pairs (`string` / bytes / `Blob` / `File` / `FileSystemFileHandle` as data)
- a `Map`, or any iterable of those pairs
- a `FileSystemDirectoryHandle` (walked recursively)
- one or many `FileSystemFileHandle`s (paths from `handle.name`)

For directory / bare file handles, use `{ prefix }` to place them under a path (default `/`).

Progress is an object too — with batch fields on top of the per-file ones:

| Field                              | Meaning                                   |
| ---------------------------------- | ----------------------------------------- |
| `path`                             | File currently being written              |
| `index` / `count`                  | 0-based index and total number of entries |
| `bytesWritten` / `bytesTotal`      | Progress within the current file          |
| `totalBytesWritten` / `totalBytes` | Progress across the whole import          |

```typescript
const result = await fs.importFiles(
    [
        ['/a.txt', 'hello'],
        ['/upload.bin', file], // File / Blob / Uint8Array also fine
    ],
    {
        onProgress: ({ path, bytesWritten, bytesTotal, totalBytesWritten, totalBytes }) => {
            console.log(`${path}: ${bytesWritten}/${bytesTotal} (all ${totalBytesWritten}/${totalBytes})`);
        },
    }
);
// → { paths: ['/a.txt', '/upload.bin'], count: 2, bytesWritten: … }
```

How to get those files from a picker, paste, or drop: [Uploading from disk](./uploading.md).

## When to use what

| API            | Good for                                                |
| -------------- | ------------------------------------------------------- |
| `readBlob`     | Media previews, downloads, anything that takes a `Blob` |
| `writeFile`    | Data already in memory                                  |
| `importStream` | One large `File` / `Blob` / network body / file handle  |
| `importFiles`  | Many files, folder uploads, or directory handles        |

See also the [API overview](../api/README.md#facade), [Uploading from disk](./uploading.md), and [Downloading to disk](./downloading.md).
