import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    open: true
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      external: ['webgpu', 'module', 'node:path', 'node:url']
    }
  },
  optimizeDeps: {
    exclude: ['@playcanvas/splat-transform']
  }
});
