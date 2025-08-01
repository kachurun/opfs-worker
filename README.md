# opfs-worker

Web Worker powered virtual file system based on the browser's Origin Private File System (OPFS).
The worker exposes a subset of the Node.js `fs.promises` API and communicates with the main
thread via [Comlink](https://github.com/GoogleChromeLabs/comlink).

## Usage

```ts
import { initFS } from 'opfs-worker'

const fs = await initFS()
await fs.writeFile('/hello.txt', 'Hello World')
const text = await fs.readFile('/hello.txt')
```

For more control over the worker instance:

```ts
import { FSWorker } from 'opfs-worker'
import { wrap } from 'comlink'

const fs = wrap(new FSWorker())
```

The exposed API mirrors common `fs.promises` methods such as `readFile`, `writeFile`,
`readdir`, `stat`, and more. All operations are asynchronous and operate inside the
dedicated worker to enable `createSyncAccessHandle()` usage required by Safari.
