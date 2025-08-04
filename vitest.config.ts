import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'src/demo/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    }
  },
  esbuild: {
    target: 'es2022'
  }
}); 