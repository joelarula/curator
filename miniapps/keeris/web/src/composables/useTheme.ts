import { ref, watch, onMounted } from 'vue';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'keeris-theme';

// Singleton reactive state shared across all consumers
const theme = ref<Theme>('light');

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
}

function initTheme() {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'dark' || stored === 'light') {
    theme.value = stored;
  } else {
    // Respect OS preference on first visit
    theme.value = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(theme.value);
}

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light';
}

watch(theme, (t) => {
  applyTheme(t);
  localStorage.setItem(STORAGE_KEY, t);
});

if (typeof window !== 'undefined') {
  initTheme();
}

export function useTheme() {
  return { theme, toggleTheme, initTheme };
}
