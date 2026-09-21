import 'vuetify/styles';
import { createVuetify, type ThemeDefinition } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import {
  mdiMusic,
  mdiPauseCircle,
  mdiPlayCircle,
  mdiClose,
  mdiRecordPlayer,
  mdiDatabaseCheck,
  mdiDatabaseSync,
  mdiRobot,
  mdiPlaylistMusic,
  mdiPlus,
  mdiPlay,
  mdiRefresh,
} from '@mdi/js';

const curatorDarkTheme: ThemeDefinition = {
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
  icons: {
    defaultSet: 'mdi',
    aliases: {
      ...aliases,
      'mdi-music': mdiMusic,
      'mdi-pause-circle': mdiPauseCircle,
      'mdi-play-circle': mdiPlayCircle,
      'mdi-close': mdiClose,
      'mdi-record-player': mdiRecordPlayer,
      'mdi-database-check': mdiDatabaseCheck,
      'mdi-database-sync': mdiDatabaseSync,
      'mdi-robot': mdiRobot,
      'mdi-playlist-music': mdiPlaylistMusic,
      'mdi-plus': mdiPlus,
      'mdi-play': mdiPlay,
      'mdi-refresh': mdiRefresh,
    },
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'curatorDarkTheme',
    themes: {
      curatorDarkTheme,
    },
  },
});
