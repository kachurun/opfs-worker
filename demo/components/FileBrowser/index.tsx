import {
    FilePlus,
    FolderPlus,
    HardDrive,
    Search,
    Upload,
    X,
} from 'lucide-solid';
import {
    For,
    Show,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    onMount,
    type Component,
} from 'solid-js';

import { CreateDialog, DeleteDialog, RenameDialog, UploadDialog } from './Modals';
import { TreeItem } from './TreeItem';
import { TREE_DRAG_TYPE, readTreeDrag } from './drag';
import { collectDirPaths, countTree, duplicateName, filterTree } from './tree';
import { entriesFromDataTransfer, toUploadEntries, zipDirectory, type UploadEntry } from './upload';
import { formatBytes } from '../../lib/format';
import { basename, dirname, joinParent } from '../../lib/path';

import type { FileBrowserProps, RowActions, UploadModal } from './types';

export const FileBrowser: Component<FileBrowserProps> = (props) => {
    let inputRef: HTMLInputElement | undefined;
    let folderInputRef: HTMLInputElement | undefined;
    let renameInputRef: HTMLInputElement | undefined;
    let createInputRef: HTMLInputElement | undefined;
    let searchInputRef: HTMLInputElement | undefined;

    const [expanded, setExpanded] = createSignal(new Set(['/notes', '/data', '/bin']));
    const [dragOver, setDragOver] = createSignal(false);
    const [searchOpen, setSearchOpen] = createSignal(false);
    const [searchQuery, setSearchQuery] = createSignal('');
    const [uploadModal, setUploadModal] = createSignal<UploadModal | null>(null);
    const [deleteTarget, setDeleteTarget] = createSignal<{ path: string; kind: 'file' | 'directory' } | null>(null);
    const [createTarget, setCreateTarget] = createSignal<{
        kind: 'file' | 'directory';
        directory: string;
        name: string;
    } | null>(null);
    const [renameTarget, setRenameTarget] = createSignal<{
        path: string;
        kind: 'file' | 'directory';
        name: string;
    } | null>(null);

    const counts = createMemo(() => countTree(props.tree));
    const filteredTree = createMemo(() => filterTree(props.tree, searchQuery()));
    const filtering = createMemo(() => searchQuery().trim().length > 0);
    const visibleExpanded = createMemo(() => (
        filtering() ? collectDirPaths(filteredTree()) : expanded()
    ));

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

    const toggleSearch = () => {
        setSearchOpen((open) => {
            if (open) {
                setSearchQuery('');

                return false;
            }

            return true;
        });
    };

    createEffect(() => {
        if (searchOpen()) {
            searchInputRef?.focus();
            searchInputRef?.select();
        }
    });

    onMount(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                toggleSearch();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        onCleanup(() => window.removeEventListener('keydown', onKeyDown));
    });

    const targetDir = (): string => {
        const path = props.selectedPath;

        if (!path) {
            return '';
        }

        if (props.selectedKind === 'directory') {
            return path === '/' ? '' : path;
        }

        return dirname(path);
    };

    const runAction = async(label: string, fn: () => Promise<void>) => {
        try {
            await fn();
            props.onLog('op', label, 'ok');
            props.onRefresh();
        }
        catch (error) {
            props.onLog('error', label, error instanceof Error ? error.message : String(error));
        }
    };

    const uploadFiles = async(entries: UploadEntry[]) => {
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
            await props.fs.importFiles(files, {
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
            props.onLog('op', `importFiles(${ files.length })`, `${ formatBytes(totalBytes) } · ok`);
            props.onRefresh();
            setUploadModal(null);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            props.onLog('error', 'upload failed', message);
            setUploadModal((prev) => {
                if (prev && prev.phase !== 'pick') {
                    return { ...prev, phase: 'error', error: message };
                }

                return {
                    phase: 'error',
                    directory,
                    percent: 0,
                    path: firstPath,
                    index: 0,
                    count: files.length,
                    error: message,
                };
            });
        }
    };

    onMount(() => {
        const onPaste = (event: ClipboardEvent) => {
            const data = event.clipboardData;

            if (!data || (!data.files.length && ![...data.items].some(item => item.kind === 'file'))) {
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
        onCleanup(() => window.removeEventListener('paste', onPaste));
    });

    const openCreate = (kind: 'file' | 'directory') => {
        setCreateTarget({
            kind,
            directory: targetDir() || '/',
            name: kind === 'file' ? 'untitled.txt' : 'folder',
        });
        requestAnimationFrame(() => {
            createInputRef?.focus();
            createInputRef?.select();
        });
    };

    const newFile = () => openCreate('file');
    const newFolder = () => openCreate('directory');

    const openUpload = () => {
        setUploadModal({ phase: 'pick', directory: targetDir() || '/' });
    };

    const downloadPath = (path: string, kind: 'file' | 'directory') => {
        void (async() => {
            const label = `download(${ path })`;

            try {
                const blob = kind === 'directory'
                    ? await zipDirectory(props.fs, path)
                    : await props.fs.readBlob(path);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');

                a.href = url;
                a.download = kind === 'directory' ? `${ basename(path) || 'root' }.zip` : basename(path);
                a.click();
                URL.revokeObjectURL(url);
                props.onLog('op', label, 'ok');
            }
            catch (error) {
                props.onLog('error', label, error instanceof Error ? error.message : String(error));
            }
        })();
    };

    props.registerActions({
        newFile,
        newFolder,
        upload: openUpload,
        download: downloadPath,
    });

    onCleanup(() => props.registerActions(null));

    const confirmCreate = () => {
        const target = createTarget();

        if (!target) {
            return;
        }

        const { kind, directory } = target;
        const name = target.name.trim() || (kind === 'file' ? 'untitled.txt' : 'folder');
        const path = name.startsWith('/') ? name : joinParent(directory === '/' ? '' : directory, name);
        const dir = dirname(path);

        setCreateTarget(null);

        if (dir) {
            setExpanded(prev => new Set(prev).add(dir));
        }

        if (kind === 'file') {
            void runAction(`writeFile(${ path })`, async() => {
                await props.fs.writeFile(path, '');
                props.onSelect(path, 'file');
            });

            return;
        }

        void runAction(`mkdir(${ path })`, async() => {
            await props.fs.mkdir(path, { recursive: true });
            props.onSelect(path, 'directory');
            setExpanded(prev => new Set(prev).add(path));
        });
    };

    const confirmRename = () => {
        const target = renameTarget();

        if (!target) {
            return;
        }

        const name = target.name.trim();

        if (!name || name.includes('/') || name === '.' || name === '..') {
            props.onLog('error', 'rename', 'Name must be a single path segment');

            return;
        }

        const next = joinParent(dirname(target.path), name);

        if (next === target.path) {
            setRenameTarget(null);

            return;
        }

        const { path, kind } = target;

        setRenameTarget(null);
        void runAction(`rename(${ path } → ${ next })`, async() => {
            await props.fs.rename(path, next);
            props.onSelect(next, kind);
        });
    };

    const actions: RowActions = {
        onRename: (path, kind) => {
            setRenameTarget({ path, kind, name: basename(path) });
            requestAnimationFrame(() => {
                renameInputRef?.focus();
                renameInputRef?.select();
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

            void runAction(`rename(${ path } → ${ dest })`, async() => {
                await props.fs.rename(path, dest);

                const selected = props.selectedPath;

                if (selected === path || selected?.startsWith(`${ path }/`)) {
                    const movedSelection = `${ dest }${ selected.slice(path.length) }`;

                    props.onSelect(movedSelection, props.selectedKind ?? kind);
                }

                setExpanded(prev => new Set(prev).add(directory));
            });
        },
        onDuplicate: (path) => {
            const dest = duplicateName(path);

            void runAction(`copy(${ path } → ${ dest })`, () => props.fs.copy(path, dest, { recursive: true }));
        },
        onDelete: (path, kind) => {
            setDeleteTarget({ path, kind });
        },
    };

    return (
        <section
            class={ `flex h-full min-h-0 flex-col bg-base-100 ${ dragOver() ? 'ring-2 ring-primary ring-inset' : '' }` }
            onDragOver={ (e) => {
                e.preventDefault();
                setDragOver(!!e.dataTransfer?.types.includes(TREE_DRAG_TYPE));
            } }
            onDragLeave={ () => setDragOver(false) }
            onDrop={ (e) => {
                e.preventDefault();
                setDragOver(false);

                const item = readTreeDrag(e.dataTransfer!);

                if (item) {
                    actions.onMove(item.path, item.kind, '');

                    return;
                }

                void entriesFromDataTransfer(e.dataTransfer!).then(uploadFiles);
            } }
        >
            <div class="flex h-9 shrink-0 items-center gap-1 border-b border-base-300 px-2">
                <button
                    type="button"
                    class="px-1 text-xs font-medium opacity-70"
                    title="Clear selection (root)"
                    onClick={ () => props.onSelect(null, null) }
                >
                    Files
                </button>
                <div class="ml-auto flex items-center gap-0.5">
                    <button
                        type="button"
                        class={ `btn btn-ghost btn-square btn-xs ${ searchOpen() ? 'text-primary' : '' }` }
                        title="Filter files (⌘/Ctrl+F)"
                        aria-label="Filter files"
                        aria-pressed={ searchOpen() }
                        onClick={ toggleSearch }
                    >
                        <Search size={ 14 } />
                    </button>
                    <button
                        type="button"
                        class="btn btn-ghost btn-square btn-xs"
                        title="Upload"
                        aria-label="Upload"
                        onClick={ openUpload }
                    >
                        <Upload size={ 14 } />
                    </button>
                    <button type="button" class="btn btn-ghost btn-square btn-xs" title="New file" aria-label="New file" onClick={ newFile }>
                        <FilePlus size={ 14 } />
                    </button>
                    <button type="button" class="btn btn-ghost btn-square btn-xs" title="New folder" aria-label="New folder" onClick={ newFolder }>
                        <FolderPlus size={ 14 } />
                    </button>
                </div>
                <input
                    ref={ inputRef }
                    type="file"
                    multiple
                    class="hidden"
                    onChange={ (e) => {
                        const files = e.currentTarget.files;

                        if (files) {
                            void uploadFiles(toUploadEntries(files));
                            e.currentTarget.value = '';
                        }
                    } }
                />
                <input
                    ref={ folderInputRef }
                    type="file"
                    multiple
                    // @ts-expect-error non-standard attribute, needed for directory picking
                    webkitdirectory=""
                    directory=""
                    class="hidden"
                    onChange={ (e) => {
                        const files = e.currentTarget.files;

                        if (files) {
                            void uploadFiles(toUploadEntries(files));
                            e.currentTarget.value = '';
                        }
                    } }
                />
            </div>
            <Show when={ searchOpen() }>
                <div class="flex h-9 shrink-0 items-center gap-1 border-b border-base-300 px-2">
                    <input
                        ref={ searchInputRef }
                        type="text"
                        class="input input-sm h-7 min-w-0 flex-1 px-2 text-xs"
                        placeholder="Filter files…"
                        value={ searchQuery() }
                        onInput={ e => setSearchQuery(e.currentTarget.value) }
                        onKeyDown={ (e) => {
                            if (e.key === 'Escape') {
                                e.stopPropagation();
                                toggleSearch();
                            }
                        } }
                    />
                    <Show when={ searchQuery() }>
                        <button
                            type="button"
                            class="btn btn-ghost btn-square btn-xs"
                            title="Clear filter"
                            aria-label="Clear filter"
                            onClick={ () => {
                                setSearchQuery('');
                                searchInputRef?.focus();
                            } }
                        >
                            <X size={ 13 } />
                        </button>
                    </Show>
                </div>
            </Show>
            <div
                class="min-h-0 flex-1 overflow-auto p-1"
                onClick={ () => props.onSelect(null, null) }
            >
                <Show
                    when={ filteredTree().length > 0 }
                    fallback={ (
                        <div class="p-3 text-sm opacity-50">
                            {filtering() ? 'No matches.' : 'Empty — drop files or folders here.'}
                        </div>
                    ) }
                >
                    <For each={ filteredTree() }>
                        {node => (
                            <TreeItem
                                node={ node }
                                depth={ 0 }
                                selectedPath={ props.selectedPath }
                                expanded={ visibleExpanded() }
                                onToggle={ toggle }
                                onSelect={ props.onSelect }
                                actions={ actions }
                            />
                        )}
                    </For>
                </Show>
            </div>
            <Show when={ props.quota }>
                {quota => (
                    <div class="shrink-0 border-t border-base-300 px-3 py-2">
                        <div class="flex items-center justify-between gap-2 text-[11px]">
                            <span class="flex items-center gap-1.5 font-medium opacity-70">
                                <HardDrive size={ 13 } />
                                Storage
                            </span>
                            <span class="truncate opacity-50">
                                {counts().files}
                                {' '}
                                {counts().files === 1 ? 'file' : 'files'}
                                {', '}
                                {counts().folders}
                                {' '}
                                {counts().folders === 1 ? 'folder' : 'folders'}
                            </span>
                        </div>
                        <progress
                            class="progress progress-primary my-1 h-1.5 w-full"
                            value={ quota().quota > 0 ? Math.min(100, Math.round((quota().usage / quota().quota) * 100)) : 0 }
                            max={ 100 }
                        />
                        <div class="flex justify-between text-[10px] leading-none opacity-50">
                            <span>{formatBytes(quota().usage)}</span>
                            <span>{formatBytes(quota().quota)}</span>
                        </div>
                    </div>
                )}
            </Show>
            <Show when={ uploadModal() }>
                {modal => (
                    <UploadDialog
                        state={ modal() }
                        onClose={ () => setUploadModal(null) }
                        onPickFiles={ () => inputRef?.click() }
                        onPickFolder={ () => folderInputRef?.click() }
                    />
                )}
            </Show>
            <Show when={ deleteTarget() }>
                {target => (
                    <DeleteDialog
                        target={ target() }
                        onCancel={ () => setDeleteTarget(null) }
                        onConfirm={ (path) => {
                            setDeleteTarget(null);
                            void runAction(
                                `remove(${ path })`,
                                () => props.fs.remove(path, { recursive: true, force: true }),
                            );
                        } }
                    />
                )}
            </Show>
            <Show when={ createTarget() }>
                {target => (
                    <CreateDialog
                        target={ target() }
                        inputRef={ (el) => {
                            createInputRef = el;
                        } }
                        onNameChange={ name => setCreateTarget({ ...target(), name }) }
                        onCancel={ () => setCreateTarget(null) }
                        onConfirm={ confirmCreate }
                    />
                )}
            </Show>
            <Show when={ renameTarget() }>
                {target => (
                    <RenameDialog
                        target={ target() }
                        inputRef={ (el) => {
                            renameInputRef = el;
                        } }
                        onNameChange={ name => setRenameTarget({ ...target(), name }) }
                        onCancel={ () => setRenameTarget(null) }
                        onConfirm={ confirmRename }
                    />
                )}
            </Show>
        </section>
    );
};
