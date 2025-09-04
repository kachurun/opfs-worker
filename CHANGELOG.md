# opfs-worker

## 1.2.4

### Patch Changes

-   Simple etag "hash" algorithm

## 1.2.3

### Patch Changes

-   isomorphic-git compability

## 1.2.2

### Patch Changes

-   sync -> createIndex

## 1.2.1

### Patch Changes

-   Accept URI as path

## 1.2.0

### Minor Changes

-   Low-level api (open/read/write/close)

## 1.1.0

### Minor Changes

-   Add file descriptor API

## 1.0.1

### Patch Changes

-   Fix throw in exist()

## 1.0.0

### Major Changes

-   Stable API release

## 0.5.1

### Patch Changes

-   Add binary file extension detection and improve encoding handling

## 0.5.0

### Minor Changes

-   New watching mechanism

## 0.4.3

### Patch Changes

-   Add locks for file operations

## 0.4.2

### Patch Changes

-   Excludes support for watches

## 0.4.1

### Patch Changes

-   Optional recursive flag for watch

## 0.4.0

### Breaking Changes

-   **BREAKING**: Moved `rootPath` from class property to `OPFSOptions.root`
-   **BREAKING**: `mount()` method is now private and no longer accessible
-   **BREAKING**: `setOptions()` is now async and automatically remounts when root changes
-   **BREAKING**: File system now auto-mounts to the configured root path

### Changes

-   Root path is now configured through options instead of manual mounting
-   All file operations automatically mount to the configured root when needed
-   Improved isolation and separation of file system instances
-   Simplified API - no need to call mount() manually

## 0.3.3

### Patch Changes

-   Fix deps

## 0.3.2

### Patch Changes

-   Add root property to change event

## 0.3.1

### Patch Changes

-   Refactor readDir

## 0.3.0

### Minor Changes

-   Broadcast channel instead of watchCallback

## 0.2.6

### Patch Changes

-   Add maxFileSize option for file hashing

## 0.2.5

### Patch Changes

-   Refactor file change events and add hash support to watch event

## 0.2.4

### Patch Changes

-   Notify about internal changes

## 0.2.3

### Patch Changes

-   Fix watch for root folder

## 0.2.2

### Patch Changes

-   Fix broken types export

## 0.2.1

### Patch Changes

-   Export helpers

## 0.2.0

### Minor Changes

-   8d6cc63: add watch/unwatch API with polling-based file system watching

### Patch Changes

-   Watch mode / Copy filter

## 0.1.2

### Patch Changes

-   Chore: new demo page

## 0.1.1

### Patch Changes

-   Initial release
