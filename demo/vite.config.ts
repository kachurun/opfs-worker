import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [tailwindcss()],
    server: {
        port: 5173,
        open: true,
    },
    worker: {
        format: 'es',
    },
});
