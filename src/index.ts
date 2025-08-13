import { wrap, proxy } from 'comlink';

import WorkerCtor from './worker?worker&inline';

import type { OPFSWorker, RemoteOPFSWorker, WatchEvent, OPFSOptions } from './types';

export * from './types';
export * from './utils/errors';
export * from './utils/helpers';
export * from './utils/encoder';

/**
 * Creates a new file system instance with inline worker
 * @param watchCallback - Optional callback for file change events
 * @param options - Optional configuration options
 * @returns Promise resolving to the file system interface
 */
export function createWorker(
    watchCallback?: (event: WatchEvent) => void,
    options?: OPFSOptions
): RemoteOPFSWorker {
    const wrapped = wrap<OPFSWorker>(new WorkerCtor());
    
    // Set up watch callback and options if provided
    if (watchCallback) {
        wrapped.setWatchCallback(
            watchCallback ? proxy(watchCallback) : () => {}, 
        );
    }
    
    if (options) {
        wrapped.setOptions(options);
    }
    
    return wrapped;
}
