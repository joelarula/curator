import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(() => {
  const outDir = fileURLToPath(new URL('../web-dist', import.meta.url));

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
        { find: '@curator/console', replacement: fileURLToPath(new URL('../../../packages/curator-console/src/index.ts', import.meta.url)) },
        { find: '@curator/agent-server', replacement: fileURLToPath(new URL('../../../curator/src/index.ts', import.meta.url)) },
      ],
    },
    server: {
      port: 3100,
      strictPort: true,
      host: true,
      proxy: {
        '/api/events': {
          target: 'http://localhost:4100',
          ws: true,
          changeOrigin: true,
        },
        '/api': {
          target: 'http://localhost:4100',
          changeOrigin: true,
        },
        '/graphql': {
          target: 'http://localhost:4100',
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
