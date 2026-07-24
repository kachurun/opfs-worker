import { wrap } from 'comlink';

import WorkerCtor from './worker.entry?worker&inline';

import type { OPFSOptions, RemoteOPFSWorker } from './types';

const InlineWorker = WorkerCtor as new (options?: WorkerOptions) => Worker;

export interface RawWorker {
    /** Comlink proxy to `OPFSWorker` (bytes in / bytes out) */
    fs: RemoteOPFSWorker;
    /** Underlying browser Worker */
    worker: Worker;
    /** Calls worker `dispose()` then `terminate()` */
    dispose: () => void;
}

/** A `BroadcastChannel` instance can't cross the wire — send its name instead. */
function applyWorkerOptions(fs: Pick<RemoteOPFSWorker, 'setOptions'>, options?: OPFSOptions): void {
    if (!options) {
        return;
    }

    if (options.broadcastChannel instanceof BroadcastChannel) {
        options.broadcastChannel = options.broadcastChannel.name;
    }

    void fs.setOptions(options);
}

/**
 * Mode 2: spawn the inlined worker and get a Comlink proxy to `OPFSWorker`
 * (bytes in / bytes out), without the facade.
 *
 * `OPFSFacade` is built on top of this — copy it if you want your own facade.
 */
export function createOPFSWorker(options?: OPFSOptions): RawWorker {
    const worker = new InlineWorker();
    const fs = wrap<RemoteOPFSWorker>(worker);

    applyWorkerOptions(fs, options);

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
