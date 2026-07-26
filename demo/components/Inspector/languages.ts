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
import { EditorView } from '@codemirror/view';

import type { Extension } from '@codemirror/state';

export function editorChrome(dark: boolean): Extension {
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

export function languageFromPath(path: string): Extension[] {
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
