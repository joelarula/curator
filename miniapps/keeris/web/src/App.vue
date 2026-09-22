<template>
  <v-app :theme="theme === 'dark' ? 'curatorDarkTheme' : 'curatorLightTheme'">
    <main class="shell">
      <header class="masthead">
        <div class="brand">
          <h1>{{ $t('app.brand') }}</h1>
        </div>
        <nav class="nav-tabs" aria-label="Main Navigation">
          <RouterLink to="/" custom v-slot="{ href, navigate, isActive }">
            <a :href="href" :class="{ active: isActive }" @click="navigate"> {{ $t('app.nav.songs') }} </a>
          </RouterLink>
          <RouterLink to="/summary" custom v-slot="{ href, navigate, isActive }">
            <a :href="href" :class="{ active: isActive }" @click="navigate"> {{ $t('app.nav.summary') }} </a>
          </RouterLink>
          <RouterLink to="/playlists" custom v-slot="{ href, navigate, isActive }">
            <a :href="href" :class="{ active: isActive }" @click="navigate"> {{ $t('app.nav.playlists') }} </a>
          </RouterLink>
        </nav>
        <div class="masthead-right">
          <template v-if="appMode === 'wasm'">
            <button
              class="header-db-btn"
              type="button"
              :disabled="isExporting"
              :title="$t('app.exportDb')"
              @click="handleExportDatabase"
            >
              {{ isExporting ? $t('app.exportingDb') : $t('app.exportDb') }}
            </button>
            <button
              class="header-db-btn"
              type="button"
              :disabled="isImporting"
              :title="$t('app.importDb')"
              @click="triggerFileInput"
            >
              {{ isImporting ? $t('app.importingDb') : $t('app.importDb') }}
            </button>
            <input
              ref="fileInputRef"
              type="file"
              accept=".sqlite,.sqlite3,.db"
              style="display: none"
              @change="handleFileSelected"
            />
          </template>
          <button
            class="console-nav-pill"
            :class="{ active: drawerOpen }"
            type="button"
            title="Open Curator Dev Console (Ctrl + `)"
            @click="drawerOpen = !drawerOpen"
          >
            <span class="pulse-indicator"></span>
            {{ $t('app.devConsole') }}
          </button>
          <button
            class="theme-toggle-btn"
            type="button"
            :title="theme === 'dark' ? $t('app.themeLight') : $t('app.themeDark')"
            :aria-label="theme === 'dark' ? $t('app.themeLight') : $t('app.themeDark')"
            @click="toggleTheme"
          >
            <!-- Sun icon when dark (click to switch to light) -->
            <svg
              v-if="theme === 'dark'"
              class="theme-icon"
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="4" />
              <line x1="12" y1="20" x2="12" y2="22" />
              <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
              <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
              <line x1="2" y1="12" x2="4" y2="12" />
              <line x1="20" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
              <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
            </svg>
            <!-- Moon icon when light (click to switch to dark) -->
            <svg
              v-else
              class="theme-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </div>
      </header>

      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component :is="Component" @play-track="handlePlayTrack" />
        </KeepAlive>
      </RouterView>
    </main>

    <!-- Curator AST Dev Console & Database Tools -->
    <CuratorConsole v-model="drawerOpen" :adapter="keerisCuratorAdapter" :domain-metrics="stats" />

    <!-- Audio Playback Footer Bar -->
    <AudioBar :current-track="activeTrack" @close="activeTrack = null" />
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView } from 'vue-router';
import KeerisHeader from './components/KeerisHeader.vue';
import { CuratorConsole } from '@curator/console';
import { keerisCuratorAdapter } from './curator-adapter';
import AudioBar from './components/AudioBar.vue';
import { requestGraphql, onWorkerReady, exportDatabase, importDatabase, onDatabaseChange, getAppMode, type AppMode } from '@wasm/graphql-client';
import { useTheme } from './composables/useTheme';

const { t } = useI18n();
const { theme, toggleTheme } = useTheme();

const appMode = ref<AppMode>('server');
const drawerOpen = ref(false);
const activeTrack = ref(null);
const isExporting = ref(false);
const isImporting = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const stats = ref({ episodes: 0, tracks: 0, uniqueTracks: 0, programs: 0 });

function handlePlayTrack(track) {
  activeTrack.value = track;
}

async function fetchStats() {
  try {
    const data = await requestGraphql(`
      query GetStats {
        stats {
          episodes
          tracks
          uniqueTracks
          programs
        }
      }
    `);
    stats.value = data.stats || {};
  } catch (err) {
    console.error('[App] Failed to fetch stats:', err);
  }
}

async function handleExportDatabase() {
  isExporting.value = true;
  try {
    await exportDatabase();
  } catch (err) {
    alert(t('app.exportError', { msg: err instanceof Error ? err.message : String(err) }));
  } finally {
    isExporting.value = false;
  }
}

function triggerFileInput() {
  if (fileInputRef.value) fileInputRef.value.click();
}

async function handleFileSelected(e) {
  const file = e.target?.files?.[0];
  if (!file) return;
  if (!confirm(t('app.importConfirm', { name: file.name, size: (file.size / (1024 * 1024)).toFixed(2) }))) {
    e.target.value = '';
    return;
  }
  isImporting.value = true;
  try {
    await importDatabase(file);
    setTimeout(() => window.location.reload(), 400);
  } catch (err) {
    alert(t('app.importError', { msg: err instanceof Error ? err.message : String(err) }));
    isImporting.value = false;
  }
}

function handleKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === '`') {
    e.preventDefault();
    drawerOpen.value = !drawerOpen.value;
  }
}

let unsubDbChange: (() => void) | null = null;
let statsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);
  try {
    appMode.value = await getAppMode();
  } catch (_) {}
  onWorkerReady(() => {
    fetchStats();
  });
  unsubDbChange = onDatabaseChange(() => {
    if (statsDebounceTimer) clearTimeout(statsDebounceTimer);
    statsDebounceTimer = setTimeout(fetchStats, 350);
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  if (unsubDbChange) unsubDbChange();
  if (statsDebounceTimer) clearTimeout(statsDebounceTimer);
});
</script>



<style scoped>
.masthead-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 8px;
}

.header-db-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(30, 41, 59, 0.85);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 6px 13px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  font-family: inherit;
  white-space: nowrap;
}

.header-db-btn:hover:not(:disabled) {
  background: #334155;
  border-color: #60a5fa;
  color: #ffffff;
  transform: translateY(-1px);
}

.header-db-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.console-nav-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.9);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.console-nav-pill:hover {
  background: #1e293b;
  border-color: #38bdf8;
  color: #7dd3fc;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
  transform: translateY(-1px);
}

.console-nav-pill.active {
  background: #38bdf8;
  color: #0f172a;
  border-color: #38bdf8;
}

.pulse-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
  display: inline-block;
  animation: pulse-ring 2s infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.95); opacity: 0.9; }
  50% { transform: scale(1.3); opacity: 0.4; }
  100% { transform: scale(0.95); opacity: 0.9; }
}

.theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.2s ease;
  padding: 0;
  flex-shrink: 0;
}

.theme-toggle-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--accent);
  color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.theme-toggle-btn:active {
  transform: translateY(0);
}

.theme-icon {
  display: block;
  transition: transform 0.25s ease;
}

.theme-toggle-btn:hover .theme-icon {
  transform: rotate(20deg);
}
</style>

