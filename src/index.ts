export * from './types';
export * from './utils/errors';
export * from './utils/helpers';
export * from './utils/encoder';

export {
    OPFSFacade,
    OPFSFileSystem,
    createOPFS,
    // 1.x aliases
    createWorker,
} from './OPFSFacade';

export { createOPFSWorker } from './createOPFSWorker';
export type { RawWorker } from './createOPFSWorker';
