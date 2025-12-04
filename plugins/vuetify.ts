import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default defineNuxtPlugin({
  name: 'vuetify',
  parallel: true,
  setup(nuxtApp) {
    const vuetify = createVuetify({
      components,
      directives,
      theme: {
        defaultTheme: 'dark'
      }
    })
    
    nuxtApp.vueApp.use(vuetify)
  }
})
