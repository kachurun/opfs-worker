# Uploading from disk

Once you have `File`s or handles, write them with `importStream` / `importFiles` — see [streaming](./streaming.md). The other direction: [Downloading to disk](./downloading.md).

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS({ root: '/my-app' });
```

## File / folder picker (`<input>`)

A plain `<input type="file">` gives you files. Add `webkitdirectory` and the picker selects a whole folder — each file then carries its relative path in `webkitRelativePath`:

```html
<input type="file" id="files" multiple />
<input type="file" id="folder" webkitdirectory multiple />
```

```typescript
const input = document.querySelector<HTMLInputElement>('#files')!;

input.addEventListener('change', async () => {
    if (!input.files?.length) return;

    const entries = [...input.files].map(
        (file) =>
            [`/uploads/${file.webkitRelativePath || file.name}`, file] as [string, File]
    );

    await fs.importFiles(entries, {
        onProgress: ({ path, totalBytesWritten, totalBytes }) => {
            console.log(`${path}: ${totalBytesWritten}/${totalBytes}`);
        },
    });
});
```

## File System Access API (`showOpenFilePicker` / `showDirectoryPicker`)

Pass handles straight in — we call `getFile()` and walk directories for you:

```typescript
// One or more files
const handles = await window.showOpenFilePicker({ multiple: true });

for (const handle of handles) {
    await fs.importStream(`/uploads/${handle.name}`, handle);
}
// or in one shot:
await fs.importFiles(handles, { prefix: '/uploads' });

// Whole directory
const dir = await window.showDirectoryPicker();
await fs.importFiles(dir, { prefix: '/uploads' });
// → /uploads/readme.txt, /uploads/src/app.ts, …
```

Safari and Firefox have limited File System Access support — keep the `<input>` path as a fallback.

## Paste from clipboard

`paste` gives you the same `DataTransfer` as drag-and-drop (`event.clipboardData`). Copied files from the OS, or a screenshot as an image file, land in `files` / `items` — then `importFiles` as usual:

```typescript
window.addEventListener('paste', async (e) => {
    const data = e.clipboardData;
    if (!data?.files.length) return;

    // Don't steal Cmd/Ctrl+V from text fields
    if ((e.target as HTMLElement)?.matches('input, textarea, [contenteditable="true"]')) {
        return;
    }

    e.preventDefault();

    const entries = [...data.files].map(
        (file) => [`/uploads/${file.name}`, file] as [string, File]
    );

    await fs.importFiles(entries);
});
```

For folder trees, reuse the `webkitGetAsEntry` walker from drag-and-drop (`clipboardData` is a `DataTransfer`).

## Drag and drop

Dropped folders need the non-standard (but widely supported) `webkitGetAsEntry` API, walked recursively:

```typescript
async function collect(entry: FileSystemEntry, prefix = ''): Promise<[string, File][]> {
    if (entry.isFile) {
        const file = await new Promise<File>((res, rej) =>
            (entry as FileSystemFileEntry).file(res, rej)
        );

        return [[`${prefix}${entry.name}`, file]];
    }

    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];

    // readEntries returns partial batches — keep calling until empty
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
            reader.readEntries(res, rej)
        );
        if (batch.length === 0) break;
        children.push(...batch);
    }

    const nested = await Promise.all(
        children.map((c) => collect(c, `${prefix}${entry.name}/`))
    );

    return nested.flat();
}

const dropZone = document.querySelector('#drop')!;

// Required — without this, drop never fires
dropZone.addEventListener('dragover', (e) => e.preventDefault());

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();

    const entries = [...e.dataTransfer!.items]
        .map((item) => item.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => entry !== null);

    const files = (
        await Promise.all(entries.map((entry) => collect(entry, '/uploads/')))
    ).flat();

    await fs.importFiles(files, {
        onProgress: ({ path, index, count, bytesWritten, bytesTotal }) => {
            console.log(`[${index + 1}/${count}] ${path}: ${bytesWritten}/${bytesTotal}`);
        },
    });
});
```

The [live demo](https://kachurun.github.io/opfs-worker/) does drop + paste this way — see `demo/components/FileBrowser/`.
