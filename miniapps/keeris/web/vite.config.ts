import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js',
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@wasm': fileURLToPath(new URL('../wasm', import.meta.url)),
      '@keeris': fileURLToPath(new URL('../src', import.meta.url)),
      '@curator/console': fileURLToPath(new URL('../../../packages/curator-console/src/index.ts', import.meta.url)),
      '@curator/ast': fileURLToPath(new URL('../../../server/src/services/ast/types.ts', import.meta.url)),
      '@curator/wasm-core': fileURLToPath(new URL('../../../server/src/wasm-core/types.ts', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: 3000,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: fileURLToPath(new URL('../web-dist', import.meta.url)),
    emptyOutDir: false,
    sourcemap: true,
  },
});
