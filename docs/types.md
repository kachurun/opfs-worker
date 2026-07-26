# Types

## `FileStat`

```typescript
interface FileStat {
    kind: 'file' | 'directory';
    size: number;
    mtime: string; // ISO
    ctime: string; // ISO
    isFile: boolean;
    isDirectory: boolean;
    hash?: string; // files only, when hashing is enabled
}
```

`size` is `0` for directories.

## `DirentData`

```typescript
interface DirentData {
    name: string;
    kind: 'file' | 'directory';
    isFile: boolean;
    isDirectory: boolean;
}
```

## `WatchOptions`

```typescript
interface WatchOptions {
    recursive?: boolean; // default: true
    include?: string | string[]; // minimatch, default: ['**']
    exclude?: string | string[]; // minimatch, default: []
}
```

## `WatchListener`

```typescript
type WatchListener = (event: WatchEvent) => void;
```

Used by the facade: `fs.watch(path, listener)` or `fs.watch(path, options, listener)`.

## `ImportFileData`

Payload for one entry in a `[path, data]` pair:

```typescript
type ImportFileData = string | Uint8Array | Blob | FileSystemFileHandle;
```

## `ImportFilesSource`

What `importFiles` accepts:

```typescript
type ImportFilesSource =
    | Iterable<[PathLike, ImportFileData]>
    | Map<string, ImportFileData>
    | FileSystemDirectoryHandle              // walked recursively
    | FileSystemFileHandle                   // path from handle.name
    | Iterable<FileSystemFileHandle>;        // same, for showOpenFilePicker({ multiple: true })
```

Directory / file-handle lists use `{ prefix }` on the facade (default `'/'`) — see [streaming](./guides/streaming.md) and [uploading from disk](./guides/uploading.md).

## `ImportStreamProgress`

Fired by `importStream` / `onProgress` for each chunk written:

```typescript
interface ImportStreamProgress {
    path: string;
    bytesWritten: number;
    bytesTotal?: number; // set for Blob / File; omitted for raw ReadableStream
}
```

## `ImportFilesProgress`

Fired by `importFiles` / `onProgress` for each chunk written:

```typescript
interface ImportFilesProgress {
    path: string;            // file currently being written
    index: number;           // 0-based
    count: number;           // total entries
    bytesWritten: number;    // within current file
    bytesTotal: number;      // size of current file
    totalBytesWritten: number;
    totalBytes: number;      // sum of all entry sizes
}
```

## `ImportFilesResult`

Returned when `importFiles` finishes:

```typescript
interface ImportFilesResult {
    paths: string[];      // written paths, in order
    count: number;        // paths.length
    bytesWritten: number; // total bytes across all files
}
```

## `OPFSApi`

Public bytes API shared by all backends — the public methods of `BaseOPFS` (subclasses `OPFSSync` / `OPFSAsync`, or a Comlink proxy). What `OPFSFacade` talks to via `fs.backend`.

```typescript
type OPFSApi = Pick<BaseOPFS, keyof BaseOPFS>;
```

## `PathLike`

```typescript
type PathLike = string | URL;
```

## `FileOpenOptions`

```typescript
interface FileOpenOptions {
    create?: boolean;
    exclusive?: boolean;
    truncate?: boolean;
}
```

## `OPFSOptions`

```typescript
interface OPFSOptions {
    /** Root path (default: '/') */
    root?: string;
    /** Event namespace (default: 'opfs-worker:${root}') */
    namespace?: string;
    /** Hash algorithm, or false/null to disable (default: 'etag') */
    hashAlgorithm?: null | false | 'etag' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
    /** Max bytes for SHA-* hashing (default: 50MB); ignored by 'etag' */
    maxFileSize?: number;
    /** Broadcast channel name or instance (default: 'opfs-worker') */
    broadcastChannel?: string | BroadcastChannel | null;
}
```

Defaults and behavior: [API → Options](./api/README.md#options).

## `WatchEventType`

```typescript
enum WatchEventType {
    Added = 'added',
    Changed = 'changed',
    Removed = 'removed'
}
```

## `WatchEvent`

```typescript
interface WatchEvent {
    namespace: string;
    path: string;
    type: WatchEventType;
    isDirectory: boolean;
    timestamp: string;
    hash?: string;
}
```

## Utility types

```typescript
type Kind = 'file' | 'directory';
type Encoding = 'utf-8' | 'utf-16le' | 'ascii' | 'latin1' | 'base64' | 'hex' | 'binary';
```

## Errors

Node.js SystemError-compatible. Base class: `OPFSError` (`errno`, `syscall?`, `path?`, `cause?`).

| Class                        |                                                                     |
| ---------------------------- | ------------------------------------------------------------------- |
| `OPFSNotSupportedError`      | OPFS missing in the browser                                         |
| `PathError`                  | Bad path / traversal                                                |
| `ExistenceError`             | Missing entry — `new ExistenceError(msg, 'ENOENT', path)`           |
| `PermissionError`            | Access denied                                                       |
| `StorageError`               | Quota / storage full                                                |
| `TimeoutError`               | Timed out                                                           |
| `FileBusyError`              | Locked / busy                                                       |
| `FileTypeError`              | File vs directory mismatch — `new FileTypeError('directory', path)` |
| `ValidationError`            | Bad args — `new ValidationError(msg, 'EINVAL', path)`               |
| `OperationAbortedError`      | Aborted                                                             |
| `IOError`                    | I/O failure                                                         |
| `OperationNotSupportedError` | Not supported (e.g. FDs on async)                                   |
| `DirectoryOperationError`    | Dir op failed — `new DirectoryOperationError('RM_FAILED', path)`    |
| `InitializationFailedError`  | Init failed                                                         |
| `FileSystemOperationError`   | Generic FS failure                                                  |
| `PathResolutionFailedError`  | Path resolve failed                                                 |
| `AlreadyExistsError`         | Already exists                                                      |

### errno

| Code        | errno |                           |
| ----------- | ----- | ------------------------- |
| `ENOENT`    | -2    | No such file or directory |
| `EISDIR`    | -21   | Is a directory            |
| `ENOTDIR`   | -20   | Not a directory           |
| `EACCES`    | -13   | Permission denied         |
| `EEXIST`    | -17   | File exists               |
| `ENOTEMPTY` | -39   | Directory not empty       |
| `EINVAL`    | -22   | Invalid argument          |
| `EIO`       | -5    | I/O error                 |
| `ENOSPC`    | -28   | No space left             |
| `EBUSY`     | -16   | Busy                      |
| `EINTR`     | -4    | Interrupted               |
| `ENOTSUP`   | -95   | Not supported             |
| `ERANGE`    | -34   | Result too large          |
| `EBADF`     | -9    | Bad file descriptor       |
