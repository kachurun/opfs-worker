import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { ChevronsUpDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FaGithub } from 'react-icons/fa';

import { EventLog, formatWatchDetail, type LogEntry } from './EventLog';
import { FileBrowser } from './FileBrowser';
import { Inspector } from './Inspector';
import {
    createDemoFs,
    formatBytes,
    indexToTree,
    seedDemoFs,
    type DemoMode,
    type TreeNode,
} from './fs';
import './styles.css';

import type { OPFSFacade, WatchEvent } from '../src';

const MODES: {
    id: DemoMode;
    label: string;
    description: string;
    guide: string;
    code: string;
}[] = [
    {
        id: 'dedicated',
        label: 'Dedicated',
        description: 'Each tab gets its own Web Worker, so heavy file work runs in the background and the UI stays responsive. Tabs still learn about each other’s changes through BroadcastChannel watch events.',
        guide: 'https://github.com/kachurun/opfs-worker/blob/main/docs/guides/dedicated.md',
        code: `import { createOPFSDedicated } from 'opfs-worker';

const fs = createOPFSDedicated({ root: '/opfs-worker-demo' });

await fs.writeFile('/hello.txt', 'hi');
const text = await fs.readFile('/hello.txt', 'utf-8');`,
    },
    {
        id: 'async',
        label: 'Async',
        description: 'The simplest setup: no worker, just async calls on the current thread. Easy to wire up and debug. Writes need Safari 26 or newer, and change events still sync across tabs through BroadcastChannel.',
        guide: 'https://github.com/kachurun/opfs-worker/blob/main/docs/guides/async.md',
        code: `import { createOPFSAsync } from 'opfs-worker/async';

const fs = createOPFSAsync({ root: '/opfs-worker-demo' });

await fs.writeFile('/hello.txt', 'hi');
const text = await fs.readFile('/hello.txt', 'utf-8');`,
    },
    {
        id: 'shared',
        label: 'SharedWorker',
        description: 'The same async backend, but wrapped in a SharedWorker: all tabs connect to one instance instead of spinning up their own. Writes need Safari 26 or newer. Useful when you want a single worker process for the whole origin rather than one per tab.',
        guide: 'https://github.com/kachurun/opfs-worker/blob/main/docs/guides/sharedworker.md',
        code: `import { createOPFSShared } from 'opfs-worker/sharedworker';
import workerUrl from 'opfs-worker/shared.worker.js?url';

const fs = createOPFSShared({ root: '/opfs-worker-demo', url: workerUrl });

await fs.writeFile('/hello.txt', 'hi');
const text = await fs.readFile('/hello.txt', 'utf-8');`,
    },
];

const snippetChrome = EditorView.theme({
    '&': {
        backgroundColor: 'transparent',
    },
    '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '12px',
        lineHeight: '1.5',
    },
    '.cm-content': {
        padding: '0.5rem 0',
    },
    '.cm-gutters': {
        display: 'none',
    },
    '&.cm-focused': {
        outline: 'none',
    },
}, { dark: true });

const MODE_IDS = new Set<string>(MODES.map(m => m.id));
const MODE_LS_KEY = 'opfs-worker-demo-mode';
const FILE_LS_KEY = 'opfs-worker-demo-file';

function isDemoMode(value: string | null | undefined): value is DemoMode {
    return !!value && MODE_IDS.has(value);
}

function readQueryParam(name: string): string | null {
    try {
        return new URLSearchParams(window.location.search).get(name);
    }
    catch {
        return null;
    }
}

function readStoredMode(): DemoMode {
    const fromQuery = readQueryParam('mode');

    if (isDemoMode(fromQuery)) {
        return fromQuery;
    }

    try {
        const fromLs = localStorage.getItem(MODE_LS_KEY);

        if (isDemoMode(fromLs)) {
            return fromLs;
        }
    }
    catch {
        // ignore
    }

    return 'dedicated';
}

function readStoredFile(): string | null {
    const fromQuery = readQueryParam('file');

    if (fromQuery && fromQuery.startsWith('/')) {
        return fromQuery;
    }

    try {
        const fromLs = localStorage.getItem(FILE_LS_KEY);

        if (fromLs && fromLs.startsWith('/')) {
            return fromLs;
        }
    }
    catch {
        // ignore
    }

    return null;
}

function persistMode(mode: DemoMode) {
    try {
        localStorage.setItem(MODE_LS_KEY, mode);
    }
    catch {
        // ignore
    }

    try {
        const url = new URL(window.location.href);

        if (mode === 'dedicated') {
            url.searchParams.delete('mode');
        }
        else {
            url.searchParams.set('mode', mode);
        }

        window.history.replaceState(null, '', url);
    }
    catch {
        // ignore
    }
}

