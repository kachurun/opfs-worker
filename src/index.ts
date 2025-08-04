import { wrap } from 'comlink';

import WorkerCtor from './worker?worker&inline';

import type { OPFSWorker, RemoteOPFSWorker } from './types';

export * from './types';
export * from './utils/errors';
export * from './utils/helpers';
export * from './utils/encoder';

/**
 * Creates a new file system instance with inline worker
 * @returns Promise resolving to the file system interface
 */
export function createWorker(): RemoteOPFSWorker {
    return wrap<OPFSWorker>(new WorkerCtor());
}
