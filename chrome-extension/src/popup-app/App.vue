<template>
  <v-app theme="curatorDark" style="min-height: 100vh;">
    <!-- Header -->
    <v-app-bar flat height="52" color="transparent"
      style="border-bottom: 1px solid rgba(192,132,252,0.15); backdrop-filter: blur(12px);">
      <template #prepend>
        <div class="logo-glow ml-3">
          <v-icon icon="mdi-graph-outline" color="primary" size="22" />
        </div>
      </template>
      <v-app-bar-title>
        <span class="app-title">Curator</span>
        <span class="app-subtitle ml-1">Studio</span>
      </v-app-bar-title>
      <template #append>
        <v-chip
          :color="statusColor"
          size="x-small"
          variant="tonal"
          class="mr-3"
          :prepend-icon="statusIcon"
        >{{ statusLabel }}</v-chip>
      </template>
    </v-app-bar>

    <!-- Main content area -->
    <v-main style="overflow-y: auto;">
      <v-container style="max-width: 900px; padding: 16px;">
        <v-window v-model="tab" style="height: 100%;">
        <v-window-item value="stats">
          <StatsView />
        </v-window-item>
        <v-window-item value="data">
          <DataView />
        </v-window-item>
        <v-window-item value="console">
          <ConsoleView />
        </v-window-item>
        <v-window-item value="add">
          <AddView />
        </v-window-item>
        <v-window-item value="logs">
          <LogsView />
        </v-window-item>
        </v-window>
      </v-container>
    </v-main>

    <!-- Bottom Nav -->
    <v-bottom-navigation
      v-model="tab"
      bg-color="surface"
      mode="shift"
      height="56"
      style="border-top: 1px solid rgba(192,132,252,0.15);"
    >
      <v-btn value="stats" slim>
        <v-icon>mdi-chart-box-outline</v-icon>
        <span>Stats</span>
      </v-btn>
      <v-btn value="data" slim>
        <v-icon>mdi-database-outline</v-icon>
        <span>Data</span>
      </v-btn>
      <v-btn value="console" slim>
        <v-icon>mdi-console</v-icon>
        <span>Console</span>
      </v-btn>
      <v-btn value="add" slim>
        <v-icon>mdi-plus-circle-outline</v-icon>
        <span>Add</span>
      </v-btn>
      <v-btn value="logs" slim>
        <v-icon>mdi-format-list-bulleted</v-icon>
        <span>Logs</span>
      </v-btn>
    </v-bottom-navigation>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import StatsView from './views/StatsView.vue'
import DataView from './views/DataView.vue'
import ConsoleView from './views/ConsoleView.vue'
import AddView from './views/AddView.vue'
import LogsView from './views/LogsView.vue'

const tab = ref('stats')
const dbReady = ref<boolean | null>(null)

async function gql(query: string, variables: Record<string, unknown> = {}) {
  return new Promise<any>((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'GRAPHQL_REQUEST', payload: { query, variables } },
      (resp) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError)
        resolve(resp)
      }
    )
  })
}

onMounted(async () => {
  try {
    const resp = await gql(`query { resources { totalCount } }`)
    dbReady.value = !resp?.errors
  } catch {
    dbReady.value = false
  }
})

const statusColor = computed(() =>
  dbReady.value === null ? 'warning' : dbReady.value ? 'success' : 'error'
)
const statusIcon = computed(() =>
  dbReady.value === null ? 'mdi-loading' : dbReady.value ? 'mdi-check-circle' : 'mdi-alert-circle'
)
const statusLabel = computed(() =>
  dbReady.value === null ? 'Loading…' : dbReady.value ? 'DB Ready' : 'DB Error'
)

// Provide gql helper to child views via provide/inject
import { provide } from 'vue'
provide('gql', gql)
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

* { box-sizing: border-box; }

body {
  font-family: 'Inter', sans-serif;
  margin: 0;
  padding: 0;
  background: #09090b;
  overflow: hidden;
}

.app-title {
  font-weight: 700;
  font-size: 15px;
  background: linear-gradient(135deg, #c084fc 0%, #818cf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.app-subtitle {
  font-weight: 400;
  font-size: 12px;
  color: rgba(203, 213, 225, 0.5);
}
.logo-glow {
  background: rgba(192, 132, 252, 0.12);
  border: 1px solid rgba(192, 132, 252, 0.25);
  border-radius: 10px;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(192,132,252,0.3); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(192,132,252,0.5); }
</style>