function persistFile(path: string | null) {
    try {
        if (path) {
            localStorage.setItem(FILE_LS_KEY, path);
        }
        else {
            localStorage.removeItem(FILE_LS_KEY);
        }
    }
    catch {
        // ignore
    }

    try {
        const url = new URL(window.location.href);

        if (path) {
            url.searchParams.set('file', path);
        }
        else {
            url.searchParams.delete('file');
        }

        window.history.replaceState(null, '', url);
    }
    catch {
        // ignore
    }
}

function App() {
    const [mode, setMode] = useState<DemoMode>(readStoredMode);
    const [fs, setFs] = useState<OPFSFacade | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [selectedPath, setSelectedPath] = useState<string | null>(readStoredFile);
    const [selectedKind, setSelectedKind] = useState<'file' | 'directory' | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
    const [showCode, setShowCode] = useState(false);

    const fsRef = useRef<OPFSFacade | null>(null);
    const unwatchRef = useRef<(() => void) | null>(null);
    const selectedPathRef = useRef(selectedPath);
    const logId = useRef(0);

    selectedPathRef.current = selectedPath;

    const selectPath = useCallback((path: string | null, kind: 'file' | 'directory' | null) => {
        // Keep the ref in sync before any await in refreshTree can race on the old path.
        selectedPathRef.current = path;
        setSelectedPath(path);
        setSelectedKind(kind);
    }, []);

    useEffect(() => {
        persistMode(mode);
    }, [mode]);

    useEffect(() => {
        persistFile(selectedPath);
    }, [selectedPath]);

    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.storageArea !== localStorage) {
                return;
            }

            if (event.key === MODE_LS_KEY && isDemoMode(event.newValue) && event.newValue !== mode) {
                setMode(event.newValue);
            }

            if (event.key === FILE_LS_KEY) {
                const next = event.newValue && event.newValue.startsWith('/') ? event.newValue : null;

                if (next !== selectedPathRef.current) {
                    selectPath(next, null);
                }
            }
        };

        window.addEventListener('storage', onStorage);

        return () => window.removeEventListener('storage', onStorage);
    }, [mode, selectPath]);

    const pushLog = useCallback((kind: LogEntry['kind'], message: string, detail?: string) => {
        const id = ++logId.current;
        const time = new Date().toLocaleTimeString();

        setEntries(prev => [...prev.slice(-499), { id, kind, time, message, detail }]);
    }, []);

    const refreshQuota = useCallback(async() => {
        if (!navigator.storage?.estimate) {
            return;
        }

        const estimate = await navigator.storage.estimate();

        setQuota({
            usage: estimate.usage ?? 0,
            quota: estimate.quota ?? 0,
        });
    }, []);

    const refreshTree = useCallback(async(instance?: OPFSFacade | null) => {
        const current = instance ?? fsRef.current;

        if (!current) {
            return;
        }

        try {
            const index = await current.index();

            setTree(indexToTree(index));

            const openPath = selectedPathRef.current;

            if (openPath) {
                const stat = index.get(openPath);

                if (!stat) {
                    selectPath(null, null);
                }
                else {
                    setSelectedKind(stat.isDirectory ? 'directory' : 'file');
                }
            }

            setRefreshToken(n => n + 1);
            await refreshQuota();
        }
        catch (err) {
            pushLog('error', 'index()', err instanceof Error ? err.message : String(err));
        }
    }, [pushLog, refreshQuota, selectPath]);

    // Init / mode switch
    useEffect(() => {
        let cancelled = false;

        const boot = async() => {
            setReady(false);
            setError(null);
            unwatchRef.current?.();
            unwatchRef.current = null;
            fsRef.current?.dispose();
            fsRef.current = null;
            setFs(null);

            try {
                pushLog('info', `init mode=${ mode }`);
                const next = createDemoFs(mode);

                if (cancelled) {
                    next.dispose();

                    return;
                }

                fsRef.current = next;
                setFs(next);

                await seedDemoFs(next);

                if (cancelled) {
                    return;
                }

                unwatchRef.current = next.watch('/', { recursive: true });
                pushLog('op', 'watch(/, recursive)');
                await refreshTree(next);
                setReady(true);
                pushLog('info', 'ready');
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);

                setError(message);
                pushLog('error', 'init failed', message);
            }
        };

        void boot();

        return () => {
            cancelled = true;
            unwatchRef.current?.();
            unwatchRef.current = null;
            fsRef.current?.dispose();
            fsRef.current = null;
        };
    }, [mode, pushLog, refreshTree]);

    // BroadcastChannel → watch log + tree refresh
    useEffect(() => {
        const channel = new BroadcastChannel('opfs-worker-demo');

        channel.onmessage = (event: MessageEvent<WatchEvent>) => {
            const data = event.data;

            if (!data?.path || !data?.type) {
                return;
            }

            pushLog('watch', formatWatchDetail(data));
            void refreshTree();
        };

        return () => channel.close();
    }, [pushLog, refreshTree]);

    const clearAll = async() => {
        if (!fs) {
            return;
        }

        try {
            pushLog('op', 'clear(/)');
            await fs.clear('/');
            // re-seed marker gone → seed again
            await seedDemoFs(fs);
            pushLog('op', 'clear(/)', 'ok + reseed');
            selectPath(null, null);
            await refreshTree();
        }
        catch (err) {
            pushLog('error', 'clear(/)', err instanceof Error ? err.message : String(err));
        }
    };

    const quotaPct = quota && quota.quota > 0
        ? Math.min(100, Math.round((quota.usage / quota.quota) * 100))
        : 0;

    const modeInfo = MODES.find(m => m.id === mode) ?? MODES[0]!;
    const snippetExtensions = useMemo(() => [
        oneDark,
        snippetChrome,
        javascript({ typescript: true }),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
    ], []);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex h-10 shrink-0 items-center gap-3 border-b border-base-300 bg-base-100 px-3">
                <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold">opfs-worker</span>
                    <a
                        className="btn btn-ghost btn-square btn-xs opacity-60 hover:opacity-100"
                        href="https://github.com/kachurun/opfs-worker"
                        target="_blank"
                        rel="noreferrer"
                        title="GitHub"
                        aria-label="GitHub repository"
                    >
                        <FaGithub size={ 14 } />
                    </a>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <label className="relative inline-flex items-center">
                        <select
                            className="select select-xs w-auto appearance-none pr-6"
                            value={ mode }
                            onChange={ e => setMode(e.target.value as DemoMode) }
                        >
                            {MODES.map(m => (
                                <option key={ m.id } value={ m.id }>{m.label}</option>
                            ))}
                        </select>
                        <ChevronsUpDown size={ 12 } className="pointer-events-none absolute right-1.5 opacity-50" />
                    </label>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    {!ready && !error && <span className="loading loading-spinner loading-xs" />}
                    {error && <span className="text-[11px] text-error" title={ error }>init failed</span>}
                    {quota && (
                        <div className="flex min-w-[10rem] max-w-xs flex-col justify-center gap-0.5">
                            <div className="flex justify-between text-[10px] leading-none opacity-50">
                                <span>OPFS quota</span>
                                <span>
                                    {formatBytes(quota.usage)}
                                    {' '}
                                    /
                                    {' '}
                                    {formatBytes(quota.quota)}
                                </span>
                            </div>
                            <progress className="progress progress-primary h-1" value={ quotaPct } max={ 100 } />
                        </div>
                    )}
                </div>
            </header>

            <div className="shrink-0 border-b border-base-300 bg-base-200/60">
                <div className="flex items-center gap-3 px-3 py-1.5">
                    <p className="min-w-0 flex-1 text-[11px] leading-relaxed opacity-75">
                        {modeInfo.description}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            className="text-[11px] font-medium text-primary hover:underline"
                            onClick={ () => setShowCode(open => !open) }
                        >
                            {showCode ? 'Hide code' : 'Show code'}
                        </button>
                        <a
                            className="text-[11px] opacity-60 hover:opacity-100 hover:underline"
                            href={ modeInfo.guide }
                            target="_blank"
                            rel="noreferrer"
                        >
                            Docs
                        </a>
                    </div>
                </div>
                {showCode && (
                    <div className="max-h-56 overflow-auto border-t border-base-300 bg-base-300/30 px-1">
                        <CodeMirror
                            value={ modeInfo.code }
                            theme="none"
                            basicSetup={ {
                                lineNumbers: false,
                                foldGutter: false,
                                highlightActiveLine: false,
                                highlightSelectionMatches: false,
                            } }
                            extensions={ snippetExtensions }
                            editable={ false }
                            readOnly
                        />
                    </div>
                )}
            </div>

            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(12rem,28%)]">
                <div className="grid min-h-0 grid-cols-1 md:grid-cols-[250px_minmax(0,1fr)]">
                    <div className="min-h-0">
                        {fs && (
                            <FileBrowser
                                fs={ fs }
                                tree={ tree }
                                selectedPath={ selectedPath }
                                selectedKind={ selectedKind }
                                uploadProgress={ uploadProgress }
                                onUploadProgress={ setUploadProgress }
                                onSelect={ (path, kind) => {
                                    selectPath(path, kind);
                                } }
                                onRefresh={ () => void refreshTree() }
                                onReset={ () => void clearAll() }
                                onLog={ pushLog }
                            />
                        )}
                    </div>
                    <div className="min-h-0">
                        {fs && (
                            <Inspector
                                fs={ fs }
                                path={ selectedPath }
                                kind={ selectedKind }
                                refreshToken={ refreshToken }
                                onLog={ pushLog }
                                onRefresh={ () => void refreshTree() }
                            />
                        )}
                    </div>
                </div>
                <EventLog
                    entries={ entries }
                    onClear={ () => setEntries([]) }
                />
            </div>
        </div>
    );
}

const rootEl = document.getElementById('root');

if (!rootEl) {
    throw new Error('Root element not found');
}

createRoot(rootEl).render(<App />);
