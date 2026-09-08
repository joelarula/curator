import { createApp } from 'vue';
import App from './App.vue';
import vuetify from './plugins/vuetify.js';
import './style.css';

const app = createApp(App);
app.use(vuetify);
app.mount('#app');