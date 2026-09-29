<template>
  <v-app :theme="theme === 'dark' ? 'curatorDarkTheme' : 'curatorLightTheme'">
    <!-- Navigation Drawer for Mobile & Tablet -->
    <v-navigation-drawer
      v-model="mobileDrawer"
      temporary
      location="left"
      class="mobile-nav-drawer"
    >
      <div class="d-flex align-center justify-space-between pa-4 border-b">
        <div class="brand">
          <h2 class="text-subtitle-1 font-weight-bold mb-0">{{ $t('app.brand') }}</h2>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="mobileDrawer = false" />
      </div>

      <v-list nav class="pa-2">
        <v-list-item
          to="/"
          prepend-icon="mdi-music"
          :title="$t('app.nav.songs')"
          rounded="lg"
          @click="mobileDrawer = false"
        />
        <v-list-item
          to="/summary"
          prepend-icon="mdi-playlist-music"
          :title="$t('app.nav.summary')"
          rounded="lg"
          @click="mobileDrawer = false"
        />
        <v-list-item
          to="/playlists"
          prepend-icon="mdi-playlist-plus"
          :title="$t('app.nav.playlists')"
          rounded="lg"
          @click="mobileDrawer = false"
        />
      </v-list>

      <template v-if="appMode === 'wasm'">
        <v-divider class="my-2" />
        <div class="px-4 py-1 text-caption text-medium-emphasis font-weight-bold">
          ANDMEBAAS
        </div>
        <v-list nav class="pa-2 pt-0">
          <v-list-item
            prepend-icon="mdi-download"
            :title="isExporting ? $t('app.exportingDb') : $t('app.exportDb')"
            :disabled="isExporting"
            rounded="lg"
            @click="handleExportDatabase(); mobileDrawer = false"
          />
          <v-list-item
            prepend-icon="mdi-upload"
            :title="isImporting ? $t('app.importingDb') : $t('app.importDb')"
            :disabled="isImporting"
            rounded="lg"
            @click="triggerFileInput(); mobileDrawer = false"
          />
        </v-list>
      </template>

      <!-- Google Auth in Mobile Drawer (Server mode) -->
      <template v-if="isAuthSupported">
        <v-divider class="my-2" />
        <v-list nav class="pa-2 pt-0">
          <v-list-item
            v-if="!isAuthenticated"
            prepend-icon="mdi-google"
            :title="$t('app.signIn')"
            rounded="lg"
            @click="loginWithGoogle(); mobileDrawer = false"
          />
          <v-list-item
            v-else
            prepend-icon="mdi-account-circle"
            :title="user?.name || user?.email"
            :subtitle="$t('app.loggedInAs')"
            rounded="lg"
          >
            <template #append>
              <v-btn icon="mdi-logout" variant="text" size="small" @click="logout(); mobileDrawer = false" />
            </template>
          </v-list-item>
        </v-list>
      </template>

      <!-- Dev Console Link (Only available to curator_manager in Server mode, or always in WASM mode) -->
      <template v-if="canAccessConsole">
        <v-divider class="my-2" />
        <v-list nav class="pa-2 pt-0">
          <v-list-item
            prepend-icon="mdi-robot"
            :title="$t('app.devConsole')"
            rounded="lg"
            @click="drawerOpen = !drawerOpen; mobileDrawer = false"
          >
            <template #append>
              <span class="pulse-indicator"></span>
            </template>
          </v-list-item>
        </v-list>
      </template>
    </v-navigation-drawer>

    <main class="shell">
      <header class="masthead">
        <div class="brand">
          <v-btn
            class="d-md-none mr-1"
            icon="mdi-menu"
            variant="text"
            size="small"
            :aria-label="'Menu'"
            @click="mobileDrawer = true"
          />
          <h1>{{ $t('app.brand') }}</h1>
        </div>

        <!-- Desktop Navigation Tabs -->
        <nav class="nav-tabs d-none d-md-flex" aria-label="Main Navigation">
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
          <!-- Desktop DB Actions -->
          <template v-if="appMode === 'wasm'">
            <button
              class="header-db-btn d-none d-md-inline-flex"
              type="button"
              :disabled="isExporting"
              :title="$t('app.exportDb')"
              @click="handleExportDatabase"
            >
              {{ isExporting ? $t('app.exportingDb') : $t('app.exportDb') }}
            </button>
            <button
              class="header-db-btn d-none d-md-inline-flex"
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

          <!-- Desktop Dev Console Pill (Only available to curator_manager in Server mode, or always in WASM mode) -->
          <button
            v-if="canAccessConsole"
            class="console-nav-pill d-none d-md-inline-flex"
            :class="{ active: drawerOpen }"
            type="button"
            title="Open Curator Dev Console (Ctrl + `)"
            @click="drawerOpen = !drawerOpen"
          >
            <span class="pulse-indicator"></span>
            {{ $t('app.devConsole') }}
          </button>

          <!-- Desktop Google Auth (Server mode only) -->
          <template v-if="isAuthSupported">
            <button
              v-if="!isAuthenticated"
              class="auth-sign-in-btn d-none d-md-inline-flex"
              type="button"
              :title="$t('app.signIn')"
              @click="loginWithGoogle"
            >
              <svg class="google-icon" viewBox="0 0 24 24" width="15" height="15">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.15z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.27 21.36 7.35 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.6H1.26C.46 8.2 0 10.03 0 12s.46 3.8 1.26 5.4l4.02-3.13z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.64 1.26 6.6l4.02 3.13c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
              <span>{{ $t('app.signIn') }}</span>
            </button>
            <div v-else class="auth-user-badge d-none d-md-inline-flex">
              <span class="auth-user-name" :title="user?.email">{{ user?.name || user?.email?.split('@')[0] }}</span>
              <button
                class="auth-logout-btn"
                type="button"
                :title="$t('app.logout')"
                @click="logout"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </template>

          <!-- Theme Toggle (Visible everywhere, touch target friendly) -->
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
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>

    <!-- Curator AST Dev Console & Database Tools (Restricted to curator_manager role in Server mode) -->
    <CuratorConsole v-if="canAccessConsole" v-model="drawerOpen" :adapter="keerisCuratorAdapter" :domain-metrics="stats" />
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView } from 'vue-router';
import { useDisplay } from 'vuetify';
import KeerisHeader from './components/KeerisHeader.vue';
import { CuratorConsole } from '@curator/console';
import { keerisCuratorAdapter } from './curator-adapter';
import { requestGraphql, onWorkerReady, exportDatabase, importDatabase, onDatabaseChange, getAppMode, getServerBaseUrl, type AppMode } from '@wasm/graphql-client';
import { useTheme } from './composables/useTheme';
import { useAuth } from './composables/useAuth';

