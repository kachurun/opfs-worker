import { wrap, proxy } from 'comlink';

import WorkerCtor from './worker?worker&inline';

import type { OPFSWorker, RemoteOPFSWorker, WatchEvent, OPFSOptions } from './types';

export * from './types';
export * from './utils/errors';
export * from './utils/helpers';
export * from './utils/encoder';

/**
 * Creates a new file system instance with inline worker
 * @param options - Optional configuration options
 * @returns Promise resolving to the file system interface
 */
export function createWorker(
    options?: OPFSOptions
): RemoteOPFSWorker {
    const wrapped = wrap<OPFSWorker>(new WorkerCtor());
    
    // Set up options if provided
    if (options) {
        wrapped.setOptions(options);
    }
    
    return wrapped;
}
