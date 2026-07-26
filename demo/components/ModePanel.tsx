import { javascript } from '@codemirror/lang-javascript';
import { EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { Show, createMemo, type Component } from 'solid-js';

import { CodeMirror } from './CodeMirror';
import { MODES } from '../lib/modes';

import type { DemoStore } from '../store';

function snippetChrome(dark: boolean): Extension {
    return EditorView.theme({
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
    }, { dark });
}

export const ModePanel: Component<{ store: DemoStore }> = (props) => {
    const modeInfo = createMemo(() => MODES.find(m => m.id === props.store.mode()) ?? MODES[0]!);
    const prefersDark = () => props.store.theme() === 'dark';
    const snippetExtensions = createMemo(() => [
        ...(prefersDark() ? [oneDark] : []),
        snippetChrome(prefersDark()),
        javascript({ typescript: true }),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
    ]);

    return (
        <div class="mode-info-panel shrink-0 border-b border-base-300 bg-base-200/60">
            <div class="flex items-center gap-3 px-3 py-1.5">
                <p class="min-w-0 flex-1 text-[11px] leading-relaxed opacity-75">
                    {modeInfo().description}
                </p>
                <div class="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        class="text-[11px] font-medium text-primary hover:underline"
                        onClick={ () => props.store.setShowCode(open => !open) }
                    >
                        {props.store.showCode() ? 'Hide code' : 'Show code'}
                    </button>
                    <a
                        class="text-[11px] opacity-60 hover:opacity-100 hover:underline"
                        href={ modeInfo().guide }
                        target="_blank"
                        rel="noreferrer"
                    >
                        Docs
                    </a>
                </div>
            </div>
            <Show when={ props.store.showCode() }>
                <div class="max-h-56 overflow-auto border-t border-base-300 bg-base-300/30 px-1">
                    <CodeMirror
                        value={ modeInfo().code }
                        extensions={ snippetExtensions() }
                        editable={ false }
                    />
                </div>
            </Show>
        </div>
    );
};
