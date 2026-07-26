import type { DemoMode } from './fs';

export type ThemeMode = 'light' | 'dark';

const THEME_LS_KEY = 'opfs-worker-demo-theme';

export const MODE_LS_KEY = 'opfs-worker-demo-mode';
export const FILE_LS_KEY = 'opfs-worker-demo-file';

const MODE_IDS = new Set<string>(['dedicated', 'async', 'shared']);

export function isDemoMode(value: string | null | undefined): value is DemoMode {
    return !!value && MODE_IDS.has(value);
}

function systemTheme(): ThemeMode {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readStoredTheme(): ThemeMode {
    try {
        const value = localStorage.getItem(THEME_LS_KEY);

        if (value === 'light' || value === 'dark') {
            return value;
        }
    }
    catch {
        // ignore
    }

    return systemTheme();
}

export function applyTheme(theme: ThemeMode) {
    document.documentElement.setAttribute('data-theme', theme);
}

export function persistTheme(theme: ThemeMode) {
    try {
        localStorage.setItem(THEME_LS_KEY, theme);
    }
    catch {
        // ignore
    }
}

function readQueryParam(name: string): string | null {
    try {
        return new URLSearchParams(window.location.search).get(name);
    }
    catch {
        return null;
    }
}

export function readStoredMode(): DemoMode {
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

export function readStoredFile(): string | null {
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

export function persistMode(mode: DemoMode) {
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

export function persistFile(path: string | null) {
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
