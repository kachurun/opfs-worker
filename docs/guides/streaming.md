# Streaming

Write large files without buffering the whole payload.

|               | Method                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| Facade        | `importStream(path, source, options?)` · `importFiles(entries, options?)`      |
| Backend / raw | `writeStream(path, stream, onProgress?)` · `importFiles(entries, onProgress?)` |

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

## `importFiles` (bulk)

Same streaming path for many entries — strings, bytes, Blobs, or Files.

First argument is any iterable of `[path, data]` pairs: an array of tuples, a `Map`, etc.

`onProgress` receives an object (not a bare number):

| Field                              | Meaning                                   |
| ---------------------------------- | ----------------------------------------- |
| `path`                             | File currently being written              |
| `index` / `count`                  | 0-based index and total number of entries |
| `bytesWritten` / `bytesTotal`      | Progress within the current file          |
| `totalBytesWritten` / `totalBytes` | Progress across the whole import          |

```typescript
await fs.importFiles(
  [
    ['/a.txt', 'hello'],
    ['/upload.bin', fileFromInput],
  ],
  {
    onProgress: ({ path, bytesWritten, bytesTotal, totalBytesWritten, totalBytes }) => {
      console.log(`${path}: ${bytesWritten}/${bytesTotal} (all ${totalBytesWritten}/${totalBytes})`);
    },
  }
);
// → { paths: ['/a.txt', '/upload.bin'], count: 2, bytesWritten: … }

// Map works too
await fs.importFiles(new Map([
  ['/a.txt', 'hello'],
  ['/b.txt', 'world'],
]));
```

`createIndex` is kept as a deprecated alias.

## Uploading files and folders from disk

Getting `File` objects out of the browser is the DOM's job; once you have them, `importFiles` does the rest.

### File / folder picker

A plain `<input type="file">` gives you files. Add `webkitdirectory` and the picker selects a whole folder — each file then carries its relative path in `webkitRelativePath`:

```html
<input type="file" id="files" multiple />
<input type="file" id="folder" webkitdirectory multiple />
```

```typescript
input.addEventListener('change', async () => {
    const entries = [...input.files].map((file) => [
        `/uploads/${file.webkitRelativePath || file.name}`,
        file,
    ] as [string, File]);

    await fs.importFiles(entries, {
        onProgress: ({ path, totalBytesWritten, totalBytes }) => {
            console.log(`${path}: ${totalBytesWritten}/${totalBytes}`);
        },
    });
});
```

### Drag and drop

Dropped folders are only reachable through the non-standard (but universally supported) `webkitGetAsEntry` API, which has to be walked recursively:

```typescript
async function collect(entry: FileSystemEntry, prefix = ''): Promise<[string, File][]> {
    if (entry.isFile) {
        const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));

        return [[`${prefix}${entry.name}`, file]];
    }

    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];

    // readEntries returns partial batches — keep calling until it's empty
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));

        if (batch.length === 0) break;
        children.push(...batch);
    }

    const nested = await Promise.all(children.map((c) => collect(c, `${prefix}${entry.name}/`)));

    return nested.flat();
}

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();

    const entries = [...e.dataTransfer!.items]
        .map((item) => item.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => entry !== null);

    const files = (await Promise.all(entries.map((entry) => collect(entry, '/uploads/')))).flat();

    await fs.importFiles(files, {
        onProgress: ({ path, index, count, bytesWritten, bytesTotal }) => {
            console.log(`[${index + 1}/${count}] ${path}: ${bytesWritten}/${bytesTotal}`);
        },
    });
});
```

The [demo](https://kachurun.github.io/opfs-worker/) implements exactly this flow — see `demo/components/FileBrowser/`.

## `writeStream` (raw)

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS();
await fs.backend.writeStream('/data.bin', someBlob.stream(), (n) => console.log(n));
```

## Reading back without buffering: `readBlob`

`readFile` copies the whole file into a `Uint8Array`, which is wasteful for media. `readBlob` returns the disk-backed `Blob` that OPFS already has, so nothing is read until something asks for bytes:

```typescript
const blob = await fs.readBlob('/media/clip.mp4');

video.src = URL.createObjectURL(blob);
```

The browser then seeks and buffers only the ranges it plays — a 2 GB video costs no memory up front. The same `Blob` works for `<img>`, `<audio>`, `<iframe>` (PDF), `fetch()` bodies, and `showSaveFilePicker` downloads.

Reading a small header stays cheap too, since `slice()` does not touch the rest of the file:

```typescript
const magic = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
```

When the file system runs in a worker, the `Blob` crosses the boundary by reference — structured clone does not copy its contents.

## When to use what

| API                            | Good for                                                     |
| ------------------------------ | ------------------------------------------------------------ |
| `writeFile`                    | Data already in memory                                       |
| `importStream` / `writeStream` | One large `File` / `Blob` / network body                     |
| `importFiles`                  | Many files / folder uploads (streamed, with total progress)  |
| `readBlob`                     | Media previews, downloads, anything you can hand a `Blob` to |

Dedicated path chunks through FDs; async path uses `createWritable()` (Safari 26+ for writes).

Also: [facade](../api/README.md#facade).
