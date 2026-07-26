import { OPFSFacade } from './OPFSFacade';
import { OPFSAsync } from '../core/OPFSAsync';

import type { OPFSOptions } from '../types';

/**
 * Async mode: Node-like `fs` API over the promise-based File System API,
 * without any worker.
 *
 * Prefer importing from `opfs-worker/async` when you care about bundle size
 * (avoids the inlined dedicated worker). Importing from `opfs-worker` works too.
 *
 * Writing requires `FileSystemFileHandle.createWritable()` — Chrome, Firefox,
 * Safari 26+. File descriptors (`open`/`read`/`write`/...) are not supported
 * and throw `OperationNotSupportedError` — use `createOPFSDedicated` from `opfs-worker`
 * or `opfs-worker/sync` for positional I/O.
 */
export function createOPFSAsync(options?: OPFSOptions): OPFSFacade {
    const fs = new OPFSAsync(options);

    return new OPFSFacade({ fs, dispose: () => fs.dispose() }, options);
}
