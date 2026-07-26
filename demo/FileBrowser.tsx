import { useEffect, useMemo, useRef, useState } from 'react';
import { zip } from 'fflate';
import {
    ChevronDown,
    ChevronRight,
    Copy,
    File,
    FilePlus,
    Folder,
    FolderOpen,
    FolderPlus,
    FolderUp,
    HardDrive,
    Pencil,
    Search,
    Trash2,
    Upload,
    X,
} from 'lucide-react';

import { formatBytes, type TreeNode } from './fs';

import type { MutableRefObject } from 'react';
import type { OPFSFacade } from '../src';

export interface FileBrowserActions {
    newFile: () => void;
    newFolder: () => void;
    upload: () => void;
    download: (path: string, kind: 'file' | 'directory') => void;
}

interface FileBrowserProps {
    tree: TreeNode[];
    selectedPath: string | null;
    selectedKind: 'file' | 'directory' | null;
    onSelect: (path: string | null, kind: 'file' | 'directory' | null) => void;
    onRefresh: () => void;
    onLog: (kind: 'op' | 'error' | 'info', message: string, detail?: string) => void;
    fs: OPFSFacade;
    quota: { usage: number; quota: number } | null;
    actionsRef?: MutableRefObject<FileBrowserActions | null>;
}

type UploadModal =
    | { phase: 'pick'; directory: string }
    | {
        phase: 'uploading' | 'error';
        directory: string;
        percent: number;
        path: string;
        index: number;
        count: number;
        error?: string;
    };

interface RowActions {
    onRename: (path: string, kind: 'file' | 'directory') => void;
    onMove: (path: string, kind: 'file' | 'directory', directory: string) => void;
    onDuplicate: (path: string) => void;
    onDelete: (path: string, kind: 'file' | 'directory') => void;
}

const TREE_DRAG_TYPE = 'application/x-opfs-tree-item';

interface TreeDragItem {
    path: string;
    kind: 'file' | 'directory';
}

function readTreeDrag(dataTransfer: DataTransfer): TreeDragItem | null {
    const value = dataTransfer.getData(TREE_DRAG_TYPE);

    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as TreeDragItem;
    }
    catch {
        return null;
    }
}

function basename(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1);
}

function dirname(path: string): string {
    const i = path.lastIndexOf('/');

    return i <= 0 ? '' : path.slice(0, i);
}

function joinParent(parent: string, name: string): string {
    return `${ parent }/${ name }`.replace(/\/{2,}/g, '/') || `/${ name }`;
}

function countTree(nodes: TreeNode[]): { files: number; folders: number } {
    let files = 0;
    let folders = 0;

    for (const node of nodes) {
        if (node.kind === 'directory') {
            folders += 1;

            const child = countTree(node.children ?? []);

            files += child.files;
            folders += child.folders;
        }
        else {
            files += 1;
        }
    }

    return { files, folders };
}

/** Keep matches and ancestor folders so the filtered tree still has structure. */
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
    const q = query.trim().toLowerCase();

    if (!q) {
        return nodes;
    }

    const visit = (node: TreeNode): TreeNode | null => {
        if (node.kind === 'file') {
            return node.name.toLowerCase().includes(q) ? node : null;
        }

        const children = (node.children ?? [])
            .map(visit)
            .filter((child): child is TreeNode => child !== null);
        const selfMatch = node.name.toLowerCase().includes(q);

        if (!selfMatch && children.length === 0) {
            return null;
        }

        return { ...node, children };
    };

    return nodes.map(visit).filter((node): node is TreeNode => node !== null);
}

function collectDirPaths(nodes: TreeNode[], into = new Set<string>()): Set<string> {
    for (const node of nodes) {
        if (node.kind === 'directory') {
            into.add(node.path);
            collectDirPaths(node.children ?? [], into);
        }
    }

    return into;
}

