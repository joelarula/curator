import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(() => {
  const outDir = fileURLToPath(new URL('../web-dist', import.meta.url));
  const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:4005';

  return {
    root: fileURLToPath(new URL('./', import.meta.url)),
    plugins: [
      vue(),
      vuetify({ autoImport: true }),
    ],
    resolve: {
      alias: [
        { find: 'vue', replacement: 'vue/dist/vue.esm-bundler.js' },
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        { find: '@gallery', replacement: fileURLToPath(new URL('../src', import.meta.url)) },
        { find: '@curator/console', replacement: fileURLToPath(new URL('../../../packages/curator-console/src/index.ts', import.meta.url)) },
        { find: '@curator/agent-server', replacement: fileURLToPath(new URL('../../../curator/src/index.ts', import.meta.url)) },
        { find: '@curator/ast', replacement: fileURLToPath(new URL('../../../curator/src/engine/CuratorAst.ts', import.meta.url)) },
      ],
    },
    server: {
      port: 3005,
      strictPort: true,
      host: true,
      proxy: {
        '/api/curator': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/graphql': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/media': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/images': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/mcp': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/health': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/auth': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});

