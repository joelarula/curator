// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['vuetify/styles'],
  alias: {
    '@': './src'
  },
  build: {
    transpile: ['vuetify']
  },
  nitro: {
    experimental: {
      wasm: true
    },
    externals: {
      inline: ['@huggingface/transformers']
    },
    moduleSideEffects: ['@huggingface/transformers']
  },
  vite: {
    optimizeDeps: {
      exclude: ['@huggingface/transformers']
    }
  }
})