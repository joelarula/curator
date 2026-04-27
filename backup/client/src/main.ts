import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { apolloClient } from './apollo'
import { DefaultApolloClient } from '@vue/apollo-composable'
import router from './router'
import App from './App.vue'

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light'
  }
})

const app = createApp(App)

app.provide(DefaultApolloClient, apolloClient)
app.use(vuetify)
app.use(router)
app.mount('#app')
