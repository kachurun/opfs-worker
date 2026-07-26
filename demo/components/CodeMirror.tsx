import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { createEffect, onCleanup, untrack, type Component } from 'solid-js';

// Baseline every editor needs; `fallback: true` lets theme styles (oneDark) win.
const baseExtensions: Extension[] = [
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
];

export interface CodeMirrorProps {
    value: string;
    extensions?: Extension[];
    editable?: boolean;
    class?: string;
    onChange?: (value: string) => void;
}

export const CodeMirror: Component<CodeMirrorProps> = (props) => {
    let host!: HTMLDivElement;
    let view: EditorView | undefined;
    let applyingExternal = false;

    createEffect(() => {
        const extensions = props.extensions ?? [];
        const editable = props.editable !== false;
        const onChange = props.onChange;
        const initialDoc = untrack(() => props.value);

        const next = new EditorView({
            parent: host,
            state: EditorState.create({
                doc: initialDoc,
                extensions: [
                    ...baseExtensions,
                    ...extensions,
                    EditorView.updateListener.of((update) => {
                        if (!update.docChanged || applyingExternal || !onChange) {
                            return;
                        }

                        onChange(update.state.doc.toString());
                    }),
                    EditorState.readOnly.of(!editable),
                    EditorView.editable.of(editable),
                ],
            }),
        });

        view?.destroy();
        view = next;

        onCleanup(() => {
            next.destroy();

            if (view === next) {
                view = undefined;
            }
        });
    });

    createEffect(() => {
        const value = props.value;
        const current = view;

        if (!current || current.state.doc.toString() === value) {
            return;
        }

        applyingExternal = true;
        current.dispatch({
            changes: {
                from: 0,
                to: current.state.doc.length,
                insert: value,
            },
        });
        applyingExternal = false;
    });

    return <div ref={ host } class={ props.class } />;
};
