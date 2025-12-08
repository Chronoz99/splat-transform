import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    target: 'esnext',
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        browser: path.resolve(__dirname, 'src/browser.ts')
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.mjs`
    },
    rollupOptions: {
      external: ['webgpu', 'playcanvas'],
      output: {
        preserveModules: false,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.wasm')) {
            return '[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    },
    assetsInlineLimit: 0,
    sourcemap: true
  },
  optimizeDeps: {
    exclude: ['webgpu']
  }
});
