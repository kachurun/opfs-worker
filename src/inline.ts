/**
 * Inline worker export for factory-based worker creation
 * 
 * This export provides a factory function that creates worker instances with Comlink wrapping.
 * Use this when you want a simple, ready-to-use file system interface.
 * 
 * @example
 * ```typescript
 * import { createWorker } from 'opfs-worker/inline-worker';
 * 
 * const fs = await createWorker();
 * await fs.writeFile('/test.txt', 'Hello World');
 * ```
 */

import { wrap, type Remote } from 'comlink';

import WorkerCtor from './opfs.worker?worker&inline';

import type { OPFSWorker } from './types';

export * from './types';

export type RemoteOPFSWorker = Remote<OPFSWorker>;

/**
 * Creates a new file system instance with inline worker
 * @returns Promise resolving to the file system interface
 */
export async function createWorker(): Promise<RemoteOPFSWorker> {
    return wrap<OPFSWorker>(new WorkerCtor());
}
