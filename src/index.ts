export * from './types.js';
export * from './utils/errors.js';
export * from './utils/helpers.js';
export * from './utils/encoder.js';

export {
    BaseOPFS,
    OPFSFacade,
    OPFSSync,
    createOPFS,
    createOPFSDedicated,
} from './index.sync.js';

export type {
    DedicatedWorkerOptions,
    OPFSBackend,
} from './index.sync.js';

export {
    OPFSAsync,
    createOPFSAsync,
} from './index.async.js';

export {
    createOPFSShared,
} from './index.sharedworker.js';

export type {
    SharedWorkerOptions,
} from './index.sharedworker.js';

/**
 * @deprecated Use {@link createOPFSDedicated}. Kept for 1.x → 2.x migration.
 */
export { createOPFSDedicated as createWorker } from './index.sync.js';

/**
 * @deprecated Use {@link OPFSFacade}. Kept for 1.x → 2.x migration.
 */
export { OPFSFacade as OPFSFileSystem } from './index.sync.js';
