import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';

export default createVuetify({
  theme: {
    defaultTheme: 'artmomentsLight',
    themes: {
      artmomentsLight: {
        dark: false,
        colors: {
          background: '#F8F7F4',
          surface: '#FFFFFF',
          primary: '#5C4033',
          secondary: '#8D6E63',
          accent: '#D4A373',
          error: '#C62828',
          info: '#1565C0',
          success: '#2E7D32',
          warning: '#EF6C00',
        },
      },
      artmomentsDark: {
        dark: true,
        colors: {
          background: '#141312',
          surface: '#1F1D1B',
          primary: '#D4A373',
          secondary: '#A1887F',
          accent: '#E6CCB2',
          error: '#EF5350',
          info: '#42A5F5',
          success: '#66BB6A',
          warning: '#FFA726',
        },
      },
    },
  },
});

