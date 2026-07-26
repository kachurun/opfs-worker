import { basename, dirname, joinParent } from '../../lib/path';

import type { TreeNode } from '../../lib/fs';

export function countTree(nodes: TreeNode[]): { files: number; folders: number } {
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
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
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

export function collectDirPaths(nodes: TreeNode[], into = new Set<string>()): Set<string> {
    for (const node of nodes) {
        if (node.kind === 'directory') {
            into.add(node.path);
            collectDirPaths(node.children ?? [], into);
        }
    }

    return into;
}

export function duplicateName(path: string): string {
    const name = basename(path);
    const dot = name.lastIndexOf('.');

    if (dot <= 0) {
        return `${ path }.copy`;
    }

    return joinParent(dirname(path), `${ name.slice(0, dot) }.copy${ name.slice(dot) }`);
}
