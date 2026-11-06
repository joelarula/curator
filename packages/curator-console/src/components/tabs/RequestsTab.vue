<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">Recent AST Execution Requests</h3>
        <div class="text-caption text-medium-emphasis">
          Queried via <code>query GetCuratorRequests { curatorRequests { id status ast responses { content } } }</code>
        </div>
      </div>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" @click="$emit('refresh')">
        Refresh Requests
      </v-btn>
    </div>

    <div v-if="requests.length === 0" class="text-center py-6 text-medium-emphasis text-caption">
      No recent AST execution requests found in the database.
    </div>

    <v-expansion-panels v-else variant="inset" class="mb-4">
      <v-expansion-panel
        v-for="req in requests"
        :key="req.id"
        density="compact"
      >
        <v-expansion-panel-title>
          <div class="d-flex align-center justify-space-between w-100 pe-3 flex-wrap ga-2">
            <div class="d-flex align-center ga-2">
              <v-chip
                size="x-small"
                :color="req.status === 'COMPLETED' ? 'success' : req.status === 'RUNNING' ? 'primary' : req.status === 'WAITING_FOR_USER' ? 'warning' : req.status === 'FAILED' ? 'error' : 'grey'"
                variant="flat"
                class="font-weight-bold"
              >
                {{ req.status }}
              </v-chip>
              <span class="font-monospace text-caption text-high-emphasis">#{{ req.id }}</span>
              <span v-if="req.agentName" class="text-caption text-primary">🤖 {{ req.agentName }}</span>
              <span v-else-if="req.toolName" class="text-caption text-secondary">🛠️ {{ req.toolName }}</span>
            </div>

            <div class="text-caption text-medium-emphasis">
              {{ new Date(req.createdAt).toLocaleTimeString() }}
            </div>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <div class="pa-2">
            <div v-if="req.responses && req.responses.length > 0" class="mb-3">
              <div class="text-caption font-weight-bold text-success mb-1">Recorded Response:</div>
              <pre class="font-monospace text-caption pa-2 rounded bg-surface-variant text-high-emphasis overflow-auto">{{ req.responses[0].content }}</pre>
            </div>

            <div class="text-caption font-weight-bold text-medium-emphasis mb-1">AST Tree Payload:</div>
            <pre class="font-monospace text-caption pa-2 rounded bg-surface-variant text-cyan-accent-2 overflow-auto" style="max-height: 250px;">{{ JSON.stringify(req.ast || {}, null, 2) }}</pre>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  requests: any[];
}>();

defineEmits<{
  (e: 'refresh'): void;
}>();
</script>

