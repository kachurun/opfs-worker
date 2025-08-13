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
 * @param options - Optional configuration options
 * @param options.watchInterval - Polling interval in milliseconds for file watching
 * @param options.hashAlgorithm - Hash algorithm for file hashing
 * @returns Promise resolving to the file system interface
 */
export function createWorker(
    watchCallback?: (event: WatchEvent) => void,
    options?: { 
        watchInterval?: number;
        hashAlgorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
    }
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
