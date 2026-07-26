import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cpp } from '@codemirror/lang-cpp';
import { css } from '@codemirror/lang-css';
import { go } from '@codemirror/lang-go';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import CodeMirror from '@uiw/react-codemirror';
import { Download, FilePlus, FolderPlus, Upload } from 'lucide-react';

import { DEMO_HASH_ALGORITHM, formatBytes, isAudioPath, isImagePath, isPdfPath, isTextPath, isVideoPath, mimeFromPath, toHexDump } from './fs';

import type { Extension } from '@codemirror/state';
import type { FileStat, OPFSFacade } from '../src';

function editorChrome(dark: boolean): Extension {
    return EditorView.theme({
        '&': {
            height: '100%',
            backgroundColor: 'var(--color-base-100)',
        },
        '&.cm-focused': {
            outline: 'none',
        },
        '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '13px',
        },
        '.cm-gutters': {
            backgroundColor: 'var(--color-base-100)',
            border: 'none',
            color: '#6b7280',
        },
        '.cm-activeLineGutter': {
            backgroundColor: 'transparent',
        },
    }, { dark });
}

function languageFromPath(path: string): Extension[] {
    const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;

    switch (ext) {
        case 'ts':
        case 'mts':
        case 'cts':
        case 'tsx':
            return [javascript({ typescript: true, jsx: ext === 'tsx' })];
        case 'js':
        case 'mjs':
        case 'cjs':
        case 'jsx':
            return [javascript({ jsx: ext === 'jsx' })];
        case 'json':
        case 'jsonc':
            return [json()];
        case 'md':
        case 'markdown':
            return [markdown()];
        case 'css':
        case 'scss':
        case 'less':
            return [css()];
        case 'html':
        case 'htm':
            return [html()];
        case 'xml':
        case 'svg':
            return [xml()];
        case 'yml':
        case 'yaml':
            return [yaml()];
        case 'py':
            return [python()];
        case 'rs':
            return [rust()];
        case 'go':
            return [go()];
        case 'java':
        case 'kt':
            return [java()];
        case 'c':
        case 'h':
        case 'cpp':
        case 'hpp':
        case 'cc':
            return [cpp()];
        case 'php':
            return [php()];
        case 'sql':
            return [sql()];
        case 'rb':
            return [StreamLanguage.define(ruby)];
        case 'sh':
        case 'bash':
        case 'zsh':
        case 'env':
            return [StreamLanguage.define(shell)];
        case 'toml':
        case 'ini':
        case 'conf':
            return [StreamLanguage.define(toml)];
        case 'dockerfile':
            return [StreamLanguage.define(dockerFile)];
        default:
            return [];
    }
}

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

interface Crumb {
    name: string;
    path: string;
    kind: 'file' | 'directory';
}

/** `/a/b/file.txt` → root, `/a`, `/a/b`, `/a/b/file.txt`. Only the last crumb can be a file. */
function toCrumbs(path: string, isDirectory: boolean): Crumb[] {
    const segments = path.split('/').filter(Boolean);

    return segments.map((name, i) => ({
        name,
        path: `/${ segments.slice(0, i + 1).join('/') }`,
        kind: i === segments.length - 1 && !isDirectory ? 'file' : 'directory',
    }));
}

type MediaMode = 'image' | 'video' | 'audio' | 'pdf';

function mediaModeFor(path: string): MediaMode | null {
    if (isImagePath(path)) {
        return 'image';
    }

    if (isVideoPath(path)) {
        return 'video';
    }

    if (isAudioPath(path)) {
        return 'audio';
    }

    if (isPdfPath(path)) {
        return 'pdf';
    }

    return null;
}

