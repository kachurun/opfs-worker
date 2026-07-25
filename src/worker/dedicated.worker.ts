import { expose } from 'comlink';

import { OPFSSync } from '../core/OPFSSync';

/**
 * Dedicated worker entry.
 *
 * Built two ways:
 * - Inlined into `createDedicatedWorker` via `?worker&inline` (default path)
 * - Self-contained `dist/dedicated.worker.js` → `opfs-worker/dedicated.worker.js`
 *   for DIY `new Worker(url, { type: 'module' })` + Comlink wrap
 */
expose(new OPFSSync());
