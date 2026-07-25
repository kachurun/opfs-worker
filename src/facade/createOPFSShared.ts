import { OPFSFacade } from './OPFSFacade';
import { createSharedWorker } from '../worker/createSharedWorker';

import type { SharedWorkerOptions } from '../worker/createSharedWorker';

/**
 * Shared mode: Node-like `fs` API over a SharedWorker running one `OPFSAsync`
 * instance for every tab — writes are serialized across tabs by per-path locks,
 * watch events reach all tabs via `BroadcastChannel`.
 *
 * Uses the async backend (sync access handles are unavailable in SharedWorker):
 * writing requires `createWritable()` (Chrome, Firefox, Safari 26+), and file
 * descriptors throw `OperationNotSupportedError`.
 *
 * For the raw Comlink proxy without the facade, use {@link createSharedWorker}.
 *
 * @example
 * ```typescript
 * // Vite: pass the worker url explicitly
 * import workerUrl from 'opfs-worker/shared.worker.js?url';
 * import { createOPFSShared } from 'opfs-worker/sharedworker';
 *
 * const fs = createOPFSShared({ root: '/my-app', url: workerUrl });
 * ```
 */
export function createOPFSShared(options?: SharedWorkerOptions): OPFSFacade {
    const { fs, dispose } = createSharedWorker(options);

    return new OPFSFacade({ fs, dispose });
}