export function Inspector({
    fs,
    path,
    kind,
    refreshToken,
    onLog,
    onRefresh,
    onSelect,
    dark,
    onNewFile,
    onNewFolder,
    onUpload,
    onDownload,
}: InspectorProps) {
    const [stat, setStat] = useState<FileStat | null>(null);
    const [text, setText] = useState('');
    const [savedText, setSavedText] = useState('');
    const [hex, setHex] = useState('');
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [mode, setMode] = useState<'text' | MediaMode | 'hex' | 'dir'>('dir');
    const [loading, setLoading] = useState(false);
    const saveRef = useRef<() => Promise<void>>(async () => undefined);
    const loadedPathRef = useRef<string | null>(null);
    const textRef = useRef('');
    const savedTextRef = useRef('');
    const mediaUrlRef = useRef<string | null>(null);
    const mediaKeyRef = useRef<string | null>(null);

    const loadText = useCallback((value: string) => {
        textRef.current = value;
        savedTextRef.current = value;
        setText(value);
        setSavedText(value);
    }, []);

    const setMedia = useCallback((url: string | null, key: string | null = null) => {
        if (mediaUrlRef.current) {
            URL.revokeObjectURL(mediaUrlRef.current);
        }

        mediaUrlRef.current = url;
        mediaKeyRef.current = key;
        setMediaUrl(url);
    }, []);

    useEffect(() => () => {
        if (mediaUrlRef.current) {
            URL.revokeObjectURL(mediaUrlRef.current);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!path) {
                loadedPathRef.current = null;
                setMode('dir');
                setStat(null);
                loadText('');
                setHex('');
                setMedia(null);
                setLoading(false);

                return;
            }

            // Hand the disk-backed Blob straight to the browser: nothing is copied
            // into memory and <video>/<audio> stream only the ranges they play.
            const showMedia = async (media: MediaMode, nextStat: FileStat) => {
                const key = `${ path }:${ nextStat.size }:${ nextStat.mtime }`;

                // Re-creating the URL on every watch tick would restart playback.
                if (mediaKeyRef.current !== key) {
                    const blob = await fs.readBlob(path);

                    if (cancelled) {
                        return;
                    }

                    const mime = mimeFromPath(path);

                    // slice() re-tags the type without reading the bytes.
                    setMedia(URL.createObjectURL(mime && blob.type !== mime ? blob.slice(0, blob.size, mime) : blob), key);
                }

                setMode(media);
                setHex('');
                loadText('');
            };

            // Same file, just a refresh (save / watch): update stat only,
            // don't remount the editor or clobber what the user is editing.
            const isRefresh = loadedPathRef.current === `${ kind }:${ path }`;

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
                    // Silent sync: pick up edits from other tabs without remounting the editor.
                    // Own saves write the same bytes → setState bails out and focus stays.
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
                                // Do not overwrite local unsaved edits with a watch refresh.
                                if (textRef.current === savedTextRef.current) {
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

                    setHex((prev) => (prev === dump ? prev : dump));
                    setMode('hex');

                    return;
                }

                loadedPathRef.current = `${ kind }:${ path }`;

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
                    onLog('error', `inspect(${ path })`, error instanceof Error ? error.message : String(error));
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

        return () => {
            cancelled = true;
        };
    }, [fs, path, kind, refreshToken, onLog, loadText, setMedia]);

    const save = useCallback(async () => {
        if (!path || mode !== 'text' || text === savedText) {
            return;
        }

        try {
            await fs.writeFile(path, text);
            loadText(text);
            onLog('op', `writeFile(${ path })`, 'ok');
            onRefresh();
        }
        catch (error) {
            onLog('error', `writeFile(${ path })`, error instanceof Error ? error.message : String(error));
        }
    }, [fs, path, mode, text, savedText, onLog, onRefresh, loadText]);

    saveRef.current = save;

    const extensions = useMemo(() => {
        const chrome = editorChrome(dark);
        const theme = dark ? [oneDark, chrome] : [chrome];

        if (!path) {
            return theme;
        }

        return [
            ...theme,
            ...languageFromPath(path),
            Prec.highest(keymap.of([{
                key: 'Mod-s',
                run: () => {
                    void saveRef.current();

                    return true;
                },
            }])),
        ];
    }, [path, dark]);

    const isDirView = mode === 'dir' || !path;

    return (
        <section className="flex h-full min-h-0 flex-col bg-base-100">
            <div className="flex h-9 shrink-0 items-center gap-3 border-b border-base-300 px-3">
                <nav className="mono flex min-w-0 shrink items-center gap-0.5 overflow-hidden text-xs" aria-label="Breadcrumb">
                    <button
                        type="button"
                        className={`shrink-0 ${ path ? 'opacity-50 hover:opacity-100 hover:underline' : 'opacity-80' }`}
                        title="Root"
                        onClick={() => onSelect(null, null)}
                    >
                        /
                    </button>
                    {path && toCrumbs(path, kind === 'directory' || !!stat?.isDirectory).map((crumb, i, all) => (
                        <span key={crumb.path} className={`flex min-w-0 items-center gap-0.5 ${ i === all.length - 1 ? 'shrink' : 'shrink-0' }`}>
                            {i > 0 && <span className="shrink-0 opacity-30">/</span>}
                            <button
                                type="button"
                                className={`truncate ${ i === all.length - 1 ? 'opacity-80' : 'opacity-50 hover:opacity-100 hover:underline' }`}
                                title={crumb.path}
                                onClick={() => onSelect(crumb.path, crumb.kind)}
                            >
                                {crumb.name}
                            </button>
                        </span>
                    ))}
                </nav>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    {path && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-square btn-xs"
                            title={kind === 'directory' || stat?.isDirectory ? 'Download as ZIP' : 'Download'}
                            aria-label="Download"
                            onClick={() => onDownload?.(path, kind === 'directory' || !!stat?.isDirectory ? 'directory' : 'file')}
                        >
                            <Download size={14} />
                        </button>
                    )}
                    {mode === 'text' && text !== savedText && (
                        <button type="button" className="btn btn-xs btn-primary" title="Save (⌘/Ctrl+S)" onClick={() => void save()}>
                            Save
                        </button>
                    )}
                </div>
            </div>
            <div className={`min-h-0 flex-1 ${ loading || isDirView ? 'flex items-center justify-center p-3' : mode === 'text' || mode === 'pdf' ? '' : 'overflow-auto p-3' }`}>
                {loading && <span className="loading loading-spinner loading-sm" />}
                {!loading && mode === 'text' && (
                    <CodeMirror
                        value={text}
                        height="100%"
                        theme="none"
                        basicSetup={{
                            lineNumbers: true,
                            foldGutter: false,
                            highlightActiveLine: true,
                        }}
                        extensions={extensions}
                        onChange={(value) => {
                            textRef.current = value;
                            setText(value);
                        }}
                        className="h-full [&_.cm-editor]:h-full"
                    />
                )}
                {!loading && mode === 'image' && mediaUrl && (
                    <img src={mediaUrl} alt={path ?? ''} className="max-h-full max-w-full rounded border border-base-300" />
                )}
                {!loading && mode === 'video' && mediaUrl && (
                    <video
                        src={mediaUrl}
                        controls
                        preload="metadata"
                        className="max-h-full max-w-full rounded border border-base-300 bg-black"
                    />
                )}
                {!loading && mode === 'audio' && mediaUrl && (
                    <audio src={mediaUrl} controls preload="metadata" className="w-full max-w-md" />
                )}
                {!loading && mode === 'pdf' && mediaUrl && (
                    <iframe src={mediaUrl} title={path ?? 'pdf'} className="h-full w-full border-0 bg-base-200" />
                )}
                {!loading && mode === 'hex' && (
                    <pre className="mono overflow-auto rounded bg-base-200 p-2 text-xs">{hex}</pre>
                )}
                {!loading && isDirView && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <button type="button" className="btn btn-sm gap-1.5" onClick={onNewFile}>
                            <FilePlus size={14} />
                            New file
                        </button>
                        <button type="button" className="btn btn-sm gap-1.5" onClick={onNewFolder}>
                            <FolderPlus size={14} />
                            New folder
                        </button>
                        <button type="button" className="btn btn-sm gap-1.5" onClick={onUpload}>
                            <Upload size={14} />
                            Upload
                        </button>
                    </div>
                )}
            </div>
            {stat && !stat.isDirectory && path && (
                <div className="flex h-7 shrink-0 items-center gap-x-2 overflow-hidden border-t border-base-300 px-3 text-[11px] opacity-55">
                    {stat.hash ? (
                        <span className="mono min-w-0 truncate" title={`${ DEMO_HASH_ALGORITHM }: ${ stat.hash }`}>
                            {DEMO_HASH_ALGORITHM}
                            {': '}
                            {stat.hash}
                        </span>
                    ) : (
                        <span className="min-w-0" />
                    )}
                    <span className="ml-auto flex min-w-0 shrink-0 items-center gap-x-2">
                        <span className="mono truncate" title={mimeFromPath(path) ?? 'application/octet-stream'}>
                            {mimeFromPath(path) ?? 'application/octet-stream'}
                        </span>
                        <span className="opacity-40">·</span>
                        <span>{formatBytes(stat.size)}</span>
                        <span className="opacity-40">·</span>
                        <span>{new Date(stat.mtime).toLocaleString()}</span>
                    </span>
                </div>
            )}
        </section>
    );
}
