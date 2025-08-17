import type { OPFSWorker } from './worker';
import type { Remote } from 'comlink';

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
    root: string;
    path: string;
    type: 'added' | 'changed' | 'removed';
    isDirectory: boolean;
    timestamp: string;
    hash?: string;
}

export type { OPFSWorker };
export type RemoteOPFSWorker = Remote<OPFSWorker>;

export interface OPFSOptions {
    /** Root path for the file system (default: '/') */
    root?: string;
    /** Polling interval in milliseconds for file watching (default: 1000) */
    watchInterval?: number;
    /** Hash algorithm for file hashing, or null to disable (default: null) */
    hashAlgorithm?: null | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
    /** Maximum file size in bytes for hashing (default: 50MB) */
    maxFileSize?: number;
    /** Custom name for the broadcast channel (default: 'opfs-worker') */
    broadcastChannel?: string | null;
}

export interface WatchOptions {
    /** Whether to watch recursively (default: true) */
    recursive?: boolean;
    /** Glob patterns to exclude from watching (minimatch syntax) */
    exclude?: string | string[];
}
