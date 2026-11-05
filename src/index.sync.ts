export * from './types.js';
export * from './utils/errors.js';
export * from './utils/helpers.js';
export * from './utils/encoder.js';

export { BaseOPFS } from './core/BaseOPFS.js';
export { OPFSSync } from './core/OPFSSync.js';
export { OPFSFacade } from './facade/OPFSFacade.js';
export type { OPFSBackend } from './facade/OPFSFacade.js';

export { createOPFSDedicated } from './facade/createOPFSDedicated.js';
/** Short alias for {@link createOPFSDedicated} */
export { createOPFSDedicated as createOPFS } from './facade/createOPFSDedicated.js';
export type { DedicatedWorkerOptions } from './worker/createDedicatedWorker.js';
