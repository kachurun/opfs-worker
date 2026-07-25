import { expose } from 'comlink';

import { OPFSAsync } from '../core/OPFSAsync';

/**
 * Shared worker entry — built self-contained (comlink bundled in) to
 * `dist/shared.worker.js`, exposed as `opfs-worker/shared.worker.js`.
 *
 * One `OPFSAsync` instance serves every connected tab, so per-path locks
 * naturally serialize writes across tabs. Sync access handles are not
 * available in a SharedWorker, hence the async backend.
 */
const fs = new OPFSAsync();

(globalThis as unknown as { onconnect: (event: MessageEvent) => void }).onconnect = (event: MessageEvent) => {
    expose(fs, event.ports[0]);
};
