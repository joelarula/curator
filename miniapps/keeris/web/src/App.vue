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
      </header>

      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component :is="Component" @play-track="handlePlayTrack" />
        </KeepAlive>
      </RouterView>
    </main>

    <!-- Curator AST Agent Drawer -->
    <CuratorDrawer v-model="drawerOpen" />

    <!-- Audio Playback Footer Bar -->
    <AudioBar :current-track="activeTrack" @close="activeTrack = null" />
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import KeerisHeader from './components/KeerisHeader.vue';
import CuratorDrawer from './components/CuratorDrawer.vue';
import AudioBar from './components/AudioBar.vue';
import { requestGraphql, onWorkerReady } from '@wasm/graphql-client.js';

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
