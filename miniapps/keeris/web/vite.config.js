import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  resolve: {
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js',
    },
  },
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
  },
});