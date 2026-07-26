import { OPFSFacade } from './OPFSFacade';
import { createDedicatedWorker } from '../worker/createDedicatedWorker';

import type { DedicatedWorkerOptions } from '../worker/createDedicatedWorker';

/**
 * Dedicated mode: start a dedicated worker and get a Node-like `fs` API
 * backed by `OPFSSync`.
 *
 * Prefer importing from `opfs-worker/sync` when you only need the worker backend
 * (avoids pulling `OPFSAsync` into the graph). Importing from `opfs-worker` works too.
 *
 * By default uses an inlined worker. Calls with the same `root` (and same `url`)
 * reuse one Worker on this page; different roots get different Workers.
 * Pass `url` / `worker` to load `opfs-worker/dedicated.worker.js` instead
 * (see {@link DedicatedWorkerOptions}).
 *
 * Need the raw bytes API or the Worker instance? Use `fs.backend` / `fs.worker`.
 * For the workerless async backend, use {@link createOPFSAsync}.
 */
export function createOPFSDedicated(options?: DedicatedWorkerOptions): OPFSFacade {
    const { fs, worker, dispose } = createDedicatedWorker(options);

    return new OPFSFacade({ fs, worker, dispose });
}
