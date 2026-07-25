import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        emptyOutDir: true,
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                'index.pure': resolve(__dirname, 'src/index.pure.ts'),
                'index.sync': resolve(__dirname, 'src/index.sync.ts'),
                'index.async': resolve(__dirname, 'src/index.async.ts'),
                'index.sharedworker': resolve(__dirname, 'src/index.sharedworker.ts'),
            },
            name: 'opfs-worker',
            formats: ['es', 'cjs'],
            fileName: (format, entryName) => `${ entryName }.${ format === 'es' ? 'js' : 'cjs' }`,
        },
        rollupOptions: {
            external: ['comlink'],
            output: {
                globals: {
                    comlink: 'Comlink',
                },
            },
        },
        target: 'es2022',
        sourcemap: true,
    },
    worker: {
        format: 'es',
        plugins: () => [],
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
    server: {
        port: 3000,
        open: true,
    },
});
