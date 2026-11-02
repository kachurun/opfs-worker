# AGENTS.md

Larger than a quick fix: follow @BRIEFBACK.md.

Notes for coding agents working on `opfs-worker`: a Node.js-style `fs` API over the browser's Origin Private File System (OPFS). User docs live in `docs/`; this file covers what the code and docs don't make obvious.

## Commands

The package manager is Bun.

| Task                  | Command                                     |
| --------------------- | ------------------------------------------- |
| Tests (vitest, Node)  | `bun run test`                              |
| One test file / name  | `bunx vitest --run test/<file> -t "<name>"` |
| Type-check            | `bun run type-check`                        |
| Lint                  | `npx eslint src --ext .ts,.tsx --quiet`     |
| Build (lib + workers + types) | `bun run build`                     |
| Demo app              | `bun run dev:demo`                          |

- **`bun run lint` runs `eslint --fix`.** It rewrites files, so run plain `npx eslint …` to check, and review the diff if you do use `--fix`. Only `src/` is linted, not `test/`.
- **CI only builds.** The Publish workflow runs `bun run build` and nothing else. Run the tests, type-check and lint yourself before you commit.

## Layout

- **`src/core/BaseOPFS.ts`:** shared logic (directories, stat, rename/copy/remove, import, watch events, path locks). `OPFSApi` (`src/types.ts`) is `Pick<BaseOPFS, keyof BaseOPFS>`, so every public method on `BaseOPFS` is part of the API the facade and Comlink proxies use.
- **`src/core/OPFSSync.ts`:** byte I/O through `FileSystemSyncAccessHandle`. It only works in a dedicated worker, and it is the only backend with file descriptors.
- **`src/core/OPFSAsync.ts`:** the promise-based backend (`createWritable`), used on the main thread or in a SharedWorker. It has no descriptors; those methods throw `ENOTSUP`.
- **`src/facade/OPFSFacade.ts`:** the user-facing API. It adds encodings, string/binary detection and `watch()` listeners (BroadcastChannel, filtered by namespace and minimatch) on top of any backend.
- **`src/worker/`:** worker entries and factories. `createDedicatedWorker` pools one Worker per `root` (plus `url`) per page; the worker accepts extra ports through `{ type: 'opfs-connect' }`.
- **Entry points:** `src/index*.ts` map to the `exports` in `package.json` (`.`, `/pure`, `/sync`, `/async`, `/sharedworker`, plus the prebuilt `dedicated.worker.js` and `shared.worker.js`).

## Public API surface

- **Re-exported modules:** every entry point does `export *` from `utils/types`, `utils/errors`, `utils/helpers` and `utils/encoder`. Anything exported from those modules is public. Put internal helpers in a separate module (like `src/utils/namespace.ts`).
- **Deprecated aliases** are still exported for 1.x migration: `createWorker` and `OPFSFileSystem`.
- **Releases** use changesets. Add `.changeset/<name>.md` by hand (`bun run changelog` is interactive). A behaviour change that can make existing code wait or fail needs `minor` even if no signatures change.

## Concurrency model (read this before touching `OPFSSync`)

OPFS allows **one sync access handle per file**. A second `createSyncAccessHandle()` throws `NoModificationAllowedError`, which `mapDomError` turns into `EBUSY`.

- **Path lock:** `withPathLock` / `withLock` (`src/utils/helpers.ts`) take an exclusive Web Lock named `opfs:<root + path>`. It works across tabs and workers. `readFile`, `writeFile`, `appendFile`, `writeStream` and `rm` take it.
- **Web Locks aren't reentrant.** Code that already holds the path lock must not call public `open()`, which takes the same lock and would deadlock. Inside the lock, use `_openInLock()`.
- **Descriptors hold the path lock from `open()` until their last `close()`:**
  - Opens without `truncate` join the lock already held or requested on the path in the same instance (`sharedLocks`), so nested and concurrent opens don't deadlock.
  - An open with `truncate` gets the lock to itself.
  - `exclusive` creates run one at a time on the lock (`exclusiveCreates`).
- **Handle sharing:** descriptors on one path share a single `SharedHandle` (ref-counted, each with its own cursor). Concurrent creation is coalesced in `pendingHandles`. This is still needed alongside the lock, because joined descriptors open concurrently and nothing orders opens when `navigator.locks` is missing.
- **Order in `close()`:** close the sync handle first, then release the lock, so the next lock holder can create its own handle.
- **A descriptor that is never closed blocks its path** until `close()` or `dispose()`. This is by design and documented in `docs/api/file-descriptors.md`.

## Watch events

- **Who emits:** the backends post every mutation on a BroadcastChannel (`notifyChange`). The facade filters events by `namespace`, path pattern, include and exclude.
- **Default namespace:** `opfs-worker:<normalized root>`, built by `defaultNamespace()` on both the worker and facade side. Keep the two in sync, or listeners silently get nothing.
- **Listeners:** each listener is called once per event, even when several of its watches match.
- **Patterns:** `watch(path)` defaults to `recursive: true`, which builds the pattern `path/**`. That pattern does not match `path` itself, so watch a single file with `{ recursive: false }`.

## Build gotchas

- **Lib build:** `vite.config.ts` builds the library. The dedicated worker is inlined with `import … from './dedicated.worker?worker&inline'`.
- **Worker builds:** `vite.worker.config.ts` builds each self-contained worker script separately (`OPFS_WORKER=…`). A multi-entry build would split chunks and break loading a worker from a single URL.
- **`new URL('./x.js', import.meta.url)` in `src/`:** Vite resolves it to the `.ts` source and inlines that as a `data:` URL. Add `/* @vite-ignore */` when the URL should point to a built file next to the chunk, as in `createSharedWorker`. After building, `grep -rl 'data:video/mp2t' dist/` must print nothing.

## Tests

- **Environment:** tests run in Node against a fake OPFS in `test/setup.ts`, backed by a temp directory (`globalThis.__OPFS_ROOT__`). The fake follows the browser where it matters:
  - it allows one sync handle per file and throws `NoModificationAllowedError` otherwise;
  - `createWritable` fails while a sync handle is open;
  - it mocks Web Locks (shared and exclusive, FIFO);
  - it mocks BroadcastChannel (delivers on `setTimeout(0)` to other instances with the same name).
- **Lock and channel mocks are global within a test file.** A test that leaves a descriptor open keeps its lock and hangs later tests on that path. `afterEach` calls `dispose()` before `clear('/')`; keep that order.
- **Races only show up across real event-loop turns.** The fake's async methods resolve fast, so concurrency tests must hold descriptors across turns (`setImmediate`), the way a stream reader does, or they pass without the fix. Check that a new concurrency test fails without your change.
- **Check behaviour, not private maps.** For example, see whether a second `OPFSSync` instance can read the path; `expectReleased` in `test/file-descriptors.test.ts` does this.
- **Facade tests** (`test/OPFSFacade.test.ts`) mock `createDedicatedWorker` and run an in-process `OPFSSync` behind the facade. Watch tests use a unique `broadcastChannel` or `namespace`, so events from other tests don't leak in.

## Code style

- **`src/`:** 4-space indent, single quotes, `${ x }` with spaces inside template expressions, `async()` without a space, and `catch` / `else` on their own line. Lint (`@flexbe/eslint-config`) enforces most of this, including parentheses when you mix `&&` with `?:`.
- **`test/`:** 2-space indent and not linted. Match the surrounding file.
- **Private members:** private helpers in `OPFSSync` start with `_`, and the facade uses `#private` fields.
- **Comments:** short ones that explain why. Keep JSDoc on public methods.
