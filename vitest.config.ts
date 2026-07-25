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
        'src/index.sync.ts',
        'src/index.async.ts',
        'src/index.sharedworker.ts',
        'src/facade/createOPFSDedicated.ts',
        'src/facade/createOPFSAsync.ts',
        'src/facade/createOPFSShared.ts',
        'src/worker/createDedicatedWorker.ts',
        'src/worker/createSharedWorker.ts',
        'src/worker/dedicated.worker.ts',
        'src/worker/shared.worker.ts',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
  esbuild: {
    target: 'es2022',
  },
});
