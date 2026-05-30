import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import App from './App.vue'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'curatorDark',
    themes: {
      curatorDark: {
        dark: true,
        colors: {
          background:  '#09090b',
          surface:     '#111116',
          'surface-variant': '#1a1a24',
          primary:     '#c084fc',
          secondary:   '#818cf8',
          accent:      '#38bdf8',
          success:     '#34d399',
          warning:     '#fb923c',
          error:       '#f87171',
          'on-background': '#e2e8f0',
          'on-surface':    '#cbd5e1',
        },
      },
    },
  },
  defaults: {
    VBtn: { variant: 'tonal', rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'compact', color: 'primary' },
    VTextarea: { variant: 'outlined', density: 'compact', color: 'primary' },
    VSelect: { variant: 'outlined', density: 'compact', color: 'primary' },
    VCard: { rounded: 'xl' },
    VChip: { rounded: 'lg' },
  },
  icons: { defaultSet: 'mdi' },
  components,
  directives,
})

createApp(App).use(vuetify).mount('#app')
