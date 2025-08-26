import type { OPFSWorker } from './worker';
import type { Remote } from 'comlink';

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

export interface WatchSnapshot {
    pattern: string;
    include: string[];
    exclude: string[];
}

export interface SearchInWorkspaceOptions {
    /**
     * The root path to search from. Defaults to '/'.
     */
    root?: string;
    /**
     * Maximum number of results to return.  Defaults to unlimited.
     */
    maxResults?: number;
    /**
     * Maximum number of results per file.
     */
    maxResultsPerFile?: number;
    /**
     * accepts suffixes of K, M or G which correspond to kilobytes,
     * megabytes and gigabytes, respectively. If no suffix is provided the input is
     * treated as bytes.
     *
     * defaults to '20M'
     */
    maxFileSize?: string;
    /**
     * Search case sensitively if true.
     */
    matchCase?: boolean;
    /**
     * Search whole words only if true.
     */
    matchWholeWord?: boolean;
    /**
     * Use regular expressions for search if true.
     */
    useRegExp?: boolean;
    /**
     * Use multiline anchors ^/$ per line if true.
     */
    multiline?: boolean;
    /**
     * Make dot match newlines if true.
     */
    dotAll?: boolean;
    /**
     * Include all .gitignored and hidden files.
     */
    includeIgnored?: boolean;
    /**
     * Glob pattern for matching files and directories to include the search. Empty array means everything
     */
    include?: string[];
    /**
     * Glob pattern for matching files and directories to exclude the search.
     */
    exclude?: string[];
}

export interface SearchInWorkspaceResult {
    /**
     * The string uri to the root folder that the search was performed.
     */
    root: string;

    /**
     * The string uri to the file containing the result.
     */
    fileUri: string;

    /**
     * matches found in the file
     */
    matches: SearchMatch[];
}

export interface SearchMatch {
    /**
     * The (1-based) line number of the result.
     */
    line: number;

    /**
     * The (1-based) character number in the result line.  For UTF-8 files,
     * one multi-byte character counts as one character.
     */
    character: number;

    /**
     * The length of the match, in characters.  For UTF-8 files, one
     * multi-byte character counts as one character.
     */
    length: number;

    /**
     * The text of the line containing the result.
     */
    lineText: string | LinePreview;

    /**
     * Optional absolute byte offset of match within file.
     */
    byteOffset?: number;
}

export interface LinePreview {
    text: string;
    character: number;
}

export interface SearchProgress {
    searchId: string;
    type: 'start' | 'result' | 'done' | 'error';
    data?: SearchInWorkspaceResult | string | Error;
}

export type { OPFSWorker };
export type RemoteOPFSWorker = Remote<OPFSWorker>;

export interface OPFSOptions {
    /** Root path for the file system (default: '/') */
    root?: string;
    /** Namespace for the events (default: 'opfs-worker:${root}') */
    namespace?: string;
    /** Hash algorithm for file hashing, or false/null to disable (default: null) */
    hashAlgorithm?: null | false | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
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
