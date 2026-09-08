import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';

const curatorDarkTheme = {
  dark: true,
  colors: {
    background: '#121212',
    surface: '#1E1E1E',
    'surface-variant': '#2A2A2A',
    primary: '#10B981',
    'primary-darken-1': '#059669',
    secondary: '#06B6D4',
    accent: '#3B82F6',
    error: '#EF4444',
    info: '#3B82F6',
    success: '#10B981',
    warning: '#F59E0B',
  },
};

export default createVuetify({
  theme: {
    defaultTheme: 'curatorDarkTheme',
    themes: {
      curatorDarkTheme,
    },
  },
});
