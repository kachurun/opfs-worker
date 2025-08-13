import type { Remote } from 'comlink';
import type { OPFSWorker } from './worker';

export type Kind = 'file' | 'directory';

export interface FileStat {
    kind: Kind;
    size: number;
    mtime: string; // ISO string
    ctime: string; // ISO string
    isFile: boolean;
    isDirectory: boolean;
    /** Hash of file content (only for files, undefined for directories) */
    hash?: string;
}

export interface DirentData {
    name: string;
    kind: 'file' | 'directory';
    isFile: boolean;
    isDirectory: boolean;
}

export interface WatchEvent {
    path: string;
    type: 'added' | 'changed' | 'removed';
    isDirectory: boolean;
    timestamp: string;
    hash?: string;
}

export type { OPFSWorker };
export type RemoteOPFSWorker = Remote<OPFSWorker>;
