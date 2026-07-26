import { createSignal, onCleanup } from 'solid-js';

import {
    createDemoFs,
    indexToTree,
    seedDemoFs,
    type DemoMode,
    type TreeNode,
} from './lib/fs';

import { formatWatchDetail, type LogEntry } from './lib/log';

import {
    FILE_LS_KEY,
    MODE_LS_KEY,
    applyTheme,
    isDemoMode,
    persistFile,
    persistMode,
    persistTheme,
    readStoredFile,
    readStoredMode,
    readStoredTheme,
    type ThemeMode,
} from './lib/persist';

import type { OPFSFacade } from '../src';

export interface FileBrowserActions {
    newFile: () => void;
    newFolder: () => void;
    upload: () => void;
    download: (path: string, kind: 'file' | 'directory') => void;
}

export function createDemoStore() {
    const initialTheme = readStoredTheme();

    applyTheme(initialTheme);

    const [theme, setTheme] = createSignal<ThemeMode>(initialTheme);
    const [mode, setModeSignal] = createSignal<DemoMode>(readStoredMode());
    const [fs, setFs] = createSignal<OPFSFacade | null>(null);
    const [ready, setReady] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [tree, setTree] = createSignal<TreeNode[]>([]);
    const [selectedPath, setSelectedPath] = createSignal<string | null>(readStoredFile());
    const [selectedKind, setSelectedKind] = createSignal<'file' | 'directory' | null>(null);
    const [refreshToken, setRefreshToken] = createSignal(0);
    const [entries, setEntries] = createSignal<LogEntry[]>([]);
    const [quota, setQuota] = createSignal<{ usage: number; quota: number } | null>(null);
    const [showCode, setShowCode] = createSignal(false);
    const [browserActions, setBrowserActions] = createSignal<FileBrowserActions | null>(null);

    let logId = 0;
    let unwatch: (() => void) | null = null;
    let bootGen = 0;

    const pushLog = (kind: LogEntry['kind'], message: string, detail?: string) => {
        const id = ++logId;
        const time = new Date().toLocaleTimeString();

        setEntries(prev => [...prev.slice(-499), { id, kind, time, message, detail }]);
    };

    const clearLog = () => setEntries([]);

    const selectPath = (path: string | null, kind: 'file' | 'directory' | null) => {
        setSelectedPath(path);
        setSelectedKind(kind);
        persistFile(path);
    };

    const setMode = (next: DemoMode) => {
        setModeSignal(next);
        persistMode(next);
    };

    const toggleTheme = () => {
        const next: ThemeMode = theme() === 'dark' ? 'light' : 'dark';

        applyTheme(next);
        persistTheme(next);
        setTheme(next);
    };

    const refreshQuota = async() => {
        if (!navigator.storage?.estimate) {
            return;
        }

        const estimate = await navigator.storage.estimate();

        setQuota({
            usage: estimate.usage ?? 0,
            quota: estimate.quota ?? 0,
        });
    };

    const refreshTree = async(instance?: OPFSFacade | null) => {
        const current = instance ?? fs();

        if (!current) {
            return;
        }

        try {
            const index = await current.index();

            setTree(indexToTree(index));

            const openPath = selectedPath();

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
    };

    const disposeFs = () => {
        unwatch?.();
        unwatch = null;
        fs()?.dispose();
        setFs(null);
    };

    const boot = async(nextMode: DemoMode) => {
        const gen = ++bootGen;

        setReady(false);
        setError(null);
        disposeFs();

        try {
            pushLog('info', `init mode=${ nextMode }`);
            const next = createDemoFs(nextMode);

            if (gen !== bootGen) {
                next.dispose();

                return;
            }

            setFs(next);
            await seedDemoFs(next);

            if (gen !== bootGen) {
                return;
            }

            unwatch = next.watch('/', { recursive: true }, (event) => {
                pushLog('watch', formatWatchDetail(event));
                void refreshTree();
            });
            pushLog('op', 'watch(/, recursive)');
            await refreshTree(next);

            if (gen !== bootGen) {
                return;
            }

            setReady(true);
            pushLog('info', 'ready');
        }
        catch (err) {
            if (gen !== bootGen) {
                return;
            }

            const message = err instanceof Error ? err.message : String(err);

            setError(message);
            pushLog('error', 'init failed', message);
        }
    };

    const clearAll = async() => {
        const current = fs();

        if (!current) {
            return;
        }

        try {
            await current.clear('/');
            await seedDemoFs(current);
            pushLog('op', 'clear(/)', 'ok + reseed');
            selectPath(null, null);
            await refreshTree();
        }
        catch (err) {
            pushLog('error', 'clear(/)', err instanceof Error ? err.message : String(err));
        }
    };

    // Persist mode on first load + keep URL/LS in sync when mode changes externally
    persistMode(mode());

    void boot(mode());

    const onStorage = (event: StorageEvent) => {
        if (event.storageArea !== localStorage) {
            return;
        }

        if (event.key === MODE_LS_KEY && isDemoMode(event.newValue) && event.newValue !== mode()) {
            setMode(event.newValue);
            void boot(event.newValue);
        }

        if (event.key === FILE_LS_KEY) {
            const next = event.newValue && event.newValue.startsWith('/') ? event.newValue : null;

            if (next !== selectedPath()) {
                selectPath(next, null);
            }
        }
    };

    window.addEventListener('storage', onStorage);

    onCleanup(() => {
        bootGen += 1;
        window.removeEventListener('storage', onStorage);
        disposeFs();
    });

    return {
        theme,
        toggleTheme,
        mode,
        setMode: (next: DemoMode) => {
            setMode(next);
            void boot(next);
        },
        fs,
        ready,
        error,
        tree,
        selectedPath,
        selectedKind,
        selectPath,
        refreshToken,
        entries,
        pushLog,
        clearLog,
        quota,
        showCode,
        setShowCode,
        refreshTree,
        clearAll,
        browserActions,
        registerBrowserActions: setBrowserActions,
    };
}

export type DemoStore = ReturnType<typeof createDemoStore>;
