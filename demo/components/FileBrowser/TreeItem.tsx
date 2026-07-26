import {
    ChevronDown,
    ChevronRight,
    Copy,
    File,
    Folder,
    FolderOpen,
    Pencil,
    Trash2,
} from 'lucide-solid';
import { For, Show, createSignal, type Component } from 'solid-js';

import { TREE_DRAG_TYPE, readTreeDrag, type TreeDragItem } from './drag';

import type { RowActions } from './types';
import type { TreeNode } from '../../lib/fs';

export const TreeItem: Component<{
    node: TreeNode;
    depth: number;
    selectedPath: string | null;
    expanded: Set<string>;
    onToggle: (path: string) => void;
    onSelect: (path: string | null, kind: 'file' | 'directory' | null) => void;
    actions: RowActions;
}> = (props) => {
    const [isDropTarget, setIsDropTarget] = createSignal(false);
    const isOpen = () => props.expanded.has(props.node.path);
    const selected = () => props.selectedPath === props.node.path;

    return (
        <div>
            <div
                class={ `group flex h-7 w-full items-stretch gap-0.5 rounded-sm px-1 text-xs ${
                    isDropTarget()
                        ? 'bg-primary/35 ring-1 ring-primary ring-inset'
                        : selected()
                            ? 'bg-primary/25 hover:bg-primary/30'
                            : 'hover:bg-base-200'
                }` }
                style={{ 'padding-left': `${ props.depth * 12 + 4 }px` }}
                draggable={ true }
                onClick={ (e) => {
                    e.stopPropagation();
                    props.onSelect(props.node.path, props.node.kind);

                    if (props.node.kind === 'directory') {
                        props.onToggle(props.node.path);
                    }
                } }
                onDragStart={ (e) => {
                    e.dataTransfer!.effectAllowed = 'move';
                    e.dataTransfer!.setData(TREE_DRAG_TYPE, JSON.stringify({
                        path: props.node.path,
                        kind: props.node.kind,
                    } satisfies TreeDragItem));
                } }
                onDragOver={ (e) => {
                    if (props.node.kind !== 'directory' || !e.dataTransfer?.types.includes(TREE_DRAG_TYPE)) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer!.dropEffect = 'move';
                    setIsDropTarget(true);
                } }
                onDragLeave={ (e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setIsDropTarget(false);
                    }
                } }
                onDrop={ (e) => {
                    if (props.node.kind !== 'directory') {
                        return;
                    }

                    const item = readTreeDrag(e.dataTransfer!);

                    if (!item) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();
                    setIsDropTarget(false);
                    props.actions.onMove(item.path, item.kind, props.node.path);
                } }
            >
                <div class="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
                    <Show
                        when={ props.node.kind === 'directory' }
                        fallback={ (
                            <>
                                <span class="w-3 shrink-0" />
                                <File size={ 14 } class="shrink-0 opacity-50" />
                            </>
                        ) }
                    >
                        <Show when={ isOpen() } fallback={ <ChevronRight size={ 12 } class="shrink-0 opacity-50" /> }>
                            <ChevronDown size={ 12 } class="shrink-0 opacity-50" />
                        </Show>
                        <Show when={ isOpen() } fallback={ <Folder size={ 14 } class="shrink-0 text-warning" /> }>
                            <FolderOpen size={ 14 } class="shrink-0 text-warning" />
                        </Show>
                    </Show>
                    <span class="truncate">{props.node.name}</span>
                </div>
                <div class="flex max-w-0 shrink-0 items-center gap-0.5 overflow-hidden opacity-0 transition-opacity duration-150 group-hover:max-w-[5.5rem] group-hover:opacity-100 group-focus-within:max-w-[5.5rem] group-focus-within:opacity-100">
                    <button
                        type="button"
                        class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center opacity-55 hover:opacity-100"
                        title="Rename"
                        aria-label={ `Rename ${ props.node.name }` }
                        onClick={ (e) => {
                            e.stopPropagation();
                            props.actions.onRename(props.node.path, props.node.kind);
                        } }
                    >
                        <Pencil size={ 13 } />
                    </button>
                    <button
                        type="button"
                        class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center opacity-55 hover:opacity-100"
                        title="Duplicate"
                        aria-label={ `Duplicate ${ props.node.name }` }
                        onClick={ (e) => {
                            e.stopPropagation();
                            props.actions.onDuplicate(props.node.path);
                        } }
                    >
                        <Copy size={ 13 } />
                    </button>
                    <button
                        type="button"
                        class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center text-error opacity-55 hover:opacity-100"
                        title="Delete"
                        aria-label={ `Delete ${ props.node.name }` }
                        onClick={ (e) => {
                            e.stopPropagation();
                            props.actions.onDelete(props.node.path, props.node.kind);
                        } }
                    >
                        <Trash2 size={ 13 } />
                    </button>
                </div>
            </div>
            <Show when={ props.node.kind === 'directory' && isOpen() }>
                <For each={ props.node.children ?? [] }>
                    {child => (
                        <TreeItem
                            node={ child }
                            depth={ props.depth + 1 }
                            selectedPath={ props.selectedPath }
                            expanded={ props.expanded }
                            onToggle={ props.onToggle }
                            onSelect={ props.onSelect }
                            actions={ props.actions }
                        />
                    )}
                </For>
            </Show>
        </div>
    );
};
