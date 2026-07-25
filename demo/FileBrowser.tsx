import { useRef, useState } from 'react';
import {
    ChevronDown,
    ChevronRight,
    Copy,
    Download,
    File,
    FilePlus,
    Folder,
    FolderOpen,
    FolderPlus,
    FolderUp,
    Pencil,
    RotateCcw,
    Trash2,
    Upload,
} from 'lucide-react';

import { formatBytes, type TreeNode } from './fs';

import type { OPFSFacade } from '../src';

interface FileBrowserProps {
    tree: TreeNode[];
    selectedPath: string | null;
    selectedKind: 'file' | 'directory' | null;
    uploadProgress: number | null;
    onUploadProgress: (value: number | null) => void;
    onSelect: (path: string, kind: 'file' | 'directory') => void;
    onRefresh: () => void;
    onReset: () => void;
    onLog: (kind: 'op' | 'error' | 'info', message: string, detail?: string) => void;
    fs: OPFSFacade;
}

interface RowActions {
    onRename: (path: string, kind: 'file' | 'directory') => void;
    onMove: (path: string, kind: 'file' | 'directory', directory: string) => void;
    onDuplicate: (path: string) => void;
    onDownload: (path: string) => void;
    onDelete: (path: string) => void;
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
    onSelect: (path: string, kind: 'file' | 'directory') => void;
    actions: RowActions;
}) {
    const isOpen = expanded.has(node.path);
    const selected = selectedPath === node.path;
    const [isDropTarget, setIsDropTarget] = useState(false);

    return (
        <div>
            <div
                className={`group flex h-7 w-full items-stretch gap-1 rounded-sm px-1 text-xs ${
                    isDropTarget
                        ? 'bg-primary/35 ring-1 ring-primary ring-inset'
                        : selected
                        ? 'bg-primary/25 hover:bg-primary/30'
                        : 'hover:bg-base-200'
                }`}
                style={{ paddingLeft: `${ depth * 12 + 4 }px` }}
                draggable
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
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => {
                        onSelect(node.path, node.kind);

                        if (node.kind === 'directory') {
                            onToggle(node.path);
                        }
                    }}
                >
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
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                        type="button"
                        className="btn btn-ghost btn-square btn-xs"
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
                        className="btn btn-ghost btn-square btn-xs"
                        title="Duplicate"
                        aria-label={`Duplicate ${ node.name }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            actions.onDuplicate(node.path);
                        }}
                    >
                        <Copy size={13} />
                    </button>
                    {node.kind === 'file' && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-square btn-xs"
                            title="Download"
                            aria-label={`Download ${ node.name }`}
                            onClick={(e) => {
                                e.stopPropagation();
                                actions.onDownload(node.path);
                            }}
                        >
                            <Download size={13} />
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-ghost btn-square btn-xs text-error"
                        title="Delete"
                        aria-label={`Delete ${ node.name }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            actions.onDelete(node.path);
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
    uploadProgress,
    onUploadProgress,
    onSelect,
    onRefresh,
    onReset,
    onLog,
    fs,
}: FileBrowserProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['/notes', '/data', '/bin']));
    const [dragOver, setDragOver] = useState(false);
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

    const uploadFiles = async (entries: UploadEntry[]) => {
        if (entries.length === 0) {
            return;
        }

        try {
            const dir = selectedKind === 'directory' && selectedPath
                ? (selectedPath === '/' ? '' : selectedPath)
                : '';

            for (const { file, relativePath } of entries) {
                const path = `${ dir }/${ relativePath }`.replace(/\/{2,}/g, '/');
                const total = file.size || 1;

                onLog('op', `importStream(${ path })`, formatBytes(file.size));
                onUploadProgress(0);
                await fs.importStream(path, file, {
                    onProgress: (bytesWritten: number) => {
                        onUploadProgress(Math.min(100, Math.round((bytesWritten / total) * 100)));
                    },
                });
                onLog('op', `imported ${ path }`, 'ok');
            }

            onRefresh();
        }
        catch (error) {
            onLog('error', 'upload failed', error instanceof Error ? error.message : String(error));
        }
        finally {
            onUploadProgress(null);
        }
    };

    const runAction = async (label: string, fn: () => Promise<void>) => {
        try {
            onLog('op', label);
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

    const resolveInTarget = (input: string, fallbackName: string): string => {
        const trimmed = input.trim() || fallbackName;

        if (trimmed.startsWith('/')) {
            return trimmed;
        }

        return joinParent(targetDir(), trimmed);
    };

    const newFile = () => {
        const dir = targetDir();
        const suggested = joinParent(dir, 'untitled.txt');
        const name = window.prompt('New file name', basename(suggested));

        if (name === null) {
            return;
        }

        const path = resolveInTarget(name, 'untitled.txt');

        if (dir) {
            setExpanded((prev) => new Set(prev).add(dir));
        }

        void runAction(`writeFile(${ path })`, async () => {
            await fs.writeFile(path, '');
            onSelect(path, 'file');
        });
    };

    const newFolder = () => {
        const dir = targetDir();
        const suggested = joinParent(dir, 'folder');
        const name = window.prompt('New folder name', basename(suggested));

        if (name === null) {
            return;
        }

        const path = resolveInTarget(name, 'folder');

        if (dir) {
            setExpanded((prev) => new Set(prev).add(dir));
        }

        void runAction(`mkdir(${ path })`, async () => {
            await fs.mkdir(path, { recursive: true });
            onSelect(path, 'directory');
            setExpanded((prev) => new Set(prev).add(path));
        });
    };

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
        onDownload: (path) => {
            void (async () => {
                try {
                    const data = await fs.readFile(path, 'binary');
                    const blob = new Blob([new Uint8Array(data)]);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');

                    a.href = url;
                    a.download = basename(path);
                    a.click();
                    URL.revokeObjectURL(url);
                    onLog('op', `download(${ path })`, 'ok');
                }
                catch (error) {
                    onLog('error', `download(${ path })`, error instanceof Error ? error.message : String(error));
                }
            })();
        },
        onDelete: (path) => {
            if (!window.confirm(`Delete ${ path }?`)) {
                return;
            }

            void runAction(`remove(${ path })`, () => fs.remove(path, { recursive: true, force: true }));
        },
    };

    return (
        <section
            className={`flex h-full min-h-0 flex-col border-r border-base-300 bg-base-100 ${ dragOver ? 'ring-2 ring-primary ring-inset' : '' }`}
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
                <h2 className="px-1 text-xs font-medium opacity-70">Files</h2>
                <div className="ml-auto flex items-center gap-0.5">
                    <button type="button" className="btn btn-ghost btn-square btn-xs" title="Upload files" aria-label="Upload files" onClick={() => inputRef.current?.click()}>
                        <Upload size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-square btn-xs" title="Upload folder" aria-label="Upload folder" onClick={() => folderInputRef.current?.click()}>
                        <FolderUp size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-square btn-xs" title="New file" aria-label="New file" onClick={newFile}>
                        <FilePlus size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-square btn-xs" title="New folder" aria-label="New folder" onClick={newFolder}>
                        <FolderPlus size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-square btn-xs" title="Reset storage and reseed" aria-label="Reset storage and reseed" onClick={onReset}>
                        <RotateCcw size={14} />
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
            {uploadProgress !== null && (
                <progress className="progress progress-primary w-full rounded-none" value={uploadProgress} max={100} />
            )}
            <div className="min-h-0 flex-1 overflow-auto p-1">
                {tree.length === 0 ? (
                    <div className="p-3 text-sm opacity-50">Empty — drop files or folders here.</div>
                ) : (
                    tree.map((node) => (
                        <TreeItem
                            key={node.path}
                            node={node}
                            depth={0}
                            selectedPath={selectedPath}
                            expanded={expanded}
                            onToggle={toggle}
                            onSelect={onSelect}
                            actions={actions}
                        />
                    ))
                )}
            </div>
            {renameTarget && (
                <dialog className="modal modal-open">
                    <div className="modal-box max-w-sm">
                        <h3 className="text-sm font-semibold">Rename</h3>
                        <p className="mt-1 truncate text-xs opacity-60">{renameTarget.path}</p>
                        <input
                            ref={renameInputRef}
                            className="input input-bordered input-sm mt-3 w-full"
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
