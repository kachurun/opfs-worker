import { Prec } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { Download, FilePlus, FolderPlus, Upload } from 'lucide-solid';
import {
    For,
    Show,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    untrack,
    type Component,
} from 'solid-js';

import { toCrumbs, type Crumb } from './crumbs';
import { editorChrome, languageFromPath } from './languages';
import { mediaModeFor, type MediaMode } from './media';
import { formatBytes, isTextPath, mimeFromPath, toHexDump } from '../../lib/format';
import { DEMO_HASH_ALGORITHM } from '../../lib/fs';
import { CodeMirror } from '../CodeMirror';

import type { FileStat, OPFSFacade } from '../../../src';

interface InspectorProps {
    fs: OPFSFacade;
    path: string | null;
    kind: 'file' | 'directory' | null;
    refreshToken: number;
    onLog: (kind: 'op' | 'error' | 'info', message: string, detail?: string) => void;
    onRefresh: () => void;
    onSelect: (path: string | null, kind: 'file' | 'directory' | null) => void;
    dark: boolean;
    onNewFile?: () => void;
    onNewFolder?: () => void;
    onUpload?: () => void;
    onDownload?: (path: string, kind: 'file' | 'directory') => void;
}

export const Inspector: Component<InspectorProps> = (props) => {
    const [stat, setStat] = createSignal<FileStat | null>(null);
    const [text, setText] = createSignal('');
    const [savedText, setSavedText] = createSignal('');
    const [hex, setHex] = createSignal('');
    const [mediaUrl, setMediaUrl] = createSignal<string | null>(null);
    const [mode, setMode] = createSignal<'text' | MediaMode | 'hex' | 'dir'>('dir');
    const [loading, setLoading] = createSignal(false);

    let loadedPath: string | null = null;
    let mediaKey: string | null = null;
    let mediaUrlLocal: string | null = null;

    const loadText = (value: string) => {
        setText(value);
        setSavedText(value);
    };

    const setMedia = (url: string | null, key: string | null = null) => {
        if (mediaUrlLocal) {
            URL.revokeObjectURL(mediaUrlLocal);
        }

        mediaUrlLocal = url;
        mediaKey = key;
        setMediaUrl(url);
    };

    onCleanup(() => {
        if (mediaUrlLocal) {
            URL.revokeObjectURL(mediaUrlLocal);
        }
    });

    createEffect(() => {
        const path = props.path;
        const kind = props.kind;
        const fs = props.fs;

        // Track refresh without remounting editor for same path
        void props.refreshToken;

        let cancelled = false;

        const load = async() => {
            if (!path) {
                loadedPath = null;
                setMode('dir');
                setStat(null);
                loadText('');
                setHex('');
                setMedia(null);
                setLoading(false);

                return;
            }

            const showMedia = async(media: MediaMode, nextStat: FileStat) => {
                const key = `${ path }:${ nextStat.size }:${ nextStat.mtime }`;

                if (mediaKey !== key) {
                    const blob = await fs.readBlob(path);

                    if (cancelled) {
                        return;
                    }

                    const mime = mimeFromPath(path);

                    setMedia(URL.createObjectURL(mime && blob.type !== mime ? blob.slice(0, blob.size, mime) : blob), key);
                }

                setMode(media);
                setHex('');
                loadText('');
            };

            const isRefresh = loadedPath === `${ kind }:${ path }`;

            if (!isRefresh) {
                setLoading(true);
            }

            try {
                const nextStat = await fs.stat(path);

                if (cancelled) {
                    return;
                }

                setStat(nextStat);

                if (isRefresh) {
                    if (kind === 'directory' || nextStat.isDirectory) {
                        return;
                    }

                    const refreshMedia = mediaModeFor(path);

                    if (refreshMedia) {
                        await showMedia(refreshMedia, nextStat);

                        return;
                    }

                    if (isTextPath(path) || nextStat.size < 256 * 1024) {
                        try {
                            const content = await fs.readText(path);

                            if (cancelled) {
                                return;
                            }

                            const sample = content.slice(0, 200);
                            const weird = [...sample].filter((c) => {
                                const code = c.charCodeAt(0);

                                return code < 9 || (code > 13 && code < 32);
                            }).length;

                            if (weird / Math.max(sample.length, 1) < 0.1) {
                                if (untrack(() => text() === savedText())) {
                                    loadText(content);
                                }

                                setMode('text');

                                return;
                            }
                        }
                        catch {
                            // fall through to hex
                        }
                    }

                    const bytes = await fs.readFile(path, 'binary');

                    if (cancelled) {
                        return;
                    }

                    const dump = toHexDump(bytes);

                    setHex(prev => (prev === dump ? prev : dump));
                    setMode('hex');

                    return;
                }

                loadedPath = `${ kind }:${ path }`;

                if (kind === 'directory' || nextStat.isDirectory) {
                    setMode('dir');
                    loadText('');
                    setHex('');
                    setMedia(null);

                    return;
                }

                const media = mediaModeFor(path);

                if (media) {
                    await showMedia(media, nextStat);

                    return;
                }

                if (isTextPath(path) || nextStat.size < 256 * 1024) {
                    try {
                        const content = await fs.readText(path);

                        if (cancelled) {
                            return;
                        }

                        const sample = content.slice(0, 200);
                        const weird = [...sample].filter((c) => {
                            const code = c.charCodeAt(0);

                            return code < 9 || (code > 13 && code < 32);
                        }).length;

                        if (weird / Math.max(sample.length, 1) < 0.1) {
                            loadText(content);
                            setMode('text');
                            setHex('');
                            setMedia(null);

                            return;
                        }
                    }
                    catch {
                        // fall through to hex
                    }
                }

                const bytes = await fs.readFile(path, 'binary');

                if (cancelled) {
                    return;
                }

                setHex(toHexDump(bytes));
                setMode('hex');
                loadText('');
                setMedia(null);
            }
            catch (error) {
                if (!cancelled) {
                    props.onLog('error', `inspect(${ path })`, error instanceof Error ? error.message : String(error));
                    setMode('dir');
                }
            }
            finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();

        onCleanup(() => {
            cancelled = true;
        });
    });

    const save = async() => {
        const path = props.path;

        if (!path || mode() !== 'text' || text() === savedText()) {
            return;
        }

        try {
            await props.fs.writeFile(path, text());
            loadText(text());
            props.onLog('op', `writeFile(${ path })`, 'ok');
            props.onRefresh();
        }
        catch (error) {
            props.onLog('error', `writeFile(${ path })`, error instanceof Error ? error.message : String(error));
        }
    };

    const extensions = createMemo(() => {
        const chrome = editorChrome(props.dark);
        const theme = props.dark ? [oneDark, chrome] : [chrome];
        const path = props.path;

        if (!path) {
            return theme;
        }

        return [
            ...theme,
            lineNumbers(),
            highlightActiveLine(),
            ...languageFromPath(path),
            Prec.highest(keymap.of([{
                key: 'Mod-s',
                run: () => {
                    void save();

                    return true;
                },
            }])),
        ];
    });

    const isDirView = () => mode() === 'dir' || !props.path;
    const crumbs = createMemo(() => {
        const path = props.path;

        if (!path) {
            return [] as Crumb[];
        }

        return toCrumbs(path, props.kind === 'directory' || !!stat()?.isDirectory);
    });

    return (
        <section class="flex h-full min-h-0 flex-col bg-base-100">
            <div class="flex h-9 shrink-0 items-center gap-3 border-b border-base-300 px-3">
                <nav class="mono flex min-w-0 shrink items-center gap-0.5 overflow-hidden text-xs" aria-label="Breadcrumb">
                    <button
                        type="button"
                        class={ `shrink-0 ${ props.path ? 'opacity-50 hover:opacity-100 hover:underline' : 'opacity-80' }` }
                        title="Root"
                        onClick={ () => props.onSelect(null, null) }
                    >
                        /
                    </button>
                    <For each={ crumbs() }>
                        {(crumb, i) => (
                            <span class={ `flex min-w-0 items-center gap-0.5 ${ i() === crumbs().length - 1 ? 'shrink' : 'shrink-0' }` }>
                                <Show when={ i() > 0 }>
                                    <span class="shrink-0 opacity-30">/</span>
                                </Show>
                                <button
                                    type="button"
                                    class={ `truncate ${ i() === crumbs().length - 1 ? 'opacity-80' : 'opacity-50 hover:opacity-100 hover:underline' }` }
                                    title={ crumb.path }
                                    onClick={ () => props.onSelect(crumb.path, crumb.kind) }
                                >
                                    {crumb.name}
                                </button>
                            </span>
                        )}
                    </For>
                </nav>
                <div class="ml-auto flex shrink-0 items-center gap-1">
                    <Show when={ props.path }>
                        {path => (
                            <button
                                type="button"
                                class="btn btn-ghost btn-square btn-xs"
                                title={ props.kind === 'directory' || stat()?.isDirectory ? 'Download as ZIP' : 'Download' }
                                aria-label="Download"
                                onClick={ () => props.onDownload?.(
                                    path(),
                                    props.kind === 'directory' || !!stat()?.isDirectory ? 'directory' : 'file',
                                ) }
                            >
                                <Download size={ 14 } />
                            </button>
                        )}
                    </Show>
                    <Show when={ mode() === 'text' && text() !== savedText() }>
                        <button type="button" class="btn btn-xs btn-primary" title="Save (⌘/Ctrl+S)" onClick={ () => void save() }>
                            Save
                        </button>
                    </Show>
                </div>
            </div>
            <div class={ `min-h-0 flex-1 ${ loading() || isDirView() ? 'flex items-center justify-center p-3' : mode() === 'text' || mode() === 'pdf' ? '' : 'overflow-auto p-3' }` }>
                <Show when={ loading() }>
                    <span class="loading loading-spinner loading-sm" />
                </Show>
                <Show when={ !loading() && mode() === 'text' }>
                    <CodeMirror
                        value={ text() }
                        extensions={ extensions() }
                        onChange={ setText }
                        class="h-full [&_.cm-editor]:h-full"
                    />
                </Show>
                <Show when={ !loading() && mode() === 'image' && mediaUrl() }>
                    {url => <img src={ url() } alt={ props.path ?? '' } class="max-h-full max-w-full rounded border border-base-300" />}
                </Show>
                <Show when={ !loading() && mode() === 'video' && mediaUrl() }>
                    {url => (
                        <video
                            src={ url() }
                            controls
                            preload="metadata"
                            class="max-h-full max-w-full rounded border border-base-300 bg-black"
                        />
                    )}
                </Show>
                <Show when={ !loading() && mode() === 'audio' && mediaUrl() }>
                    {url => <audio src={ url() } controls preload="metadata" class="w-full max-w-md" />}
                </Show>
                <Show when={ !loading() && mode() === 'pdf' && mediaUrl() }>
                    {url => <iframe src={ url() } title={ props.path ?? 'pdf' } class="h-full w-full border-0 bg-base-200" />}
                </Show>
                <Show when={ !loading() && mode() === 'hex' }>
                    <pre class="mono overflow-auto rounded bg-base-200 p-2 text-xs">{hex()}</pre>
                </Show>
                <Show when={ !loading() && isDirView() }>
                    <div class="flex flex-wrap items-center justify-center gap-2">
                        <button type="button" class="btn btn-sm gap-1.5" onClick={ () => props.onNewFile?.() }>
                            <FilePlus size={ 14 } />
                            New file
                        </button>
                        <button type="button" class="btn btn-sm gap-1.5" onClick={ () => props.onNewFolder?.() }>
                            <FolderPlus size={ 14 } />
                            New folder
                        </button>
                        <button type="button" class="btn btn-sm gap-1.5" onClick={ () => props.onUpload?.() }>
                            <Upload size={ 14 } />
                            Upload
                        </button>
                    </div>
                </Show>
            </div>
            <Show when={ stat() && !stat()!.isDirectory && props.path }>
                <div class="flex h-7 shrink-0 items-center gap-x-2 overflow-hidden border-t border-base-300 px-3 text-[11px] opacity-55">
                    <Show
                        when={ stat()!.hash }
                        fallback={ <span class="min-w-0" /> }
                    >
                        {hash => (
                            <span class="mono min-w-0 truncate" title={ `${ DEMO_HASH_ALGORITHM }: ${ hash() }` }>
                                {DEMO_HASH_ALGORITHM}
                                {': '}
                                {hash()}
                            </span>
                        )}
                    </Show>
                    <span class="ml-auto flex min-w-0 shrink-0 items-center gap-x-2">
                        <span class="mono truncate" title={ mimeFromPath(props.path!) ?? 'application/octet-stream' }>
                            {mimeFromPath(props.path!) ?? 'application/octet-stream'}
                        </span>
                        <span class="opacity-40">·</span>
                        <span>{formatBytes(stat()!.size)}</span>
                        <span class="opacity-40">·</span>
                        <span>{new Date(stat()!.mtime).toLocaleString()}</span>
                    </span>
                </div>
            </Show>
        </section>
    );
};
