import {
    createOPFSAsync,
    createOPFSDedicated,
    createOPFSShared,
    type FileStat,
    type OPFSFacade,
    type OPFSOptions,
} from '../src';

import sharedWorkerUrl from '../src/worker/shared.worker.ts?sharedworker&url';

export type DemoMode = 'dedicated' | 'async' | 'shared';

export const DEMO_ROOT = '/';
export const DEMO_CHANNEL = 'opfs-worker-demo';
export const DEMO_NAMESPACE = 'opfs-worker-demo';
export const DEMO_HASH_ALGORITHM = 'SHA-1';

export interface TreeNode {
    name: string;
    path: string;
    kind: 'file' | 'directory';
    children?: TreeNode[];
    stat?: FileStat;
}

const baseOptions = (): OPFSOptions => ({
    root: DEMO_ROOT,
    namespace: DEMO_NAMESPACE,
    broadcastChannel: DEMO_CHANNEL,
    hashAlgorithm: DEMO_HASH_ALGORITHM,
});

export function createDemoFs(mode: DemoMode): OPFSFacade {
    const options = baseOptions();

    if (mode === 'async') {
        return createOPFSAsync(options);
    }

    if (mode === 'shared') {
        return createOPFSShared({
            ...options,
            url: sharedWorkerUrl,
            name: 'opfs-worker-demo',
        });
    }

    return createOPFSDedicated(options);
}

export async function seedDemoFs(fs: OPFSFacade): Promise<void> {
    const marker = '/.demo-seeded';

    if (await fs.exists(marker)) {
        return;
    }

    await fs.importFiles([
        ['/readme.txt', 'Welcome to the opfs-worker demo.\n\nUpload files, edit text, try modes, watch the event log.\n'],
        ['/notes/todo.md', '# Todo\n\n- [x] Open demo\n- [ ] Upload a file\n- [ ] Switch to SharedWorker and open a second tab\n'],
        ['/data/sample.json', `${ JSON.stringify({ hello: 'opfs', version: 2 }, null, 2) }\n`],
        ['/bin/hello.bin', new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0x48, 0x69])],
    ]);
    await fs.writeFile(marker, '1');
}

export function indexToTree(index: Map<string, FileStat>): TreeNode[] {
    const root: TreeNode = { name: '/', path: '/', kind: 'directory', children: [] };
    const dirs = new Map<string, TreeNode>([['/', root]]);

    const ensureDir = (dirPath: string): TreeNode => {
        const existing = dirs.get(dirPath);

        if (existing) {
            return existing;
        }

        const parentPath = dirPath === '/' ? '/' : dirPath.slice(0, dirPath.lastIndexOf('/')) || '/';
        const name = dirPath.slice(dirPath.lastIndexOf('/') + 1) || '/';
        const node: TreeNode = { name, path: dirPath, kind: 'directory', children: [] };

        dirs.set(dirPath, node);
        ensureDir(parentPath).children!.push(node);

        return node;
    };

    const paths = [...index.keys()].filter(path => path !== '/.demo-seeded').sort();

    for (const path of paths) {
        const stat = index.get(path)!;

        if (stat.isDirectory) {
            const node = ensureDir(path);

            node.stat = stat;

            continue;
        }

        const parentPath = path.slice(0, path.lastIndexOf('/')) || '/';
        const name = path.slice(path.lastIndexOf('/') + 1);
        const parent = ensureDir(parentPath);

        parent.children!.push({
            name,
            path,
            kind: 'file',
            stat,
        });
    }

    const sortNodes = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.kind !== b.kind) {
                return a.kind === 'directory' ? -1 : 1;
            }

            return a.name.localeCompare(b.name);
        });

        for (const node of nodes) {
            if (node.children) {
                sortNodes(node.children);
            }
        }
    };

    sortNodes(root.children!);

    return root.children!;
}

