import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import CodeMirror from '@uiw/react-codemirror';

import { formatBytes, isImagePath, isTextPath, toHexDump } from './fs';

import type { Extension } from '@codemirror/state';
import type { FileStat, OPFSFacade } from '../src';

const editorChrome = EditorView.theme({
    '&': {
        height: '100%',
        backgroundColor: 'var(--color-base-100)',
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
}, { dark: true });

function languageFromPath(path: string): Extension[] {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();

    switch (ext) {
        case 'ts':
        case 'tsx':
            return [javascript({ typescript: true, jsx: ext === 'tsx' })];
        case 'js':
        case 'jsx':
            return [javascript({ jsx: ext === 'jsx' })];
        case 'json':
            return [json()];
        case 'md':
        case 'markdown':
            return [markdown()];
        case 'css':
            return [css()];
        case 'html':
        case 'htm':
            return [html()];
        case 'xml':
        case 'svg':
            return [xml()];
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
}

export function Inspector({ fs, path, kind, refreshToken, onLog, onRefresh }: InspectorProps) {
    const [stat, setStat] = useState<FileStat | null>(null);
    const [text, setText] = useState('');
    const [savedText, setSavedText] = useState('');
    const [hex, setHex] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [mode, setMode] = useState<'text' | 'image' | 'hex' | 'dir' | 'empty'>('empty');
    const [loading, setLoading] = useState(false);
    const saveRef = useRef<() => Promise<void>>(async () => undefined);
    const loadedPathRef = useRef<string | null>(null);
    const textRef = useRef('');
    const savedTextRef = useRef('');

    const loadText = useCallback((value: string) => {
        textRef.current = value;
        savedTextRef.current = value;
        setText(value);
        setSavedText(value);
    }, []);

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;

        const load = async () => {
            if (!path) {
                loadedPathRef.current = null;
                setMode('empty');
                setStat(null);
                loadText('');
                setHex('');
                setImageUrl(null);

                return;
            }

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

                    if (isImagePath(path)) {
                        const bytes = await fs.readFile(path, 'binary');

                        if (cancelled) {
                            return;
                        }

                        const nextUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));

                        setImageUrl((prev) => {
                            if (prev) {
                                URL.revokeObjectURL(prev);
                            }

                            return nextUrl;
                        });
                        setHex(toHexDump(bytes, 128));

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
                    setImageUrl(null);

                    return;
                }

                if (isImagePath(path)) {
                    const bytes = await fs.readFile(path, 'binary');
                    objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
                    setImageUrl(objectUrl);
                    setMode('image');
                    setHex(toHexDump(bytes, 128));
                    loadText('');

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
                            setImageUrl(null);

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
                setImageUrl(null);
            }
            catch (error) {
                if (!cancelled) {
                    onLog('error', `inspect(${ path })`, error instanceof Error ? error.message : String(error));
                    setMode('empty');
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

            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [fs, path, kind, refreshToken, onLog, loadText]);

    const save = useCallback(async () => {
        if (!path || mode !== 'text' || text === savedText) {
            return;
        }

        try {
            onLog('op', `writeFile(${ path })`);
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
        if (!path) {
            return [oneDark, editorChrome];
        }

        return [
            oneDark,
            editorChrome,
            ...languageFromPath(path),
            Prec.highest(keymap.of([{
                key: 'Mod-s',
                run: () => {
                    void saveRef.current();

                    return true;
                },
            }])),
        ];
    }, [path]);

    if (!path) {
        return (
            <section className="flex h-full items-center justify-center bg-base-100 text-sm opacity-50">
                Select a file or folder
            </section>
        );
    }

    return (
        <section className="flex h-full min-h-0 flex-col bg-base-100">
            <div className="flex h-9 shrink-0 items-center gap-3 border-b border-base-300 px-3">
                <div className="mono min-w-0 shrink truncate text-xs opacity-80">{path}</div>
                {stat && !stat.isDirectory && (
                    <div className="ml-auto flex min-w-0 max-w-[60%] items-center gap-x-2 truncate text-[11px] opacity-55">
                        <span className="shrink-0">{formatBytes(stat.size)}</span>
                        <span className="shrink-0 opacity-40">·</span>
                        <span className="shrink-0">{new Date(stat.mtime).toLocaleString()}</span>
                        {stat.hash ? (
                            <>
                                <span className="shrink-0 opacity-40">·</span>
                                <span className="mono truncate" title={stat.hash}>{stat.hash}</span>
                            </>
                        ) : null}
                    </div>
                )}
                {mode === 'text' && text !== savedText && (
                    <button type="button" className="btn btn-xs btn-primary shrink-0" title="Save (⌘/Ctrl+S)" onClick={() => void save()}>
                        Save
                    </button>
                )}
            </div>
            <div className={`min-h-0 flex-1 ${ mode === 'text' ? '' : mode === 'dir' ? 'flex items-center justify-center p-3' : 'overflow-auto p-3' }`}>
                {loading && <span className="loading loading-spinner loading-sm m-3" />}
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
                {!loading && mode === 'image' && imageUrl && (
                    <div className="space-y-3">
                        <img src={imageUrl} alt={path} className="max-h-80 max-w-full rounded border border-base-300" />
                        <pre className="mono overflow-auto rounded bg-base-200 p-2 text-xs">{hex}</pre>
                    </div>
                )}
                {!loading && mode === 'hex' && (
                    <pre className="mono overflow-auto rounded bg-base-200 p-2 text-xs">{hex}</pre>
                )}
                {!loading && mode === 'dir' && (
                    <p className="text-sm opacity-50">Directory selected. Use the file tree actions above.</p>
                )}
            </div>
        </section>
    );
}