/** Pack a directory tree into a single ZIP Blob, paths relative to the folder. */
async function zipDirectory(fs: OPFSFacade, dir: string): Promise<Blob> {
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

/** `notes.md` → `notes.copy.md`; `archive.tar.gz` → `archive.tar.copy.gz`; no ext → `file.copy`. */
function duplicateName(path: string): string {
    const name = basename(path);
    const dot = name.lastIndexOf('.');

    if (dot <= 0) {
        return `${ path }.copy`;
    }

    return joinParent(dirname(path), `${ name.slice(0, dot) }.copy${ name.slice(dot) }`);
}

interface UploadEntry {
    file: File;
    relativePath: string;
}

/** `webkitRelativePath` is set when picking a directory, plain name otherwise. */
function toUploadEntries(files: FileList | File[]): UploadEntry[] {
    return [...files].map((file) => ({
        file,
        relativePath: file.webkitRelativePath || file.name,
    }));
}

/** Non-standard but universally supported entry API — the only way to read dropped folders. */
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

    // readEntries returns a partial batch — keep reading until it's empty
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
        children.map((child) => readEntry(child, `${ prefix }${ entry.name }/`))
    );

    return nested.flat();
}

async function entriesFromDataTransfer(dataTransfer: DataTransfer): Promise<UploadEntry[]> {
    const items = [...dataTransfer.items]
        .map((item) => item.webkitGetAsEntry() as unknown as FileSystemEntryLike | null)
        .filter((entry): entry is FileSystemEntryLike => entry !== null);

    if (items.length === 0) {
        return toUploadEntries(dataTransfer.files);
    }

    const results = await Promise.all(items.map((entry) => readEntry(entry, '')));

    return results.flat();
}

