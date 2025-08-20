# Types

This document contains all TypeScript types and interfaces provided by OPFS Worker.

## Core Types

### `FileStat`

File or directory statistics.

```typescript
interface FileStat {
    kind: 'file' | 'directory';
    size: number;
    mtime: string; // ISO string
    ctime: string; // ISO string
    isFile: boolean;
    isDirectory: boolean;
    hash?: string; // Hash of file content (only for files)
}
```

**Properties:**

- `kind`: Type of the file system entry
- `size`: Size in bytes (0 for directories)
- `mtime`: Last modification time as ISO string
- `ctime`: Creation time as ISO string
- `isFile`: True if this is a file
- `isDirectory`: True if this is a directory
- `hash`: Optional hash of file content (only present for files when hashing is enabled)

### `DirentData`

Directory entry information.

```typescript
interface DirentData {
    name: string;
    kind: 'file' | 'directory';
    isFile: boolean;
    isDirectory: boolean;
}
```

**Properties:**

- `name`: Name of the file or directory
- `kind`: Type of the entry
- `isFile`: True if this is a file
- `isDirectory`: True if this is a directory

### `WatchOptions`

Options for file watching operations.

```typescript
interface WatchOptions {
    recursive?: boolean; // Whether to watch recursively (default: true)
    include?: string | string[]; // Glob patterns to include in watching (minimatch syntax, default: ['**'])
    exclude?: string | string[]; // Glob patterns to exclude from watching (minimatch syntax, default: [])
}
```

**Properties:**

- `recursive`: Whether to watch the entire directory tree (default: true)
- `include`: Glob patterns to include in watching (default: all files)
- `exclude`: Glob patterns to exclude from watching (default: none)

### `RemoteOPFSWorker`

Remote file system interface type for Comlink communication.

```typescript
type RemoteOPFSWorker = Remote<OPFSWorker>;
```

This type represents the remote interface when using the worker with Comlink.

## Configuration Types

### `OPFSOptions`

Configuration options for creating an OPFS Worker instance.

```typescript
interface OPFSOptions {
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
```

**Properties:**

- `root`: Root path for the file system
- `namespace`: Namespace for events and isolation
- `hashAlgorithm`: Hash algorithm to use for file hashing
- `maxFileSize`: Maximum file size for hashing operations
- `broadcastChannel`: Custom broadcast channel name or instance

## Event Types

### `WatchEvent`

File system change event sent via BroadcastChannel.

```typescript
interface WatchEvent {
    namespace: string;
    path: string;
    type: 'added' | 'changed' | 'removed';
    isDirectory: boolean;
    timestamp: string;
    hash?: string;
}
```

**Properties:**

- `namespace`: Event namespace for isolation
- `path`: Path of the changed file/directory
- `type`: Type of change (added, changed, removed)
- `isDirectory`: Whether the changed item is a directory
- `timestamp`: ISO timestamp of the change
- `hash`: Optional hash of the file content (if hashing is enabled)

## Utility Types

### `Kind`

File system entry type.

```typescript
type Kind = 'file' | 'directory';
```

### `Encoding`

Supported text encodings.

```typescript
type Encoding = 'utf-8' | 'utf-16le' | 'ascii' | 'latin1' | 'base64' | 'hex' | 'binary';
```

## Error Types

The library provides comprehensive error handling with specific error types:

- `OPFSError` - Base error class for all OPFS-related errors
- `OPFSNotSupportedError` - Thrown when OPFS is not supported in the browser
- `OPFSNotMountedError` - Thrown when OPFS is not mounted
- `PathError` - Thrown for invalid paths or path traversal attempts
- `FileNotFoundError` - Thrown when a requested file doesn't exist
- `DirectoryNotFoundError` - Thrown when a requested directory doesn't exist
- `PermissionError` - Thrown when permission is denied for an operation
- `StorageError` - Thrown when an operation fails due to insufficient storage
- `TimeoutError` - Thrown when an operation times out

Each error type extends the base `OPFSError` class and provides specific error codes and context information for better debugging.
