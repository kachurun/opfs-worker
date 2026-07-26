import type { BaseOPFS } from './core/BaseOPFS';
import type { OPFSSync } from './core/OPFSSync';

/**
 * Type for paths that can be either a string or URI
 */
export type PathLike = string | URL;

export type Kind = 'file' | 'directory';

export type StringEncoding = 'ascii'
  | 'utf8'
  | 'utf-8'
  | 'utf16le'
  | 'utf-16le'
  | 'ucs2'
  | 'ucs-2'
  | 'base64'
  | 'latin1'
  | 'hex';

export type BinaryEncoding = 'binary';

export type Encoding = StringEncoding | BinaryEncoding;

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

export enum WatchEventType {
    Added = 'added',
    Changed = 'changed',
    Removed = 'removed'
}

export interface WatchEvent {
    namespace: string;
    path: string;
    type: WatchEventType;
    isDirectory: boolean;
    timestamp: string;
    hash?: string;
}

export type { OPFSSync };

/**
 * Public bytes API shared by all backends (`OPFSSync`, `OPFSAsync`, or a
 * Comlink proxy to one of them). Declared on {@link BaseOPFS}; subclasses
 * implement the abstract I/O and FD methods.
 */
export type OPFSApi = Pick<BaseOPFS, keyof BaseOPFS>;

export interface OPFSOptions {
    /** Root path for the file system (default: '/') */
    root?: string;
    /** Namespace for the events (default: 'opfs-worker:${root}') */
    namespace?: string;
    /** Hash algorithm for file hashing, or false/null to disable (default: 'etag') */
    hashAlgorithm?: null | false | 'etag' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
    /** Maximum file size in bytes for hashing (default: 50MB) */
    maxFileSize?: number;
    /** Custom name for the broadcast channel (default: 'opfs-worker') */
    broadcastChannel?: string | BroadcastChannel | null;
}

/** Payload accepted by {@link importFiles} for a single entry. */
export type ImportFileData = string | Uint8Array | Blob;

/**
 * Entries for {@link importFiles}: an array of `[path, data]` tuples, a `Map`,
 * or any iterable that yields the same pairs.
 */
export type ImportFilesEntries = Iterable<[string, ImportFileData]> | Map<string, ImportFileData>;

/** Progress event fired while {@link importFiles} writes entries. */
export interface ImportFilesProgress {
    /** Path of the file currently being written */
    path: string;
    /** 0-based index of the current file */
    index: number;
    /** Total number of entries in this import */
    count: number;
    /** Bytes written for the current file so far */
    bytesWritten: number;
    /** Size of the current file in bytes */
    bytesTotal: number;
    /** Bytes written across all files so far */
    totalBytesWritten: number;
    /** Sum of all entry sizes in bytes */
    totalBytes: number;
}

/** Result of a finished {@link importFiles} call. */
export interface ImportFilesResult {
    /** Paths written, in import order */
    paths: string[];
    /** Number of files imported (`paths.length`) */
    count: number;
    /** Total bytes written across all files */
    bytesWritten: number;
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
