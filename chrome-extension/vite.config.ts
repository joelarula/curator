import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, '../frontend'),
  base: './',
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  build: {
    outDir: resolve(__dirname, 'dist/popup'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, '../frontend/index.html'),
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../frontend/src'),
    },
  },
})
