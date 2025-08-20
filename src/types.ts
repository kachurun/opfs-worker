import type { OPFSWorker } from './worker';
import type { Remote } from 'comlink';

export type Kind = 'file' | 'directory';

export type Encoding = 'ascii'
  | 'utf8'
  | 'utf-8'
  | 'utf16le'
  | 'utf-16le'
  | 'ucs2'
  | 'ucs-2'
  | 'base64'
  | 'latin1'
  | 'hex'
  | 'binary';

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
    namespace: string;
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
    /** Namespace for the events (default: 'opfs-worker:${root}') */
    namespace?: string;
    /** Hash algorithm for file hashing, or null to disable (default: null) */
    hashAlgorithm?: null | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
    /** Maximum file size in bytes for hashing (default: 50MB) */
    maxFileSize?: number;
    /** Custom name for the broadcast channel (default: 'opfs-worker') */
    broadcastChannel?: string | BroadcastChannel | null;
}

export interface RenameOptions {
    /** Whether to overwrite existing files (default: false) */
    overwrite?: boolean;
}

export interface WatchOptions {
    /** Whether to watch recursively (default: true) */
    recursive?: boolean;
    /** Glob patterns to include in watching (minimatch syntax, default: ['**']) */
    include?: string | string[];
    /** Glob patterns to exclude from watching (minimatch syntax, default: []) */
    exclude?: string | string[];
}

export interface FileOpenOptions {
    create?: boolean;
    exclusive?: boolean;
    truncate?: boolean;
}

export interface WatchSnapshot {
    pattern: string;
    include: string[];
    exclude: string[];
}
