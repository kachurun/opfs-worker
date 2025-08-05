import { wrap, proxy } from 'comlink';

import WorkerCtor from './worker?worker&inline';

import type { OPFSWorker, RemoteOPFSWorker, WatchEvent } from './types';

export * from './types';
export * from './utils/errors';
export * from './utils/helpers';
export * from './utils/encoder';

/**
 * Creates a new file system instance with inline worker
 * @param watchCallback - Optional callback for file change events
 * @param watchOptions - Optional configuration for watching
 * @returns Promise resolving to the file system interface
 */
export function createWorker(
    watchCallback?: (event: WatchEvent) => void,
    watchOptions?: { watchInterval?: number }
): RemoteOPFSWorker {
    const wrapped = wrap<OPFSWorker>(new WorkerCtor());
    
    // Set up watch callback if provided
    if (watchCallback) {
        wrapped.setWatchCallback(proxy(watchCallback), watchOptions);
    }
    
    return wrapped;
}
