import type { OPFSFacade } from '../../../src';
import type { TreeNode } from '../../lib/fs';
import type { FileBrowserActions } from '../../store';

export interface FileBrowserProps {
    tree: TreeNode[];
    selectedPath: string | null;
    selectedKind: 'file' | 'directory' | null;
    onSelect: (path: string | null, kind: 'file' | 'directory' | null) => void;
    onRefresh: () => void;
    onLog: (kind: 'op' | 'error' | 'info', message: string, detail?: string) => void;
    fs: OPFSFacade;
    quota: { usage: number; quota: number } | null;
    registerActions: (actions: FileBrowserActions | null) => void;
}

export type UploadModal =
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

export interface RowActions {
    onRename: (path: string, kind: 'file' | 'directory') => void;
    onMove: (path: string, kind: 'file' | 'directory', directory: string) => void;
    onDuplicate: (path: string) => void;
    onDelete: (path: string, kind: 'file' | 'directory') => void;
}