const { t } = useI18n();
const { theme, toggleTheme } = useTheme();
const { mdAndUp, smAndDown, mobile } = useDisplay();
const { user, isAuthenticated, isCuratorManager, initAuth, loginWithGoogle, logout } = useAuth();

const isReadonlyMode = ref(false);
const isAuthSupported = computed(() => appMode.value === 'server' && !isReadonlyMode.value);

const canAccessConsole = computed(() => {
  if (isReadonlyMode.value) return false;
  return appMode.value === 'wasm' || (isAuthenticated.value && isCuratorManager.value);
});

const mobileDrawer = ref(false);
const appMode = ref<AppMode>('server');
const drawerOpen = ref(false);
const isExporting = ref(false);
const isImporting = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const stats = ref({ episodes: 0, tracks: 0, uniqueTracks: 0, programs: 0 });

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

function handleKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === '`') {
    e.preventDefault();
    if (canAccessConsole.value) {
      drawerOpen.value = !drawerOpen.value;
    }
  }
}

let unsubDbChange: (() => void) | null = null;
let statsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);
  try {
    appMode.value = await getAppMode();
  } catch (_) {}

  try {
    const baseUrl = getServerBaseUrl();
    const res = await fetch(`${baseUrl}/health`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      if (data.mode === 'readonly') {
        isReadonlyMode.value = true;
      }
    }
  } catch (_) {}

  if (appMode.value !== 'wasm' && !isReadonlyMode.value) {
    await initAuth();
  }
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

.auth-sign-in-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: rgba(30, 41, 59, 0.9);
  color: #f1f5f9;
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  font-family: inherit;
  white-space: nowrap;
}

.auth-sign-in-btn:hover {
  background: #334155;
  border-color: #60a5fa;
  color: #ffffff;
  transform: translateY(-1px);
}

.auth-user-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.85);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 4px 6px 4px 12px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
}

.auth-user-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.auth-logout-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 50%;
  width: 22px;
  height: 22px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.auth-logout-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #ffffff;
  border-color: #ef4444;
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

