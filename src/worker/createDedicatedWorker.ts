import { wrap } from 'comlink';

import WorkerCtor from './dedicated.worker?worker&inline';

import type { OPFSOptions, OPFSSync } from '../types';
import type { Remote } from 'comlink';

const InlineWorker = WorkerCtor as new (options?: WorkerOptions) => Worker;

type RemoteOPFSSync = Remote<OPFSSync>;

export interface DedicatedWorkerOptions extends OPFSOptions {
    /**
     * URL of the worker script, e.g. `import url from 'opfs-worker/dedicated.worker.js?url'` (Vite).
     *
     * Defaults to the inlined worker (no URL needed). Pass an explicit url when you
     * prefer the self-contained file (strict CSP without `blob:`, or DIY hosting).
     */
    url?: string | URL;
    /** Bring your own Worker instance (overrides `url`) */
    worker?: Worker;
}

export interface RawWorker {
    /** Comlink proxy to `OPFSSync` (bytes in / bytes out) */
    fs: RemoteOPFSSync;
    /** Underlying browser Worker */
    worker: Worker;
    /** Calls worker `dispose()` then `terminate()` */
    dispose: () => void;
}

/** A `BroadcastChannel` instance can't cross the wire — send its name instead. */
function applyWorkerOptions(fs: Pick<RemoteOPFSSync, 'setOptions'>, options?: OPFSOptions): void {
    if (!options) {
        return;
    }

    if (options.broadcastChannel instanceof BroadcastChannel) {
        options.broadcastChannel = options.broadcastChannel.name;
    }

    void fs.setOptions(options);
}

/**
 * Internal helper: spawn a dedicated worker and wrap `OPFSSync` with Comlink.
 * Prefer {@link createOPFSDedicated}; access the proxy / Worker via
 * `facade.backend` / `facade.worker`.
 */
export function createDedicatedWorker(options: DedicatedWorkerOptions = {}): RawWorker {
    const { url, worker: providedWorker, ...fsOptions } = options;

    const worker = providedWorker
      ?? (url ? new Worker(url, { type: 'module' }) : new InlineWorker());
    const fs = wrap<RemoteOPFSSync>(worker);

    applyWorkerOptions(fs, fsOptions);

    return {
        fs,
        worker,
        dispose() {
            void (async() => {
                try {
                    await fs.dispose();
                }
                finally {
                    worker.terminate();
                }
            })();
        },
    };
}
