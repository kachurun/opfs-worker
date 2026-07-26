# Downloading to disk

How to get files out of OPFS into a real download or a save picker. Always start with `readBlob` — it returns a disk-backed `Blob` without copying the whole file into memory. Details: [streaming](./streaming.md).

```typescript
import { createOPFS } from 'opfs-worker';

const fs = createOPFS({ root: '/my-app' });
```

## Anchor download (`<a download>`)

Works everywhere. Trigger a browser download from the blob URL:

```typescript
async function download(path: string) {
    const blob = await fs.readBlob(path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = path.split('/').pop() || 'download';
    a.click();
    URL.revokeObjectURL(url);
}

await download('/reports/q1.pdf');
```

Same pattern as the [live demo](https://kachurun.github.io/opfs-worker/) (`demo/components/FileBrowser/`).

## Save picker (`showSaveFilePicker`)

Lets the user choose where to save (Chrome / Edge). Stream the OPFS blob into the writable:

```typescript
async function saveAs(path: string) {
    const blob = await fs.readBlob(path);
    const handle = await window.showSaveFilePicker({
        suggestedName: path.split('/').pop() || 'download',
    });
    const writable = await handle.createWritable();

    await writable.write(blob);
    await writable.close();
}
```

Safari / Firefox don’t support this API well — keep the `<a download>` path as a fallback.

## Folders

Walk only the folder you care about with `readDir` (no need to scan the whole FS via `index`):

```typescript
/** Every file under `dir` → [absolutePath, pathRelativeToDir] */
async function walkFiles(dir: string, prefix = ''): Promise<[string, string][]> {
    const out: [string, string][] = [];

    for (const entry of await fs.readDir(dir)) {
        const abs = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory) {
            out.push(...await walkFiles(abs, rel));
        }
        else {
            out.push([abs, rel]);
        }
    }

    return out;
}
```

### Directory picker (`showDirectoryPicker`)

User picks a destination folder; you recreate that OPFS subtree under it (Chrome / Edge; needs `mode: 'readwrite'`):

```typescript
async function exportDirectory(opfsDir: string) {
    const dest = await window.showDirectoryPicker({ mode: 'readwrite' });

    for (const [abs, rel] of await walkFiles(opfsDir)) {
        const parts = rel.split('/');
        const fileName = parts.pop()!;
        let dir = dest;

        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: true });
        }

        const file = await dir.getFileHandle(fileName, { create: true });
        const writable = await file.createWritable();
        await writable.write(await fs.readBlob(abs));
        await writable.close();
    }
}

await exportDirectory('/project'); // only /project/**, not the whole root
```

### Zip fallback

Where the directory picker isn’t available, pack that same walk into a zip, then download it. Example with [`fflate`](https://github.com/101arrowz/fflate):

```typescript
import { zip } from 'fflate';

async function zipDirectory(opfsDir: string): Promise<Blob> {
    const files: Record<string, Uint8Array> = {};

    for (const [abs, rel] of await walkFiles(opfsDir)) {
        files[rel] = new Uint8Array(await (await fs.readBlob(abs)).arrayBuffer());
    }

    const packed = await new Promise<Uint8Array>((resolve, reject) => {
        zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
    });

    return new Blob([packed.slice()], { type: 'application/zip' });
}

async function downloadDirectory(opfsDir: string) {
    const blob = await zipDirectory(opfsDir);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `${opfsDir.split('/').pop() || 'root'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
}

await downloadDirectory('/project');
```

Note: zipping loads each file’s bytes into memory. For huge trees prefer the directory picker above. The demo uses the same idea — see `zipDirectory` in `demo/components/FileBrowser/upload.ts`.
