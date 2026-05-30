<template>
  <div class="pa-3">
    <!-- Template selector + Execute -->
    <div class="d-flex gap-2 mb-2 align-center">
      <v-select
        v-model="selectedTemplate"
        :items="templates"
        item-title="label"
        item-value="query"
        label="Template"
        hide-details
        density="compact"
        style="flex: 1;"
        @update:model-value="query = selectedTemplate"
      />
      <v-btn
        color="primary"
        size="small"
        :loading="running"
        icon="mdi-play"
        @click="execute"
      />
    </div>

    <!-- Query editor -->
    <v-textarea
      v-model="query"
      label="GraphQL Query"
      rows="5"
      class="mono mb-2"
      hide-details
      auto-grow
      style="font-family: 'Courier New', monospace; font-size: 12px;"
    />

    <!-- Status chip -->
    <div class="d-flex align-center justify-space-between mb-2">
      <span class="text-caption text-medium-emphasis">Response</span>
      <v-chip
        v-if="status"
        :color="status === 'success' ? 'success' : status === 'error' ? 'error' : 'warning'"
        size="x-small"
        variant="tonal"
        :prepend-icon="status === 'success' ? 'mdi-check' : status === 'error' ? 'mdi-alert' : 'mdi-loading mdi-spin'"
      >{{ status === 'running' ? 'Executing…' : status }}</v-chip>
      <v-btn v-if="result" size="x-small" variant="text" icon="mdi-content-copy" @click="copy" />
    </div>

    <!-- Result output -->
    <v-sheet
      rounded="lg"
      class="pa-3"
      color="surface-variant"
      style="max-height: 200px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; line-height: 1.5;"
    >
      <span v-if="!result" style="opacity: 0.4;">Run a query to see results…</span>
      <span :style="{ color: resultColor }">{{ result }}</span>
    </v-sheet>

    <v-snackbar v-model="copied" :timeout="1500" color="success" location="top">
      <v-icon icon="mdi-check" class="mr-1" /> Copied to clipboard
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'

const gql = inject<(q: string, v?: any) => Promise<any>>('gql')!

const templates = [
  { label: 'List Resources',      query: `query { resources { items { id uri title createdAt } totalCount } }` },
  { label: 'List Relations',      query: `query { relations { id subjectId predicateId objectId literalValue } }` },
  { label: 'List Texts',          query: `query { texts { items { id content resourceId } totalCount } }` },
  { label: 'Stats',               query: `query {\n  resources { totalCount }\n  relations { id }\n  texts { totalCount }\n}` },
]

const selectedTemplate = ref(templates[0].query)
const query = ref(templates[0].query)
const result = ref('')
const status = ref<'success' | 'error' | 'running' | ''>('')
const running = ref(false)
const copied = ref(false)

const resultColor = computed(() =>
  status.value === 'error' ? 'rgb(248,113,113)' : 'rgb(203,213,225)'
)

async function execute() {
  if (!query.value.trim()) return
  running.value = true
  status.value = 'running'
  result.value = ''
  try {
    const resp = await gql(query.value.trim())
    result.value = JSON.stringify(resp, null, 2)
    status.value = resp?.errors?.length ? 'error' : 'success'
  } catch (err: any) {
    result.value = err.message
    status.value = 'error'
  } finally {
    running.value = false
  }
}

async function copy() {
  await navigator.clipboard.writeText(result.value)
  copied.value = true
}
</script>
