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
  mdiMenu,
  mdiViewList,
  mdiDotsVertical,
} from '@mdi/js';

const curatorLightTheme: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#f3f4f8',
    surface: '#ffffff',
    'surface-variant': '#f8f9fc',
    primary: '#6366f1',
    'primary-darken-1': '#4f46e5',
    secondary: '#5a5e74',
    accent: '#6366f1',
    error: '#e05044',
    info: '#6366f1',
    success: '#10b981',
    warning: '#f59e0b',
  },
};

const curatorDarkTheme: ThemeDefinition = {
  dark: true,
  colors: {
    background: '#0e0f17',
    surface: '#151622',
    'surface-variant': '#1c1e2d',
    primary: '#818cf8',
    'primary-darken-1': '#6366f1',
    secondary: '#9ca3bc',
    accent: '#818cf8',
    error: '#e05044',
    info: '#818cf8',
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
      'mdi-menu': mdiMenu,
      'mdi-view-list': mdiViewList,
      'mdi-dots-vertical': mdiDotsVertical,
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
