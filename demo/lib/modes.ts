import type { DemoMode } from './fs';

export const MODES: {
    id: DemoMode;
    label: string;
    description: string;
    guide: string;
    code: string;
}[] = [
    {
        id: 'dedicated',
        label: 'Dedicated',
        description: 'Each tab gets its own Web Worker, so heavy file work runs in the background and the UI stays responsive. Tabs still learn about each other’s changes through BroadcastChannel watch events.',
        guide: 'https://github.com/kachurun/opfs-worker/blob/main/docs/guides/dedicated.md',
        code: `import { createOPFS } from 'opfs-worker';

const fs = createOPFS({ root: '/' });

await fs.writeFile('/hello.txt', 'hi');
const text = await fs.readFile('/hello.txt', 'utf-8');`,
    },
    {
        id: 'async',
        label: 'Async',
        description: 'The simplest setup: no worker, just async calls on the current thread. Easy to wire up and debug. Writes need Safari 26 or newer, and change events still sync across tabs through BroadcastChannel.',
        guide: 'https://github.com/kachurun/opfs-worker/blob/main/docs/guides/async.md',
        code: `import { createOPFSAsync } from 'opfs-worker/async';

const fs = createOPFSAsync({ root: '/' });

await fs.writeFile('/hello.txt', 'hi');
const text = await fs.readFile('/hello.txt', 'utf-8');`,
    },
    {
        id: 'shared',
        label: 'SharedWorker',
        description: 'The same async backend, but wrapped in a SharedWorker: all tabs connect to one instance instead of spinning up their own. Writes need Safari 26 or newer. Useful when you want a single worker process for the whole origin rather than one per tab.',
        guide: 'https://github.com/kachurun/opfs-worker/blob/main/docs/guides/sharedworker.md',
        code: `import { createOPFSShared } from 'opfs-worker/sharedworker';
import workerUrl from 'opfs-worker/shared.worker.js?url';

const fs = createOPFSShared({ root: '/', url: workerUrl });

await fs.writeFile('/hello.txt', 'hi');
const text = await fs.readFile('/hello.txt', 'utf-8');`,
    },
];
