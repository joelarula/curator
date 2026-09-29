import 'vuetify/styles';
import { h } from 'vue';
import { createVuetify, type ThemeDefinition, type IconSet, type IconProps } from 'vuetify';
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n';
import { useI18n } from 'vue-i18n';
import i18n from './i18n';
import { aliases as defaultAliases, mdi as defaultMdi } from 'vuetify/iconsets/mdi-svg';
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
  mdiAccountCircle,
  mdiGoogle,
  mdiLogout,
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

const customSvgIcons: Record<string, any> = {
  ...defaultAliases,
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
  'mdi-account-circle': mdiAccountCircle,
  'mdi-google': mdiGoogle,
  'mdi-logout': mdiLogout,
};

const customMdiSet: IconSet = {
  component: (props: IconProps) => {
    let icon = props.icon;
    if (typeof icon === 'string') {
      const cleanName = icon.startsWith('$') ? icon.slice(1) : icon;
      if (customSvgIcons[cleanName]) {
        icon = customSvgIcons[cleanName];
      } else if (customSvgIcons[cleanName.replace(/^mdi-/, '')]) {
        icon = customSvgIcons[cleanName.replace(/^mdi-/, '')];
      } else if (customSvgIcons['mdi-' + cleanName]) {
        icon = customSvgIcons['mdi-' + cleanName];
      } else if (!icon.startsWith('M') && !icon.startsWith('m') && !icon.startsWith('svg:')) {
        console.warn(`[Vuetify] Unknown icon "${icon}"`);
        icon = '';
      }
    }
    return h(defaultMdi.component, {
      ...props,
      icon,
    });
  },
};

export default createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases: customSvgIcons,
    sets: {
      mdi: customMdiSet,
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

