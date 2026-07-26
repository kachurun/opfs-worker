import { expose } from 'comlink';

import { OPFSSync } from '../core/OPFSSync';

/**
 * Dedicated worker entry.
 *
 * Built two ways:
 * - Inlined into `createOPFSDedicated` via `?worker&inline` (default path)
 * - Self-contained `dist/dedicated.worker.js` → `opfs-worker/dedicated.worker.js`
 *   for DIY `new Worker(url, { type: 'module' })` + Comlink wrap
 *
 * Also accepts transferred MessagePorts (`type: 'opfs-connect'`) so one
 * OPFSSync instance can serve multiple facades on the same page.
 */
const fs = new OPFSSync();

expose(fs);

addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'opfs-connect' && event.data.port instanceof MessagePort) {
        expose(fs, event.data.port);
    }
});
