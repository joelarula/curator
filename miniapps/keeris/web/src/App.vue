<template>
  <v-app theme="light">
    <main class="shell">
      <header class="masthead">
        <div class="brand">
          <h1>ERR Archive Index</h1>
        </div>
        <nav class="nav-tabs" aria-label="Main Navigation">
          <button :class="{ active: activeTab === 'songs' }" @click="activeTab = 'songs'"> 🎵 Songs &amp; Airings </button>
          <button :class="{ active: activeTab === 'summary' }" @click="activeTab = 'summary'"> 📊 Program Summary </button>
          <button :class="{ active: activeTab === 'playlists' }" @click="activeTab = 'playlists'"> 📋 Playlists </button>
          <button :class="{ active: activeTab === 'agents' }" @click="activeTab = 'agents'"> 🤖 Program Agents </button>
        </nav>
      </header>

      <div v-if="activeTab === 'songs'">
        <TrackTable @play-track="handlePlayTrack" />
      </div>
      <div v-else-if="activeTab === 'summary'">
        <ProgramSummary />
      </div>
      <div v-else-if="activeTab === 'playlists'">
        <PlaylistManager />
      </div>
      <div v-else-if="activeTab === 'agents'">
        <AgentManager />
      </div>
    </main>

    <!-- Curator AST Agent Drawer -->
    <CuratorDrawer v-model="drawerOpen" />

    <!-- Audio Playback Footer Bar -->
    <AudioBar :current-track="activeTrack" @close="activeTrack = null" />
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import KeerisHeader from './components/KeerisHeader.vue';
import TrackTable from './components/TrackTable.vue';
import ProgramSummary from './components/ProgramSummary.vue';
import PlaylistManager from './components/PlaylistManager.vue';
import AgentManager from './components/AgentManager.vue';
import CuratorDrawer from './components/CuratorDrawer.vue';
import AudioBar from './components/AudioBar.vue';
import { requestGraphql, onWorkerReady } from '@wasm/graphql-client.js';

const activeTab = ref('songs');
const drawerOpen = ref(false);
const activeTrack = ref(null);
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

onMounted(() => {
  onWorkerReady(() => {
    fetchStats();
  });
});
</script>
