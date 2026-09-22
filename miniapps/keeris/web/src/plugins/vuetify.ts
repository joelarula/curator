import 'vuetify/styles';
import { createVuetify, type ThemeDefinition } from 'vuetify';
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n';
import { useI18n } from 'vue-i18n';
import i18n from './i18n';
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
  mdiDelete,
  mdiPencil,
  mdiArrowUp,
  mdiArrowDown,
  mdiDownload,
  mdiUpload,
  mdiPlaylistPlus,
  mdiArrowLeft,
  mdiCheck,
  mdiContentCopy,
  mdiFileDocumentOutline,
  mdiOpenInNew,
  mdiMagnify,
} from '@mdi/js';

const curatorLightTheme: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#eef0eb',
    surface: '#ffffff',
    'surface-variant': '#f7f5ee',
    primary: '#ef6a45',
    'primary-darken-1': '#c94f2c',
    secondary: '#50605a',
    accent: '#ef6a45',
    error: '#e05044',
    info: '#0284c7',
    success: '#10b981',
    warning: '#f59e0b',
  },
};

const curatorDarkTheme: ThemeDefinition = {
  dark: true,
  colors: {
    background: '#0f1512',
    surface: '#171f1c',
    'surface-variant': '#1e2923',
    primary: '#f07c5a',
    'primary-darken-1': '#ef6a45',
    secondary: '#8fa89f',
    accent: '#f07c5a',
    error: '#e05044',
    info: '#38bdf8',
    success: '#10b981',
    warning: '#f59e0b',
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
      'mdi-delete': mdiDelete,
      'mdi-pencil': mdiPencil,
      'mdi-arrow-up': mdiArrowUp,
      'mdi-arrow-down': mdiArrowDown,
      'mdi-download': mdiDownload,
      'mdi-upload': mdiUpload,
      'mdi-playlist-plus': mdiPlaylistPlus,
      'mdi-arrow-left': mdiArrowLeft,
      'mdi-check': mdiCheck,
      'mdi-content-copy': mdiContentCopy,
      'mdi-file-document-outline': mdiFileDocumentOutline,
      'mdi-open-in-new': mdiOpenInNew,
      'mdi-magnify': mdiMagnify,
    },
    sets: {
      mdi,
    },
  },
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n }),
  },
  theme: {
    defaultTheme: 'curatorLightTheme',
    themes: {
      curatorLightTheme,
      curatorDarkTheme,
    },
  },
});
