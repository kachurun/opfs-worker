import { describe, it, expect } from 'vitest';

import { expandImportFilesSource, isFileSystemDirectoryHandle, isFileSystemFileHandle } from '../src/utils/importSources';

function mockFile(name: string, body: string): File {
    return new File([body], name);
}

function mockFileHandle(name: string, body: string): FileSystemFileHandle {
    return {
        kind: 'file',
        name,
        getFile: async() => mockFile(name, body),
    } as unknown as FileSystemFileHandle;
}

function mockDirHandle(
    entries: Array<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>
): FileSystemDirectoryHandle {
    return {
        kind: 'directory',
        name: 'root',
        entries: async function* () {
            for (const entry of entries) {
                yield entry;
            }
        },
    } as unknown as FileSystemDirectoryHandle;
}

describe('importSources', () => {
    it('detects file / directory handles by shape', () => {
        expect(isFileSystemFileHandle(mockFileHandle('a.txt', 'x'))).toBe(true);
        expect(isFileSystemDirectoryHandle(mockDirHandle([]))).toBe(true);
        expect(isFileSystemFileHandle({ kind: 'directory' })).toBe(false);
    });

    it('expands path/data tuples and resolves file handles in data', async () => {
        const handle = mockFileHandle('via-handle.txt', 'hi');
        const list = await expandImportFilesSource([
            ['/a.txt', 'plain'],
            ['/b.txt', handle],
        ]);

        expect(list.map(([path]) => path)).toEqual(['/a.txt', '/b.txt']);
        expect(list[0]?.[1]).toBe('plain');
        expect(list[1]?.[1]).toBeInstanceOf(File);
        expect((list[1]?.[1] as File).name).toBe('via-handle.txt');
    });

    it('expands a directory handle recursively with prefix', async () => {
        const dir = mockDirHandle([
            ['readme.txt', mockFileHandle('readme.txt', 'hello')],
            ['src', mockDirHandle([
                ['app.ts', mockFileHandle('app.ts', ' cons')],
            ]) as unknown as FileSystemDirectoryHandle],
        ]);

        const list = await expandImportFilesSource(dir, '/uploads');

        expect(list.map(([path]) => path).sort()).toEqual([
            '/uploads/readme.txt',
            '/uploads/src/app.ts',
        ]);
    });

    it('expands a list of file handles', async () => {
        const list = await expandImportFilesSource(
            [mockFileHandle('a.bin', 'aa'), mockFileHandle('b.bin', 'bb')],
            '/in'
        );

        expect(list.map(([path]) => path)).toEqual(['/in/a.bin', '/in/b.bin']);
    });
});
