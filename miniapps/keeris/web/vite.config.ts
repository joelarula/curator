import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const isWasm = mode === 'wasm' || process.env.BUILD_TARGET === 'wasm';
  const targetMode = isWasm ? 'wasm' : 'server';
  const outDir = isWasm
    ? fileURLToPath(new URL('../wasm-dist', import.meta.url))
    : fileURLToPath(new URL('../web-dist', import.meta.url));

  return {
    root: fileURLToPath(new URL('./', import.meta.url)),
    plugins: [
      vue(),
      vuetify({ autoImport: true }),
    ],
    define: {
      __TARGET_MODE__: JSON.stringify(targetMode),
    },
    resolve: {
      alias: [
        { find: 'vue', replacement: 'vue/dist/vue.esm-bundler.js' },
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        { find: '@wasm', replacement: fileURLToPath(new URL('../wasm', import.meta.url)) },
        { find: '@keeris', replacement: fileURLToPath(new URL('../src', import.meta.url)) },
        { find: '@curator/console', replacement: fileURLToPath(new URL('../../../packages/curator-console/src/index.ts', import.meta.url)) },
        { find: '@curator/ast', replacement: fileURLToPath(new URL('../../../server/src/services/ast/types.ts', import.meta.url)) },
        { find: '@curator/wasm-core', replacement: fileURLToPath(new URL('../../../server/src/wasm-core/types.ts', import.meta.url)) },
        ...(isWasm
          ? []
          : [
              {
                find: './wasm-adapter.ts',
                replacement: fileURLToPath(new URL('../src/adapters/wasm-adapter-stub.ts', import.meta.url)),
              },
              {
                find: './wasm-adapter',
                replacement: fileURLToPath(new URL('../src/adapters/wasm-adapter-stub.ts', import.meta.url)),
              },
            ]),
      ],
    },
    server: {
      port: 3001,
      strictPort: true,
      host: true,
      watch: {
        usePolling: true,
        interval: 1000,
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      proxy: {
        '/graphql': {
          target: process.env.VITE_BACKEND_URL || 'http://localhost:4001',
          changeOrigin: true,
        },
        '/health': {
          target: process.env.VITE_BACKEND_URL || 'http://localhost:4001',
          changeOrigin: true,
        },
        '/data': {
          target: process.env.VITE_BACKEND_URL || 'http://localhost:4001',
          changeOrigin: true,
        },
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
      outDir,
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
