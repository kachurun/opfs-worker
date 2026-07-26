export const TREE_DRAG_TYPE = 'application/x-opfs-tree-item';

export interface TreeDragItem {
    path: string;
    kind: 'file' | 'directory';
}

export function readTreeDrag(dataTransfer: DataTransfer): TreeDragItem | null {
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
