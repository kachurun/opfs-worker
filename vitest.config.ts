import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'demo/**',
        'src/test/',
        'src/index.ts',
        'src/index.pure.ts',
        'src/createOPFSWorker.ts',
        'src/worker.entry.ts',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
  esbuild: {
    target: 'es2022',
  },
});
