<template>
  <v-app theme="light">
    <main class="shell">
      <header class="masthead">
        <div class="brand">
          <h1>ERR Archive Index</h1>
        </div>
        <nav class="nav-tabs" aria-label="Main Navigation">
          <RouterLink to="/" custom v-slot="{ href, navigate, isActive }">
            <a :href="href" :class="{ active: isActive }" @click="navigate"> 🎵 Songs &amp; Airings </a>
          </RouterLink>
          <RouterLink to="/summary" custom v-slot="{ href, navigate, isActive }">
            <a :href="href" :class="{ active: isActive }" @click="navigate"> 📊 Program Summary </a>
          </RouterLink>
          <RouterLink to="/playlists" custom v-slot="{ href, navigate, isActive }">
            <a :href="href" :class="{ active: isActive }" @click="navigate"> 📋 Playlists </a>
          </RouterLink>
          <RouterLink to="/agents" custom v-slot="{ href, navigate, isActive }">
            <a :href="href" :class="{ active: isActive }" @click="navigate"> 🤖 Program Agents </a>
          </RouterLink>
        </nav>
        <div class="masthead-right">
          <button
            class="header-db-btn"
            type="button"
            :disabled="isExporting"
            title="Export Keeris SQLite database (.sqlite3)"
            @click="handleExportDatabase"
          >
            {{ isExporting ? '⏳ Exporting...' : '⬇ Export DB' }}
          </button>
          <button
            class="header-db-btn"
            type="button"
            :disabled="isImporting"
            title="Import Keeris SQLite database (.sqlite3)"
            @click="triggerFileInput"
          >
            {{ isImporting ? '⏳ Importing...' : '⬆ Import DB' }}
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".sqlite,.sqlite3,.db"
            style="display: none"
            @change="handleFileSelected"
          />
          <button
            class="console-nav-pill"
            :class="{ active: drawerOpen }"
            type="button"
            title="Open Curator Dev Console (Ctrl + `)"
            @click="drawerOpen = !drawerOpen"
          >
            <span class="pulse-indicator"></span>
            🤖 Dev Console
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
import { RouterLink, RouterView } from 'vue-router';
import KeerisHeader from './components/KeerisHeader.vue';
import { CuratorConsole } from '@curator/console';
import { keerisCuratorAdapter } from './curator-adapter';
import AudioBar from './components/AudioBar.vue';
import { requestGraphql, onWorkerReady, exportDatabase, importDatabase, onDatabaseChange } from '@wasm/graphql-client';

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
    alert('Export failed: ' + (err instanceof Error ? err.message : String(err)));
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
  if (!confirm(`Import '${file.name}' (${(file.size / (1024 * 1024)).toFixed(2)} MB) into storage? This will replace the current database and reload.`)) {
    e.target.value = '';
    return;
  }
  isImporting.value = true;
  try {
    await importDatabase(file);
    setTimeout(() => window.location.reload(), 400);
  } catch (err) {
    alert('Import failed: ' + (err instanceof Error ? err.message : String(err)));
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

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
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
</style>

