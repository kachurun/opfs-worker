import { wrap } from 'comlink';

import { normalizePath } from '../utils/helpers';

import type { OPFSAsync } from '../core/OPFSAsync';
import type { OPFSOptions } from '../types';
import type { Remote } from 'comlink';

type RemoteOPFSAsync = Remote<OPFSAsync>;

export interface SharedWorkerOptions extends OPFSOptions {
    /**
     * URL of the worker script, e.g. `import url from 'opfs-worker/shared.worker.js?url'` (Vite).
     *
     * Defaults to `new URL('./shared.worker.js', import.meta.url)`, which works when
     * `opfs-worker` is served as-is (CDN, unbundled deps). When your bundler inlines
     * the package into app chunks, pass the url explicitly.
     */
    url?: string | URL;
    /** Bring your own SharedWorker instance (overrides `url`) */
    worker?: SharedWorker;
    /**
     * SharedWorker name prefix (default: `'opfs-worker'`).
     * The actual browser name is `${name}:${root}` so different roots get different
     * SharedWorkers. Tabs with the same script URL + full name share one instance.
     */
    name?: string;
}

export interface RawSharedWorker {
    /** Comlink proxy to the `OPFSAsync` instance shared by all connected tabs */
    fs: RemoteOPFSAsync;
    /** Underlying browser SharedWorker */
    worker: SharedWorker;
    /** Closes this tab's port; the worker keeps running for other tabs */
    dispose: () => void;
}

/**
 * Internal helper: connect to the SharedWorker and wrap `OPFSAsync` with Comlink.
 * Prefer {@link createOPFSShared}; access the proxy / SharedWorker via
 * `facade.backend` / `facade.worker`.
 *
 * The SharedWorker `name` is `${name}:${root}` (default prefix `opfs-worker`), so
 * different roots do not share one process. `OPFSOptions` still go through
 * `setOptions()` on that instance — keep options consistent across tabs for the
 * same root.
 */
export function createSharedWorker(options: SharedWorkerOptions = {}): RawSharedWorker {
    const { url, worker: providedWorker, name = 'opfs-worker', ...fsOptions } = options;
    const root = normalizePath(fsOptions.root ?? '/');
    const workerName = `${ name }:${ root }`;

    const worker = providedWorker ?? new SharedWorker(
        url ?? new URL('./shared.worker.js', import.meta.url),
        { type: 'module', name: workerName }
    );

    const fs = wrap<RemoteOPFSAsync>(worker.port);

    if (Object.keys(fsOptions).length > 0) {
        // A BroadcastChannel instance can't cross the wire — send its name instead
        if (fsOptions.broadcastChannel instanceof BroadcastChannel) {
            fsOptions.broadcastChannel = fsOptions.broadcastChannel.name;
        }

        void fs.setOptions(fsOptions);
    }

    return {
        fs,
        worker,
        dispose() {
            worker.port.close();
        },
    };
}
