import { wrap } from 'comlink';

import WorkerCtor from './dedicated.worker?worker&inline';
import { normalizePath } from '../utils/helpers';

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
    /** Bring your own Worker instance (overrides `url`) — not pooled */
    worker?: Worker;
}

export interface RawWorker {
    /** Comlink proxy to `OPFSSync` (bytes in / bytes out) */
    fs: RemoteOPFSSync;
    /** Underlying browser Worker */
    worker: Worker;
    /** Drops this facade's port; terminates the Worker when the last user of this pool entry disposes */
    dispose: () => void;
}

interface PoolEntry {
    worker: Worker;
    refs: number;
}

/** Same root (+ same worker url) → one Worker per page. */
const pool = new Map<string, PoolEntry>();

function poolKey(root: string, url?: string | URL): string {
    return `${ normalizePath(root) }\0${ url?.toString() ?? 'inline' }`;
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

function connectProxy(worker: Worker): { fs: RemoteOPFSSync; port: MessagePort } {
    const { port1, port2 } = new MessageChannel();

    worker.postMessage({ type: 'opfs-connect', port: port2 }, [port2]);

    return { fs: wrap<RemoteOPFSSync>(port1), port: port1 };
}

/**
 * Internal helper: spawn (or reuse) a dedicated worker and wrap `OPFSSync` with Comlink.
 * Prefer {@link createOPFSDedicated}; access the proxy / Worker via
 * `facade.backend` / `facade.worker`.
 *
 * Calls with the same `root` (and same `url`, if any) share one Worker on this page.
 * Different roots get different Workers. Passing `worker` bypasses the pool.
 *
 * `setOptions` hits the shared instance — keep options consistent for the same root.
 */
export function createDedicatedWorker(options: DedicatedWorkerOptions = {}): RawWorker {
    const { url, worker: providedWorker, ...fsOptions } = options;
    const root = normalizePath(fsOptions.root ?? '/');

    if (providedWorker) {
        const { fs, port } = connectProxy(providedWorker);

        applyWorkerOptions(fs, fsOptions);

        return {
            fs,
            worker: providedWorker,
            dispose() {
                port.close();
            },
        };
    }

    const key = poolKey(root, url);
    let entry = pool.get(key);

    if (!entry) {
        entry = {
            worker: url ? new Worker(url, { type: 'module' }) : new InlineWorker(),
            refs: 0,
        };
        pool.set(key, entry);
    }

    entry.refs += 1;

    const { worker } = entry;
    const { fs, port } = connectProxy(worker);

    applyWorkerOptions(fs, fsOptions);

    let disposed = false;

    return {
        fs,
        worker,
        dispose() {
            if (disposed) {
                return;
            }

            disposed = true;

            void (async() => {
                const current = pool.get(key);
                const isLast = !!current && current.worker === worker && current.refs <= 1;

                try {
                    // Only the last facade may dispose the shared OPFSSync backend
                    if (isLast) {
                        await fs.dispose();
                    }
                }
                finally {
                    port.close();
                }

                if (!current || current.worker !== worker) {
                    return;
                }

                current.refs -= 1;

                if (current.refs <= 0) {
                    pool.delete(key);
                    worker.terminate();
                }
            })();
        },
    };
}
