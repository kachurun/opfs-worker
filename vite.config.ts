import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'opfs-worker',
      formats: ['es']
    }
  }
})
