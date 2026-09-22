import { createApp } from 'vue';
import App from './App.vue';
import vuetify from './plugins/vuetify';
import i18n from './plugins/i18n';
import router from './router';
import './style.css';

const app = createApp(App);
app.use(i18n);
app.use(vuetify);
app.use(router);
app.mount('#app');
