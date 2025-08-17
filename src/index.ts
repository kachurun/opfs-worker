import { wrap } from 'comlink';

import WorkerCtor from './worker?worker&inline';
// import SharedWorkerCtor from './worker?sharedworker&inline';

import type { OPFSOptions, OPFSWorker, RemoteOPFSWorker } from './types';

export * from './types';
export * from './utils/errors';
export * from './utils/helpers';
export * from './utils/encoder';

/**
 * Creates a new file system instance with inline worker
 * @param options - Optional configuration options
 * @returns Promise resolving to the file system interface
 */
export async function createWorker(
    options?: OPFSOptions
): Promise<RemoteOPFSWorker> {
    const wrapped = wrap<OPFSWorker>(new WorkerCtor());

    // Set up options if provided
    if (options) {
        // We can't pass a BroadcastChannel instance to the worker, so we need to convert it to a string first
        if (options.broadcastChannel && options.broadcastChannel instanceof BroadcastChannel) {
            options.broadcastChannel = options.broadcastChannel.name;
        }

        await wrapped.setOptions(options);
    }

    return wrapped;
}

// /**
//  * Creates a new file system instance with shared worker
//  * This allows multiple tabs/windows to share the same OPFS instance
//  * @param options - Optional configuration options
//  * @param workerName - Optional name for the shared worker (default: 'opfs-shared-worker')
//  * @returns Promise resolving to the file system interface
//  * @throws {Error} If SharedWorker is not supported in the current browser
//  */
// export function createSharedWorker(
//     options?: OPFSOptions,
//     workerName: string = 'opfs-shared-worker'
// ): RemoteOPFSWorker {
//     const sharedWorker = new SharedWorkerCtor({
//         name: workerName
//     });

//     const wrapped = wrap<OPFSWorker>(sharedWorker.port);

//     // Set up options if provided
//     if (options) {
//         wrapped.setOptions(options);
//     }

//     return wrapped;
// }
