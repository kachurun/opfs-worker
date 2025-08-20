import { OPFSFileSystem } from './facade';

import type { OPFSOptions } from './types';

export * from './types';
export * from './utils/errors';
export * from './utils/helpers';
export * from './utils/encoder';
export { OPFSFileSystem as OPFSFacade } from './facade';

/**
 * Creates a new file system instance with inline worker
 * @param options - Optional configuration options
 * @returns Promise resolving to the file system interface
 */
export function createWorker(
    options?: OPFSOptions
): OPFSFileSystem {
    return new OPFSFileSystem(options);
}
