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

export const DEMO_ROOT = '/opfs-worker-demo';
export const DEMO_CHANNEL = 'opfs-worker-demo';
export const DEMO_NAMESPACE = 'opfs-worker-demo';

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
    hashAlgorithm: 'SHA-1',
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

    await fs.createIndex([
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

    const paths = [...index.keys()].filter((path) => path !== '/.demo-seeded').sort();

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
    if (n < 1024) {
        return `${ n } B`;
    }

    if (n < 1024 * 1024) {
        return `${ (n / 1024).toFixed(1) } KB`;
    }

    return `${ (n / (1024 * 1024)).toFixed(1) } MB`;
}

export function isImagePath(path: string): boolean {
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(path);
}

export function isTextPath(path: string): boolean {
    return /\.(txt|md|json|js|ts|tsx|jsx|css|html|xml|csv|log|yml|yaml|toml|svg)$/i.test(path);
}

export function toHexDump(bytes: Uint8Array, max = 512): string {
    const slice = bytes.subarray(0, max);
    const lines: string[] = [];

    for (let i = 0; i < slice.length; i += 16) {
        const chunk = slice.subarray(i, i + 16);
        const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ');
        const ascii = [...chunk].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');

        lines.push(`${ i.toString(16).padStart(8, '0') }  ${ hex.padEnd(47, ' ') }  ${ ascii }`);
    }

    if (bytes.length > max) {
        lines.push(`… ${ bytes.length - max } more bytes`);
    }

    return lines.join('\n');
}
