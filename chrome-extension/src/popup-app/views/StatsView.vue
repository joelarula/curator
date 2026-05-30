<template>
  <div class="pa-3">
    <!-- Stat cards row -->
    <v-row dense class="mb-2">
      <v-col v-for="stat in stats" :key="stat.label" cols="4">
        <v-card
          class="stat-card pa-3 text-center"
          variant="tonal"
          :color="stat.color"
          height="80"
        >
          <div class="stat-value">{{ stat.loading ? '…' : stat.value }}</div>
          <div class="stat-label">{{ stat.label }}</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Status row -->
    <v-card variant="outlined" class="pa-3 mb-2" style="border-color: rgba(192,132,252,0.2);">
      <div class="d-flex align-center justify-space-between mb-2">
        <span class="text-caption text-medium-emphasis font-weight-bold">System Status</span>
        <v-btn
          size="x-small"
          variant="text"
          icon="mdi-refresh"
          :loading="refreshing"
          @click="refresh"
        />
      </div>
      <div class="d-flex gap-2 flex-wrap">
        <v-chip
          v-for="s in systemStatus"
          :key="s.label"
          :color="s.color"
          size="x-small"
          variant="tonal"
          :prepend-icon="s.icon"
        >{{ s.label }}</v-chip>
      </div>
    </v-card>

    <!-- Recent resources mini-list -->
    <v-card variant="outlined" class="pa-3" style="border-color: rgba(129,140,248,0.2);">
      <div class="text-caption text-medium-emphasis font-weight-bold mb-2">Recent Resources</div>
      <div v-if="recentLoading" class="text-center py-2">
        <v-progress-circular size="20" indeterminate color="primary" />
      </div>
      <div v-else-if="recent.length === 0" class="text-caption text-disabled text-center py-2">
        No resources yet. Right-click a page to add one.
      </div>
      <v-list v-else density="compact" bg-color="transparent" class="pa-0">
        <v-list-item
          v-for="r in recent"
          :key="r.id"
          class="px-0 py-1"
          density="compact"
        >
          <template #prepend>
            <v-icon icon="mdi-link-variant" size="14" color="primary" class="mr-2 mt-1" />
          </template>
          <v-list-item-title class="text-caption" style="font-size: 11px !important;">
            {{ r.title || r.uri }}
          </v-list-item-title>
          <v-list-item-subtitle style="font-size: 10px; opacity: 0.5;">
            {{ truncate(r.uri, 40) }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'

const gql = inject<(q: string, v?: any) => Promise<any>>('gql')!

interface Stat { label: string; value: number | string; color: string; loading: boolean }

const stats = ref<Stat[]>([
  { label: 'Resources', value: 0, color: 'primary', loading: true },
  { label: 'Relations', value: 0, color: 'secondary', loading: true },
  { label: 'Texts',     value: 0, color: 'accent',    loading: true },
])

const systemStatus = ref([
  { label: 'SQLite WASM', color: 'success', icon: 'mdi-database-check' },
  { label: 'GraphQL',     color: 'success', icon: 'mdi-graphql'         },
  { label: 'Extension',   color: 'success', icon: 'mdi-puzzle-check'    },
])

const recent = ref<any[]>([])
const recentLoading = ref(true)
const refreshing = ref(false)

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s
}

async function fetchStats() {
  try {
    // resources and texts return { items, totalCount }
    // relations returns a plain Relation[] array — count via length
    const resp = await gql(`
      query GetStats {
        resources { totalCount }
        relations { id }
        texts      { totalCount }
      }
    `)
    if (resp?.data) {
      stats.value[0].value = resp.data.resources?.totalCount ?? 0
      stats.value[1].value = Array.isArray(resp.data.relations) ? resp.data.relations.length : 0
      stats.value[2].value = resp.data.texts?.totalCount     ?? 0
      stats.value.forEach(s => (s.loading = false))

      if (resp.errors?.length) {
        systemStatus.value[1].color = 'warning'
      }
    }
  } catch {
    stats.value.forEach(s => { s.value = '?'; s.loading = false })
    systemStatus.value[1].color = 'error'
    systemStatus.value[1].icon = 'mdi-graphql'
  }
}

async function fetchRecent() {
  recentLoading.value = true
  try {
    const resp = await gql(`
      query GetRecent {
        resources(limit: 5) { items { id uri title } }
      }
    `)
    recent.value = resp?.data?.resources?.items ?? []
  } catch {
    recent.value = []
  } finally {
    recentLoading.value = false
  }
}

async function refresh() {
  refreshing.value = true
  await Promise.all([fetchStats(), fetchRecent()])
  refreshing.value = false
}

onMounted(refresh)
</script>

<style scoped>
.stat-card { transition: transform 0.15s ease; cursor: default; }
.stat-card:hover { transform: translateY(-2px); }
.stat-value { font-size: 22px; font-weight: 700; line-height: 1.2; }
.stat-label { font-size: 10px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }
</style>
