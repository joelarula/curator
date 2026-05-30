<template>
  <div class="pa-3">
    <!-- Toolbar -->
    <div class="d-flex align-center justify-space-between mb-3">
      <span class="text-caption text-medium-emphasis font-weight-bold">System Event Logs</span>
      <div class="d-flex gap-1">
        <v-btn size="x-small" variant="tonal" color="error" prepend-icon="mdi-delete-outline" @click="clearLogs">
          Clear
        </v-btn>
        <v-btn size="x-small" variant="tonal" color="secondary" prepend-icon="mdi-download" @click="downloadLogs">
          Export
        </v-btn>
      </div>
    </div>

    <!-- Log list -->
    <div v-if="loading" class="text-center py-6">
      <v-progress-circular indeterminate color="primary" size="24" />
    </div>

    <div
      v-else-if="logs.length === 0"
      class="text-center py-6"
    >
      <v-icon icon="mdi-text-box-outline" size="32" color="surface-variant" class="mb-2" />
      <div class="text-caption text-disabled">No logs captured yet.</div>
    </div>

    <div
      v-else
      ref="logContainer"
      style="max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;"
    >
      <div
        v-for="(log, i) in logs"
        :key="i"
        class="log-entry pa-2"
        :class="`log-${log.level?.toLowerCase()}`"
      >
        <div class="d-flex align-center gap-2 mb-1">
          <v-chip
            :color="levelColor(log.level)"
            size="x-small"
            variant="tonal"
            label
          >{{ log.level }}</v-chip>
          <span class="log-source text-caption">{{ log.source }}</span>
          <span class="log-time ml-auto">{{ formatTime(log.timestamp) }}</span>
        </div>
        <div class="log-message">{{ log.message }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

interface LogEntry {
  timestamp: string
  level: string
  source: string
  message: string
  data?: any
}

const logs = ref<LogEntry[]>([])
const loading = ref(true)
const logContainer = ref<HTMLElement | null>(null)

function levelColor(level: string) {
  switch (level?.toUpperCase()) {
    case 'ERROR': return 'error'
    case 'WARN':  return 'warning'
    case 'INFO':  return 'success'
    default:      return 'secondary'
  }
}

function formatTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fetchLogs() {
  loading.value = true
  chrome.storage.local.get(['curator_logs'], (result) => {
    logs.value = (result.curator_logs || []).slice().reverse()
    loading.value = false
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = 0
      }
    })
  })
}

function clearLogs() {
  chrome.storage.local.set({ curator_logs: [] }, () => {
    logs.value = []
  })
}

function downloadLogs() {
  const content = JSON.stringify(logs.value.slice().reverse(), null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `curator-logs-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(fetchLogs)
</script>

<style scoped>
.log-entry {
  border-radius: 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  font-family: 'Courier New', monospace;
}
.log-entry.log-error { border-color: rgba(248,113,113,0.2); background: rgba(248,113,113,0.04); }
.log-entry.log-warn  { border-color: rgba(251,146,60,0.2);  background: rgba(251,146,60,0.04);  }
.log-entry.log-info  { border-color: rgba(52,211,153,0.15); background: rgba(52,211,153,0.03);  }

.log-message { font-size: 11px; color: rgba(203,213,225,0.9); word-break: break-all; }
.log-source  { font-size: 10px; color: rgba(129,140,248,0.8); font-weight: 600; }
.log-time    { font-size: 10px; color: rgba(148,163,184,0.5); }
</style>
