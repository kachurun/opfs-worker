# Docs

- [API overview](./api/README.md) — entries, facade methods, options, trade-offs
- [File descriptors](./api/file-descriptors.md) — positional `open` / `read` / `write`
- [Types](./types.md)
- [Migration from 1.x](./migration.md)

## Guides

| Guide                                     | About                                                     |
| ----------------------------------------- | --------------------------------------------------------- |
| [Dedicated worker](./guides/dedicated.md) | How to use OPFS via a dedicated worker (the default path) |
| [Async](./guides/async.md)                | How to use OPFS on the main thread, without a worker      |
| [SharedWorker](./guides/sharedworker.md)  | How to share one filesystem across all tabs               |
| [Pure classes](./guides/pure.md)          | How to drop OPFS into a worker you already run            |
| [Streaming](./guides/streaming.md)        | How to handle large files and bulk uploads                |
| [Watching](./guides/watching.md)          | How to listen for file changes across tabs                |
| [Hashing](./guides/hashing.md)            | How file hashes / etags work on `stat` and watch events   |
