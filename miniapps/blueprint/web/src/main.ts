import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import 'vuetify/styles';
import App from './App.vue';
import './style.css';

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          background: '#0c0f17',
          surface: '#151b28',
          primary: '#6366f1',
          secondary: '#8b5cf6',
          accent: '#10b981',
          error: '#ef4444',
          info: '#3b82f6',
          success: '#10b981',
          warning: '#f59e0b',
        },
      },
      light: {
        dark: false,
        colors: {
          background: '#f8fafc',
          surface: '#ffffff',
          primary: '#4f46e5',
          secondary: '#7c3aed',
          accent: '#059669',
        },
      },
    },
  },
});

const app = createApp(App);
app.use(vuetify);
app.mount('#app');