function TreeItem({
    node,
    depth,
    selectedPath,
    expanded,
    onToggle,
    onSelect,
    actions,
}: {
    node: TreeNode;
    depth: number;
    selectedPath: string | null;
    expanded: Set<string>;
    onToggle: (path: string) => void;
    onSelect: (path: string | null, kind: 'file' | 'directory' | null) => void;
    actions: RowActions;
}) {
    const isOpen = expanded.has(node.path);
    const selected = selectedPath === node.path;
    const [isDropTarget, setIsDropTarget] = useState(false);

    return (
        <div>
            <div
                className={`group flex h-7 w-full items-stretch gap-0.5 rounded-sm px-1 text-xs ${
                    isDropTarget
                        ? 'bg-primary/35 ring-1 ring-primary ring-inset'
                        : selected
                        ? 'bg-primary/25 hover:bg-primary/30'
                        : 'hover:bg-base-200'
                }`}
                style={{ paddingLeft: `${ depth * 12 + 4 }px` }}
                draggable
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(node.path, node.kind);

                    if (node.kind === 'directory') {
                        onToggle(node.path);
                    }
                }}
                onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(TREE_DRAG_TYPE, JSON.stringify({
                        path: node.path,
                        kind: node.kind,
                    } satisfies TreeDragItem));
                }}
                onDragOver={(e) => {
                    if (node.kind !== 'directory' || !e.dataTransfer.types.includes(TREE_DRAG_TYPE)) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    setIsDropTarget(true);
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setIsDropTarget(false);
                    }
                }}
                onDrop={(e) => {
                    if (node.kind !== 'directory') {
                        return;
                    }

                    const item = readTreeDrag(e.dataTransfer);

                    if (!item) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();
                    setIsDropTarget(false);
                    actions.onMove(item.path, item.kind, node.path);
                }}
            >
                <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
                    {node.kind === 'directory' ? (
                        <>
                            {isOpen
                                ? <ChevronDown size={12} className="shrink-0 opacity-50" />
                                : <ChevronRight size={12} className="shrink-0 opacity-50" />}
                            {isOpen
                                ? <FolderOpen size={14} className="shrink-0 text-warning" />
                                : <Folder size={14} className="shrink-0 text-warning" />}
                        </>
                    ) : (
                        <>
                            <span className="w-3 shrink-0" />
                            <File size={14} className="shrink-0 opacity-50" />
                        </>
                    )}
                    <span className="truncate">{node.name}</span>
                </div>
                <div className="flex max-w-0 shrink-0 items-center gap-0.5 overflow-hidden opacity-0 transition-opacity duration-150 group-hover:max-w-[5.5rem] group-hover:opacity-100 group-focus-within:max-w-[5.5rem] group-focus-within:opacity-100">
                    <button
                        type="button"
                        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center opacity-55 hover:opacity-100"
                        title="Rename"
                        aria-label={`Rename ${ node.name }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            actions.onRename(node.path, node.kind);
                        }}
                    >
                        <Pencil size={13} />
                    </button>
                    <button
                        type="button"
                        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center opacity-55 hover:opacity-100"
                        title="Duplicate"
                        aria-label={`Duplicate ${ node.name }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            actions.onDuplicate(node.path);
                        }}
                    >
                        <Copy size={13} />
                    </button>
                    <button
                        type="button"
                        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center text-error opacity-55 hover:opacity-100"
                        title="Delete"
                        aria-label={`Delete ${ node.name }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            actions.onDelete(node.path, node.kind);
                        }}
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>
            {node.kind === 'directory' && isOpen && node.children?.map((child) => (
                <TreeItem
                    key={child.path}
                    node={child}
                    depth={depth + 1}
                    selectedPath={selectedPath}
                    expanded={expanded}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    actions={actions}
                />
            ))}
        </div>
    );
}

export function FileBrowser({
    tree,
    selectedPath,
    selectedKind,
    onSelect,
    onRefresh,
    onLog,
    fs,
    quota,
    actionsRef,
}: FileBrowserProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const createInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const counts = countTree(tree);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['/notes', '/data', '/bin']));
    const [dragOver, setDragOver] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [uploadModal, setUploadModal] = useState<UploadModal | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<{
        path: string;
        kind: 'file' | 'directory';
    } | null>(null);
    const [createTarget, setCreateTarget] = useState<{
        kind: 'file' | 'directory';
        directory: string;
        name: string;
    } | null>(null);
    const [renameTarget, setRenameTarget] = useState<{
        path: string;
        kind: 'file' | 'directory';
        name: string;
    } | null>(null);

    const toggle = (path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);

            if (next.has(path)) {
                next.delete(path);
            }
            else {
                next.add(path);
            }

            return next;
        });
    };

    const filteredTree = useMemo(() => filterTree(tree, searchQuery), [tree, searchQuery]);
    const filtering = searchQuery.trim().length > 0;
    const visibleExpanded = useMemo(
        () => (filtering ? collectDirPaths(filteredTree) : expanded),
        [filtering, filteredTree, expanded],
    );

    const toggleSearch = () => {
        setSearchOpen((open) => {
            if (open) {
                setSearchQuery('');

                return false;
            }

            return true;
        });
    };

    useEffect(() => {
        if (searchOpen) {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
        }
    }, [searchOpen]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setSearchOpen((open) => {
                    if (open) {
                        setSearchQuery('');

                        return false;
                    }

                    return true;
                });
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const uploadFiles = async (entries: UploadEntry[]) => {
        if (entries.length === 0) {
            return;
        }

        const dir = targetDir();
        const directory = dir || '/';

        const files = entries.map(({ file, relativePath }) => {
            const path = `${ dir }/${ relativePath }`.replace(/\/{2,}/g, '/');

            return [path, file] as [string, File];
        });
        const totalBytes = files.reduce((sum, [, file]) => sum + (file.size || 0), 0);
        const firstPath = files[0]?.[0] ?? '';

        setUploadModal({
            phase: 'uploading',
            directory,
            percent: 0,
            path: firstPath,
            index: 0,
            count: files.length,
        });

        try {
            await fs.importFiles(files, {
                onProgress: ({ path, index, count, totalBytesWritten, totalBytes: allBytes }) => {
                    setUploadModal({
                        phase: 'uploading',
                        directory,
                        percent: Math.min(100, Math.round((totalBytesWritten / (allBytes || 1)) * 100)),
                        path,
                        index,
                        count,
                    });
                },
            });
            onLog('op', `importFiles(${ files.length })`, `${ formatBytes(totalBytes) } · ok`);
            onRefresh();
            setUploadModal(null);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            onLog('error', 'upload failed', message);
            setUploadModal((prev) => prev && prev.phase !== 'pick'
                ? { ...prev, phase: 'error', error: message }
                : {
                    phase: 'error',
                    directory,
                    percent: 0,
                    path: firstPath,
                    index: 0,
                    count: files.length,
                    error: message,
                });
        }
    };

    useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            const data = event.clipboardData;

            if (!data || (!data.files.length && ![...data.items].some((item) => item.kind === 'file'))) {
                return;
            }

            const target = event.target as HTMLElement | null;

            if (target?.matches('input, textarea, [contenteditable="true"]')) {
                return;
            }

            event.preventDefault();
            void entriesFromDataTransfer(data).then(uploadFiles);
        };

        window.addEventListener('paste', onPaste);

        return () => window.removeEventListener('paste', onPaste);
    });

    const runAction = async (label: string, fn: () => Promise<void>) => {
        try {
            await fn();
            onLog('op', label, 'ok');
            onRefresh();
        }
        catch (error) {
            onLog('error', label, error instanceof Error ? error.message : String(error));
        }
    };

    /** Directory to create into: selected folder, or parent of selected file, else root. */
    const targetDir = (): string => {
        if (!selectedPath) {
            return '';
        }

        if (selectedKind === 'directory') {
            return selectedPath === '/' ? '' : selectedPath;
        }

        return dirname(selectedPath);
    };

    const openCreate = (kind: 'file' | 'directory') => {
        setCreateTarget({
            kind,
            directory: targetDir() || '/',
            name: kind === 'file' ? 'untitled.txt' : 'folder',
        });
        // Focus after the dialog mounts
        requestAnimationFrame(() => {
            createInputRef.current?.focus();
            createInputRef.current?.select();
        });
    };

    const newFile = () => openCreate('file');
    const newFolder = () => openCreate('directory');

    const confirmCreate = () => {
        if (!createTarget) {
            return;
        }

        const { kind, directory } = createTarget;
        const name = createTarget.name.trim() || (kind === 'file' ? 'untitled.txt' : 'folder');
        const path = name.startsWith('/') ? name : joinParent(directory === '/' ? '' : directory, name);
        const dir = dirname(path);

        setCreateTarget(null);

        if (dir) {
            setExpanded((prev) => new Set(prev).add(dir));
        }

        if (kind === 'file') {
            void runAction(`writeFile(${ path })`, async () => {
                await fs.writeFile(path, '');
                onSelect(path, 'file');
            });

            return;
        }

        void runAction(`mkdir(${ path })`, async () => {
            await fs.mkdir(path, { recursive: true });
            onSelect(path, 'directory');
            setExpanded((prev) => new Set(prev).add(path));
        });
    };

    const openUpload = () => {
        setUploadModal({ phase: 'pick', directory: targetDir() || '/' });
    };

    const downloadPath = (path: string, kind: 'file' | 'directory') => {
        void (async () => {
            const label = `download(${ path })`;

            try {
                const blob = kind === 'directory'
                    ? await zipDirectory(fs, path)
                    : await fs.readBlob(path);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');

                a.href = url;
                a.download = kind === 'directory' ? `${ basename(path) || 'root' }.zip` : basename(path);
                a.click();
                URL.revokeObjectURL(url);
                onLog('op', label, 'ok');
            }
            catch (error) {
                onLog('error', label, error instanceof Error ? error.message : String(error));
            }
        })();
    };

    if (actionsRef) {
        actionsRef.current = {
            newFile,
            newFolder,
            upload: openUpload,
            download: downloadPath,
        };
    }

    const confirmRename = () => {
        if (!renameTarget) {
            return;
        }

        const name = renameTarget.name.trim();

        if (!name || name.includes('/') || name === '.' || name === '..') {
            onLog('error', 'rename', 'Name must be a single path segment');

            return;
        }

        const next = joinParent(dirname(renameTarget.path), name);

        if (next === renameTarget.path) {
            setRenameTarget(null);

            return;
        }

        const { path, kind } = renameTarget;

        setRenameTarget(null);
        void runAction(`rename(${ path } → ${ next })`, async () => {
            await fs.rename(path, next);
            onSelect(next, kind);
        });
    };

    const actions: RowActions = {
        onRename: (path, kind) => {
            setRenameTarget({ path, kind, name: basename(path) });
            // Focus after the dialog mounts
            requestAnimationFrame(() => {
                renameInputRef.current?.focus();
                renameInputRef.current?.select();
            });
        },
        onMove: (path, kind, directory) => {
            const dest = joinParent(directory, basename(path));

            if (
                dest === path
                || (kind === 'directory' && (directory === path || directory.startsWith(`${ path }/`)))
            ) {
                return;
            }

            void runAction(`rename(${ path } → ${ dest })`, async () => {
                await fs.rename(path, dest);

                if (selectedPath === path || selectedPath?.startsWith(`${ path }/`)) {
                    const movedSelection = `${ dest }${ selectedPath.slice(path.length) }`;
                    onSelect(movedSelection, selectedKind ?? kind);
                }

                setExpanded((prev) => new Set(prev).add(directory));
            });
        },
        onDuplicate: (path) => {
            const dest = duplicateName(path);

            void runAction(`copy(${ path } → ${ dest })`, () => fs.copy(path, dest, { recursive: true }));
        },
        onDelete: (path, kind) => {
            setDeleteTarget({ path, kind });
        },
    };

    return (
        <section
            className={`flex h-full min-h-0 flex-col bg-base-100 ${ dragOver ? 'ring-2 ring-primary ring-inset' : '' }`}
            onDragOver={(e) => {
                e.preventDefault();
                setDragOver(e.dataTransfer.types.includes(TREE_DRAG_TYPE));
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);

                const item = readTreeDrag(e.dataTransfer);

                if (item) {
                    actions.onMove(item.path, item.kind, '');

                    return;
                }

                void entriesFromDataTransfer(e.dataTransfer).then(uploadFiles);
            }}
        >
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-base-300 px-2">
                <button
                    type="button"
                    className="px-1 text-xs font-medium opacity-70"
                    title="Clear selection (root)"
                    onClick={() => onSelect(null, null)}
                >
                    Files
                </button>
                <div className="ml-auto flex items-center gap-0.5">
                    <button
                        type="button"
                        className={`btn btn-ghost btn-square btn-xs ${ searchOpen ? 'text-primary' : '' }`}
                        title="Filter files (⌘/Ctrl+F)"
                        aria-label="Filter files"
                        aria-pressed={searchOpen}
                        onClick={toggleSearch}
                    >
                        <Search size={14} />
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-square btn-xs"
                        title="Upload"
                        aria-label="Upload"
                        onClick={openUpload}
                    >
                        <Upload size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-square btn-xs" title="New file" aria-label="New file" onClick={newFile}>
                        <FilePlus size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-square btn-xs" title="New folder" aria-label="New folder" onClick={newFolder}>
                        <FolderPlus size={14} />
                    </button>
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files) {
                            void uploadFiles(toUploadEntries(e.target.files));
                            e.target.value = '';
                        }
                    }}
                />
                <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    // @ts-expect-error non-standard attribute, needed for directory picking
                    webkitdirectory=""
                    directory=""
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files) {
                            void uploadFiles(toUploadEntries(e.target.files));
                            e.target.value = '';
                        }
                    }}
                />
            </div>
            {searchOpen && (
                <div className="flex h-9 shrink-0 items-center gap-1 border-b border-base-300 px-2">
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="input input-sm h-7 min-w-0 flex-1 px-2 text-xs"
                        placeholder="Filter files…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                e.stopPropagation();
                                toggleSearch();
                            }
                        }}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-square btn-xs"
                            title="Clear filter"
                            aria-label="Clear filter"
                            onClick={() => {
                                setSearchQuery('');
                                searchInputRef.current?.focus();
                            }}
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
            )}
            <div
                className="min-h-0 flex-1 overflow-auto p-1"
                onClick={() => onSelect(null, null)}
            >
                {filteredTree.length === 0 ? (
                    <div className="p-3 text-sm opacity-50">
                        {filtering ? 'No matches.' : 'Empty — drop files or folders here.'}
                    </div>
                ) : (
                    filteredTree.map((node) => (
                        <TreeItem
                            key={node.path}
                            node={node}
                            depth={0}
                            selectedPath={selectedPath}
                            expanded={visibleExpanded}
                            onToggle={toggle}
                            onSelect={onSelect}
                            actions={actions}
                        />
                    ))
                )}
            </div>
            {quota && (
                <div className="shrink-0 border-t border-base-300 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="flex items-center gap-1.5 font-medium opacity-70">
                            <HardDrive size={13} />
                            Storage
                        </span>
                        <span className="truncate opacity-50">
                            {counts.files}
                            {' '}
                            {counts.files === 1 ? 'file' : 'files'}
                            {', '}
                            {counts.folders}
                            {' '}
                            {counts.folders === 1 ? 'folder' : 'folders'}
                        </span>
                    </div>
                    <progress
                        className="progress progress-primary my-1 h-1.5 w-full"
                        value={quota.quota > 0 ? Math.min(100, Math.round((quota.usage / quota.quota) * 100)) : 0}
                        max={100}
                    />
                    <div className="flex justify-between text-[10px] leading-none opacity-50">
                        <span>{formatBytes(quota.usage)}</span>
                        <span>{formatBytes(quota.quota)}</span>
                    </div>
                </div>
            )}
            {uploadModal && (
                <dialog className="modal modal-open">
                    <div className="modal-box relative max-w-sm">
                        {uploadModal.phase !== 'uploading' && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-square btn-xs absolute right-3 top-3"
                                title="Close"
                                aria-label="Close"
                                onClick={() => setUploadModal(null)}
                            >
                                <X size={14} />
                            </button>
                        )}
                        {uploadModal.phase === 'pick' ? (
                            <>
                                <h3 className="pr-8 text-sm font-semibold">Upload</h3>
                                <p className="mono mt-1 truncate text-xs opacity-60" title={uploadModal.directory}>
                                    to {uploadModal.directory}
                                </p>
                                <div className="mt-4 flex gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm flex-1 gap-2"
                                        onClick={() => inputRef.current?.click()}
                                    >
                                        <Upload size={14} />
                                        Files
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm flex-1 gap-2"
                                        onClick={() => folderInputRef.current?.click()}
                                    >
                                        <FolderUp size={14} />
                                        Folder
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h3 className="pr-8 text-sm font-semibold">
                                    {uploadModal.phase === 'error' ? 'Upload failed' : 'Uploading'}
                                </h3>
                                <p className="mono mt-1 truncate text-xs opacity-50" title={uploadModal.directory}>
                                    to {uploadModal.directory}
                                </p>
                                <div className="mt-3 flex items-center justify-between gap-2 text-xs opacity-70">
                                    <span className="mono min-w-0 truncate" title={uploadModal.path}>
                                        {uploadModal.path || '…'}
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                        {uploadModal.index + 1}/{uploadModal.count}
                                    </span>
                                </div>
                                <progress
                                    className={`progress mt-2 w-full ${ uploadModal.phase === 'error' ? 'progress-error' : 'progress-primary' }`}
                                    value={uploadModal.percent}
                                    max={100}
                                />
                                <div className="mt-1 text-right text-[11px] opacity-50">
                                    {uploadModal.percent}%
                                </div>
                                {uploadModal.phase === 'error' && uploadModal.error && (
                                    <p className="mt-2 text-xs text-error">{uploadModal.error}</p>
                                )}
                            </>
                        )}
                    </div>
                    {uploadModal.phase !== 'uploading' && (
                        <form method="dialog" className="modal-backdrop">
                            <button type="submit" onClick={() => setUploadModal(null)}>close</button>
                        </form>
                    )}
                </dialog>
            )}
            {deleteTarget && (
                <dialog className="modal modal-open">
                    <div className="modal-box max-w-sm">
                        <div className="flex items-start gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-error/15 text-error">
                                <Trash2 size={17} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold">
                                    Delete {deleteTarget.kind}?
                                </h3>
                                <p className="mono mt-1 truncate text-xs opacity-60" title={deleteTarget.path}>
                                    {deleteTarget.path}
                                </p>
                                {deleteTarget.kind === 'directory' && (
                                    <p className="mt-2 text-xs opacity-60">
                                        Everything inside this folder will also be deleted.
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="modal-action">
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setDeleteTarget(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-error btn-sm"
                                onClick={() => {
                                    const { path } = deleteTarget;

                                    setDeleteTarget(null);
                                    void runAction(
                                        `remove(${ path })`,
                                        () => fs.remove(path, { recursive: true, force: true })
                                    );
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button type="submit" onClick={() => setDeleteTarget(null)}>close</button>
                    </form>
                </dialog>
            )}
            {createTarget && (
                <dialog className="modal modal-open">
                    <div className="modal-box max-w-sm">
                        <h3 className="text-sm font-semibold">
                            {createTarget.kind === 'file' ? 'New file' : 'New folder'}
                        </h3>
                        <p className="mono mt-1 truncate text-xs opacity-60" title={createTarget.directory}>
                            in {createTarget.directory}
                        </p>
                        <input
                            ref={createInputRef}
                            className="input input-sm mt-3 w-full"
                            value={createTarget.name}
                            onChange={(e) => setCreateTarget({ ...createTarget, name: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    confirmCreate();
                                }

                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setCreateTarget(null);
                                }
                            }}
                        />
                        <div className="modal-action">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateTarget(null)}>
                                Cancel
                            </button>
                            <button type="button" className="btn btn-primary btn-sm" onClick={confirmCreate}>
                                Create
                            </button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button type="submit" onClick={() => setCreateTarget(null)}>close</button>
                    </form>
                </dialog>
            )}
            {renameTarget && (
                <dialog className="modal modal-open">
                    <div className="modal-box max-w-sm">
                        <h3 className="text-sm font-semibold">Rename</h3>
                        <p className="mt-1 truncate text-xs opacity-60">{renameTarget.path}</p>
                        <input
                            ref={renameInputRef}
                            className="input input-sm mt-3 w-full"
                            value={renameTarget.name}
                            onChange={(e) => setRenameTarget({ ...renameTarget, name: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    confirmRename();
                                }

                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setRenameTarget(null);
                                }
                            }}
                        />
                        <div className="modal-action">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenameTarget(null)}>
                                Cancel
                            </button>
                            <button type="button" className="btn btn-primary btn-sm" onClick={confirmRename}>
                                Rename
                            </button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button type="submit" onClick={() => setRenameTarget(null)}>close</button>
                    </form>
                </dialog>
            )}
        </section>
    );
}
