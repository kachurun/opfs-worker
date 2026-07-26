import { zip } from 'fflate';

import type { OPFSFacade } from '../../../src';

export interface UploadEntry {
    file: File;
    relativePath: string;
}

export async function zipDirectory(fs: OPFSFacade, dir: string): Promise<Blob> {
    const prefix = dir === '/' ? '/' : `${ dir }/`;
    const index = await fs.index();
    const files: Record<string, Uint8Array> = {};

    for (const [path, stat] of index) {
        if (stat.isDirectory || !path.startsWith(prefix)) {
            continue;
        }

        files[path.slice(prefix.length)] = new Uint8Array(await (await fs.readBlob(path)).arrayBuffer());
    }

    const packed = await new Promise<Uint8Array>((resolve, reject) => {
        zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
    });

    return new Blob([packed.slice()], { type: 'application/zip' });
}

export function toUploadEntries(files: FileList | File[]): UploadEntry[] {
    return [...files].map(file => ({
        file,
        relativePath: file.webkitRelativePath || file.name,
    }));
}

interface FileSystemEntryLike {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
    file: (cb: (file: File) => void, err?: (e: unknown) => void) => void;
    createReader: () => {
        readEntries: (cb: (entries: FileSystemEntryLike[]) => void, err?: (e: unknown) => void) => void;
    };
}

async function readEntry(entry: FileSystemEntryLike, prefix: string): Promise<UploadEntry[]> {
    if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));

        return [{ file, relativePath: `${ prefix }${ entry.name }` }];
    }

    if (!entry.isDirectory) {
        return [];
    }

    const reader = entry.createReader();
    const children: FileSystemEntryLike[] = [];

    for (;;) {
        const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
            reader.readEntries(resolve, reject);
        });

        if (batch.length === 0) {
            break;
        }

        children.push(...batch);
    }

    const nested = await Promise.all(
        children.map(child => readEntry(child, `${ prefix }${ entry.name }/`)),
    );

    return nested.flat();
}

export async function entriesFromDataTransfer(dataTransfer: DataTransfer): Promise<UploadEntry[]> {
    const items = [...dataTransfer.items]
        .map(item => item.webkitGetAsEntry() as unknown as FileSystemEntryLike | null)
        .filter((entry): entry is FileSystemEntryLike => entry !== null);

    if (items.length === 0) {
        return toUploadEntries(dataTransfer.files);
    }

    const results = await Promise.all(items.map(entry => readEntry(entry, '')));

    return results.flat();
}
