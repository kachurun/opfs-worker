import { wrap } from 'comlink';

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
    /** Worker name — tabs with the same script URL + name share one instance (default: 'opfs-worker') */
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
 * Shared mode, raw: connect to the SharedWorker (one `OPFSAsync` instance for
 * every tab) and get a Comlink proxy, without the Node-like facade.
 *
 * Note: `OPFSOptions` are applied via `setOptions()` on the shared instance, so
 * they affect every connected tab — use the same options in all tabs.
 *
 * For the facade, use {@link createOPFSShared}.
 */
export function createSharedWorker(options: SharedWorkerOptions = {}): RawSharedWorker {
    const { url, worker: providedWorker, name = 'opfs-worker', ...fsOptions } = options;

    const worker = providedWorker ?? new SharedWorker(
        url ?? new URL('./shared.worker.js', import.meta.url),
        { type: 'module', name }
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
