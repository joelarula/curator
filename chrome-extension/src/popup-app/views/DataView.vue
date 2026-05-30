<template>
  <div class="pa-3">
    <!-- Search + Refresh -->
    <div class="d-flex gap-2 mb-3 align-center">
      <v-text-field
        v-model="search"
        label="Search resources…"
        prepend-inner-icon="mdi-magnify"
        hide-details
        clearable
        density="compact"
        style="flex: 1;"
      />
      <v-btn icon="mdi-refresh" size="small" variant="tonal" :loading="loading" @click="fetchData" />
    </div>

    <!-- List -->
    <div v-if="loading" class="text-center py-6">
      <v-progress-circular indeterminate color="primary" size="32" />
      <div class="text-caption text-disabled mt-2">Loading resources…</div>
    </div>

    <div v-else-if="filtered.length === 0" class="text-center py-6">
      <v-icon icon="mdi-database-off-outline" size="36" color="surface-variant" class="mb-2" />
      <div class="text-caption text-disabled">
        {{ search ? 'No matches found.' : 'No resources saved yet.' }}
      </div>
    </div>

    <v-list v-else density="compact" bg-color="transparent" class="pa-0">
      <v-list-item
        v-for="r in filtered"
        :key="r.id"
        class="resource-item mb-1 px-3 py-2"
        rounded="lg"
        :href="r.uri"
        target="_blank"
      >
        <template #prepend>
          <v-avatar size="28" color="primary" variant="tonal" class="mr-2">
            <v-icon icon="mdi-link-variant" size="14" />
          </v-avatar>
        </template>
        <v-list-item-title class="text-body-2 font-weight-medium" style="font-size: 12px !important;">
          {{ r.title || '(untitled)' }}
        </v-list-item-title>
        <v-list-item-subtitle style="font-size: 10px;">
          {{ truncate(r.uri, 45) }}
        </v-list-item-subtitle>
        <template #append>
          <v-chip size="x-small" variant="tonal" color="secondary" class="ml-1">
            {{ formatDate(r.createdAt) }}
          </v-chip>
        </template>
      </v-list-item>
    </v-list>

    <!-- Total count footer -->
    <div v-if="!loading && total > 0" class="text-caption text-disabled text-center mt-2">
      Showing {{ filtered.length }} of {{ total }} resources
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'

const gql = inject<(q: string, v?: any) => Promise<any>>('gql')!

const resources = ref<any[]>([])
const search = ref('')
const loading = ref(false)
const total = ref(0)

const filtered = computed(() => {
  if (!search.value) return resources.value
  const q = search.value.toLowerCase()
  return resources.value.filter(
    r => r.title?.toLowerCase().includes(q) || r.uri?.toLowerCase().includes(q)
  )
})

function truncate(s: string, max: number) {
  return s && s.length > max ? s.slice(0, max) + '…' : (s || '')
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

async function fetchData() {
  loading.value = true
  try {
    const resp = await gql(`
      query GetResources {
        resources(limit: 100) {
          items { id uri title createdAt }
          totalCount
        }
      }
    `)
    resources.value = resp?.data?.resources?.items ?? []
    total.value = resp?.data?.resources?.totalCount ?? 0
  } catch {
    resources.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
</script>

<style scoped>
.resource-item {
  border: 1px solid rgba(129,140,248,0.1);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.resource-item:hover {
  background: rgba(192,132,252,0.06) !important;
  border-color: rgba(192,132,252,0.25);
}
</style>
