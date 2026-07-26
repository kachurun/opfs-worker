export * from './types';
export * from './utils/errors';
export * from './utils/helpers';
export * from './utils/encoder';

export {
    BaseOPFS,
    OPFSFacade,
    OPFSSync,
    createOPFS,
    createOPFSDedicated,
} from './index.sync';

export type {
    DedicatedWorkerOptions,
    OPFSBackend,
} from './index.sync';

export {
    OPFSAsync,
    createOPFSAsync,
} from './index.async';

export {
    createOPFSShared,
} from './index.sharedworker';

export type {
    SharedWorkerOptions,
} from './index.sharedworker';

/**
 * @deprecated Use {@link createOPFSDedicated}. Kept for 1.x → 2.x migration.
 */
export { createOPFSDedicated as createWorker } from './index.sync';

/**
 * @deprecated Use {@link OPFSFacade}. Kept for 1.x → 2.x migration.
 */
export { OPFSFacade as OPFSFileSystem } from './index.sync';
