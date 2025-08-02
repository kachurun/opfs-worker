/**
 * Main export for OPFS Worker library
 * 
 * This is the main entry point for the library, providing both the inline worker
 * functionality and all the necessary types and interfaces.
 * 
 * @example
 * ```typescript
 * import { createWorker, type OPFSWorker } from 'opfs-worker';
 * 
 * const fs = await createWorker();
 * await fs.mount('/my-app');
 * await fs.writeFile('/test.txt', 'Hello World');
 * ```
 */

import { wrap, type Remote } from 'comlink';

import WorkerCtor from './worker?worker&inline';

import type { OPFSWorker } from './types';

// Export all types
export * from './types';

// Export the worker class type
export type { OPFSWorker };

// Export the remote worker type
export type RemoteOPFSWorker = Remote<OPFSWorker>;

/**
 * Creates a new file system instance with inline worker
 * @returns Promise resolving to the file system interface
 */
export function createWorker(): RemoteOPFSWorker {
    return wrap<OPFSWorker>(new WorkerCtor());
}
