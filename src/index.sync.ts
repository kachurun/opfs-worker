export * from './types';
export * from './utils/errors';
export * from './utils/helpers';
export * from './utils/encoder';

export { BaseOPFS } from './core/BaseOPFS';
export { OPFSSync } from './core/OPFSSync';
export { OPFSFacade } from './facade/OPFSFacade';
export type { OPFSBackend } from './facade/OPFSFacade';

export { createOPFSDedicated } from './facade/createOPFSDedicated';
export type { DedicatedWorkerOptions } from './worker/createDedicatedWorker';
