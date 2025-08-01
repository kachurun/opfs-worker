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

import WorkerCtor from './fs.worker?worker&inline';

import type { OPFSError } from './errors';
import type FSImpl from './fs.worker';

/**
 * Remote file system interface type
 */
export type FS = Remote<FSImpl>;

/**
 * Creates a new file system instance with inline worker
 * @returns Promise resolving to the file system interface
 * @throws OPFSNotSupportedError if OPFS is not supported
 */
export async function createWorker(): Promise<FS> {
    try {
        const fs = wrap<FSImpl>(new WorkerCtor()) as FS;

        return fs;
    }
    // Re-throw OPFS-specific errors
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error) {
            throw error as OPFSError;
        }

        throw new Error(`Failed to initialize OPFS: ${ error instanceof Error ? error.message : String(error) }`);
    }
}
