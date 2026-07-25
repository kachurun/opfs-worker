import { resolve } from 'path';
import { defineConfig } from 'vite';

/**
 * Self-contained worker scripts (comlink & backends bundled in), loadable by URL
 * without any bundler help.
 *
 * Built one at a time (multi-entry would code-split shared modules into a second
 * chunk, which breaks Worker/SharedWorker loaded by a single URL):
 *
 *   OPFS_WORKER=dedicated.worker vite build -c vite.worker.config.ts
 *   OPFS_WORKER=shared.worker    vite build -c vite.worker.config.ts
 *
 * Outputs: dist/<name>.js → `opfs-worker/<name>.js`
 */
const worker = process.env.OPFS_WORKER ?? 'shared.worker';

export default defineConfig({
    build: {
        emptyOutDir: false,
        lib: {
            entry: resolve(__dirname, `src/worker/${ worker }.ts`),
            formats: ['es'],
            fileName: () => `${ worker }.js`,
        },
        target: 'es2022',
        sourcemap: true,
    },
});
