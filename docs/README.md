# Docs

New here? Start with [Choosing a mode](./choosing-a-mode.md).

## Guides

| Guide                                     | About                                              |
| ----------------------------------------- | -------------------------------------------------- |
| [Choosing a mode](./choosing-a-mode.md)   | Which entry / backend to pick                      |
| [Dedicated worker](./guides/dedicated.md) | Default path + DIY worker script                   |
| [Async (no worker)](./guides/async.md)    | `createOPFSAsync` on the current thread            |
| [SharedWorker](./guides/sharedworker.md)  | One fs shared by all tabs                          |
| [Pure classes](./guides/pure.md)          | Drop `OPFSSync` / `OPFSAsync` into your own worker |
| [Streaming](./guides/streaming.md)        | Large files with `importStream`                    |
| [Watching](./guides/watching.md)          | Change events over `BroadcastChannel`              |
| [Hashing](./guides/hashing.md)            | etag vs SHA                                        |

## API

| Page                                      | About                                 |
| ----------------------------------------- | ------------------------------------- |
| [Create helpers](./api/create.md)         | `createOPFS*` + **options table**     |
| [Facade](./api/facade.md)                 | Node-like methods and aliases         |
| [Backend](./api/backend.md)               | `BaseOPFS` / `OPFSSync` / `OPFSAsync` |
| [File descriptors](./file-descriptors.md) | `open` / `read` / `write` / …         |
| [Types](./types.md)                       | Types and errors                      |

## Migration

[1.x → 2.x](./migration.md)
