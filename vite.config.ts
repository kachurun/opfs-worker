import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        lib: {
            entry: {
                'index': resolve(__dirname, 'src/index.ts'),
                'raw': resolve(__dirname, 'src/worker.ts')
            },
            name: 'opfs-worker',
            formats: ['es', 'cjs'],
            fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`
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
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
    server: {
        port: 3000,
        open: true,
    },
});