export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) {
        return '0 B';
    }

    if (n < 1024) {
        return `${ Math.round(n) } B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'] as const;
    let value = n / 1024;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }

    return `${ value < 10 ? value.toFixed(2) : value.toFixed(1) } ${ units[unit] }`;
}

export function isImagePath(path: string): boolean {
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(path);
}

export function isVideoPath(path: string): boolean {
    return /\.(mp4|webm|ogv|mov|m4v)$/i.test(path);
}

export function isAudioPath(path: string): boolean {
    return /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i.test(path);
}

export function isPdfPath(path: string): boolean {
    return /\.pdf$/i.test(path);
}

export function isTextPath(path: string): boolean {
    return /\.(txt|md|markdown|json|jsonc|js|mjs|cjs|ts|mts|cts|tsx|jsx|css|scss|less|html|htm|xml|svg|csv|tsv|log|yml|yaml|toml|ini|conf|env|sh|bash|zsh|py|rb|rs|go|java|kt|c|h|cpp|hpp|cs|php|sql|graphql|gql|dockerfile|gitignore|editorconfig)$/i.test(path);
}

export function mimeFromPath(path: string): string | undefined {
    const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;

    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'svg': return 'image/svg+xml';
        case 'bmp': return 'image/bmp';
        case 'ico': return 'image/x-icon';

        case 'mp4':
        case 'm4v': return 'video/mp4';
        case 'webm': return 'video/webm';
        case 'ogv': return 'video/ogg';
        case 'mov': return 'video/quicktime';

        case 'mp3': return 'audio/mpeg';
        case 'wav': return 'audio/wav';
        case 'ogg':
        case 'oga': return 'audio/ogg';
        case 'opus': return 'audio/opus';
        case 'm4a': return 'audio/mp4';
        case 'aac': return 'audio/aac';
        case 'flac': return 'audio/flac';

        case 'pdf': return 'application/pdf';

        case 'txt':
        case 'log':
        case 'text': return 'text/plain';
        case 'md':
        case 'markdown': return 'text/markdown';
        case 'html':
        case 'htm': return 'text/html';
        case 'css':
        case 'scss':
        case 'less': return 'text/css';
        case 'csv': return 'text/csv';
        case 'tsv': return 'text/tab-separated-values';
        case 'xml': return 'application/xml';
        case 'json':
        case 'jsonc': return 'application/json';
        case 'js':
        case 'mjs':
        case 'cjs': return 'text/javascript';
        case 'jsx': return 'text/jsx';
        case 'ts':
        case 'mts':
        case 'cts': return 'text/typescript';
        case 'tsx': return 'text/tsx';
        case 'yml':
        case 'yaml': return 'application/yaml';
        case 'toml': return 'application/toml';
        case 'ini':
        case 'conf':
        case 'env':
        case 'editorconfig': return 'text/plain';
        case 'sh':
        case 'bash':
        case 'zsh': return 'application/x-sh';
        case 'py': return 'text/x-python';
        case 'rb': return 'text/x-ruby';
        case 'rs': return 'text/rust';
        case 'go': return 'text/x-go';
        case 'java': return 'text/x-java-source';
        case 'kt': return 'text/x-kotlin';
        case 'c':
        case 'h': return 'text/x-c';
        case 'cpp':
        case 'hpp':
        case 'cc': return 'text/x-c++';
        case 'cs': return 'text/x-csharp';
        case 'php': return 'application/x-httpd-php';
        case 'sql': return 'application/sql';
        case 'graphql':
        case 'gql': return 'application/graphql';
        case 'dockerfile': return 'text/x-dockerfile';
        case 'gitignore': return 'text/plain';
        case 'wasm': return 'application/wasm';
        case 'zip': return 'application/zip';
        case 'gz': return 'application/gzip';
        case 'bin': return 'application/octet-stream';

        default: return undefined;
    }
}

export function toHexDump(bytes: Uint8Array, max = 512): string {
    const slice = bytes.subarray(0, max);
    const lines: string[] = [];

    for (let i = 0; i < slice.length; i += 16) {
        const chunk = slice.subarray(i, i + 16);
        const hex = [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ');
        const ascii = [...chunk].map(b => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');

        lines.push(`${ i.toString(16).padStart(8, '0') }  ${ hex.padEnd(47, ' ') }  ${ ascii }`);
    }

    if (bytes.length > max) {
        lines.push(`… ${ bytes.length - max } more bytes`);
    }

    return lines.join('\n');
}
