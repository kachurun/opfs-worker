# opfs-worker 2.3.0 (planned as 2.2.2): concurrency and watch fixes

> Keep this plan current during implementation.
> Check a stage only after its done-when and verification pass.
> Record scope changes before leaving the stage.

Full brief: see the original request (eclipse-theia/theia#18213, #18215).
Branch: `fix/2.2.2-concurrency-watch`.

## Stage 1: Concurrent opens of one file share a single handle

- [x] Complete
  - [x] Concurrent `open()` calls reuse one handle (with and without readFile/writeFile in parallel)
  - [x] Pending opens coalesced per path (`pendingHandles`)
  - [x] An open resuming after the handle closed re-checks and opens again (loop in `_acquireSharedHandle`)
  - [x] On failure, pending entry removed and every waiter gets the error
  - [x] `truncate` keeps its behaviour
  - [x] `NoModificationAllowedError` → `EBUSY`
  - [x] Tests (each fails before the fix, except the failure/recovery test)

Scope notes:
- The 20-round test only reproduces the race when the descriptor reader holds the fd
  across event-loop turns (stream-like reads). The reader yields one turn per chunk.
- Added: a waiter with `create: true` retries when the in-flight creation was started
  without `create` and failed, so it does not inherit a spurious ENOENT. Test added.
- `bun run lint` fails on `main` with 4 pre-existing errors (OPFSSync.ts:254,
  OPFSFacade.ts:371, createDedicatedWorker.ts:9,139), and `--fix` rewrites unrelated files.
  Fixed in a separate chore commit so stage 5's "lint passes" holds.
- Review: `NoModificationAllowedError` also comes from `removeEntry()` (locked file) and
  `createWritable()` (OPFSAsync), so those now report EBUSY instead of RM_FAILED/EIO. Note in PR.

## Stage 2: The facade and the worker agree on the default namespace

- [x] Complete — shared `defaultNamespace()` in internal `src/utils/namespace.ts`
  (not `helpers.ts`: that module is re-exported publicly). Test with `root: 'nested'`.

## Stage 3: A listener is called once per change

- [x] Complete — `Set` of matching listeners in `#onMessage`.

Scope notes:
- Theia's file watches pass `{ recursive: false }`; tests do the same. `watch(file)` with the
  default `recursive: true` never matches the file itself (`file/**`) — follow-up, not fixed.
- Theia #18215 passes a new arrow function per `watch()` call, so identity dedup only helps
  once Theia registers one stable listener. Noted in the PR.

## Stage 4: The SharedWorker default URL points to built JavaScript (optional)

- [x] Complete — `/* @vite-ignore */`; no `data:video/mp2t` in dist; ES and CJS chunks
  resolve `./shared.worker.js` next to the chunk. Docs unchanged (still accurate).
  Demo passes `url` explicitly, so it doesn't exercise the default; not run.

## Stage 6: Descriptors hold the path lock from open() to close() (added 2026-11-02)

Scope change: the maintainer promised on eclipse-theia/theia#18215 to "lock the descriptor
operations (open … close) per path", and daviwil asked that it also catch (1) concurrent
first opens and (2) a read through a second descriptor seeing a write's truncate mid-write.
This reverses the original "do not serialize descriptors" decision. The Web Lock is still not
taken in the internal open path (`_openInLock`), so no reentrancy deadlock.

- [x] Complete
  - [x] Public `open()` holds the path Web Lock until the group's last `close()`
  - [x] Non-truncating opens share (join) the lock; truncating opens get it to themselves
  - [x] `exclusive` creates atomic (`exclusiveCreates` chain)
  - [x] Tests mirror Theia's spec (6 fail before), docs + changeset updated, PR body updated

## Stage 5: Release 2.3.0 (minor: descriptor lock changes behaviour)

- [x] Complete
  - [x] Changeset (patch): `.changeset/concurrent-open-watch-fixes.md`
  - [x] test / lint / build pass
  - [x] PR opened: https://github.com/kachurun/opfs-worker/pull/20
  - [x] Merge to main → changesets release PR → `npm view opfs-worker version` shows 2.3.0 (maintainer)
