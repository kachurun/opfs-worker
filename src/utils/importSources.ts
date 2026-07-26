import { normalizePath, resolvePath } from './helpers';

import type { ImportFileData, ImportFilesSource, PathLike } from '../types';

/** Content types after File System Access handles are resolved. */
export type ResolvedImportFileData = string | Uint8Array | Blob;

export function isFileSystemFileHandle(value: unknown): value is FileSystemFileHandle {
    return (
        typeof value === 'object'
        && value !== null
        && (value as FileSystemHandle).kind === 'file'
        && typeof (value as FileSystemFileHandle).getFile === 'function'
    );
}

export function isFileSystemDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
    return (
        typeof value === 'object'
        && value !== null
        && (value as FileSystemHandle).kind === 'directory'
        && typeof (value as { entries?: unknown }).entries === 'function'
    );
}

async function resolveImportFileData(data: ImportFileData): Promise<ResolvedImportFileData> {
    if (isFileSystemFileHandle(data)) {
        return data.getFile();
    }

    return data;
}

async function collectDirectoryHandle(
    handle: FileSystemDirectoryHandle,
    prefix: string
): Promise<[string, File][]> {
    const out: [string, File][] = [];

    for await (const [name, entry] of (handle as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
        const path = resolvePath(`${ prefix }/${ name }`);

        if (entry.kind === 'file') {
            out.push([path, await (entry as FileSystemFileHandle).getFile()]);
        }
        else {
            out.push(...await collectDirectoryHandle(entry as FileSystemDirectoryHandle, path));
        }
    }

    return out;
}

function isFileHandleList(source: unknown): source is Iterable<FileSystemFileHandle> {
    if (isFileSystemFileHandle(source) || isFileSystemDirectoryHandle(source)) {
        return false;
    }

    if (source instanceof Map) {
        return false;
    }

    if (!source || typeof source !== 'object' || typeof (source as Iterable<unknown>)[Symbol.iterator] !== 'function') {
        return false;
    }

    const first = (source as Iterable<unknown>)[Symbol.iterator]().next().value;

    return first === undefined || isFileSystemFileHandle(first);
}

/**
 * Normalize anything {@link importFiles} accepts into `[path, bytes|blob|string][]`.
 * Resolves File System Access handles on this thread (where permission was granted).
 */
export async function expandImportFilesSource(
    source: ImportFilesSource,
    prefix = '/'
): Promise<[string, ResolvedImportFileData][]> {
    const root = normalizePath(prefix);

    if (isFileSystemDirectoryHandle(source)) {
        return collectDirectoryHandle(source, root);
    }

    if (isFileSystemFileHandle(source)) {
        return [[resolvePath(`${ root }/${ source.name }`), await source.getFile()]];
    }

    if (isFileHandleList(source)) {
        const out: [string, ResolvedImportFileData][] = [];

        for (const handle of source) {
            out.push([
                resolvePath(`${ root }/${ handle.name }`),
                await handle.getFile(),
            ]);
        }

        return out;
    }

    const pairs = source instanceof Map
        ? [...source.entries()]
        : [...(source as Iterable<[PathLike, ImportFileData]>)];

    const out: [string, ResolvedImportFileData][] = [];

    for (const [path, data] of pairs) {
        out.push([
            normalizePath(typeof path === 'string' ? path : path.pathname),
            await resolveImportFileData(data),
        ]);
    }

    return out;
}
