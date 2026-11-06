<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">Real-Time Host WebSocket Event Bus</h3>
        <div class="text-caption text-medium-emphasis">
          Streaming events from <code>/api/events</code> and Curator channel (tools, agents, turns, mesh)
        </div>
      </div>
      <div class="d-flex ga-2">
        <v-btn size="small" variant="text" prepend-icon="mdi-trash-can-outline" @click="$emit('clear')">
          Clear
        </v-btn>
      </div>
    </div>

    <div
      class="border rounded-lg pa-2 bg-surface-variant overflow-y-auto"
      style="max-height: 450px;"
    >
      <div v-if="eventLogs.length === 0" class="text-center py-8 text-caption text-medium-emphasis">
        Listening for real-time WebSocket events...
      </div>
      <div
        v-for="(evt, idx) in eventLogs"
        :key="idx"
        class="d-flex align-start ga-2 py-1 px-2 border-b"
      >
        <span class="text-caption font-monospace text-medium-emphasis" style="min-width: 75px;">
          {{ new Date(evt.timestamp || Date.now()).toLocaleTimeString() }}
        </span>
        <v-chip size="x-small" color="primary" variant="tonal" class="font-monospace">
          {{ evt.type }}
        </v-chip>
        <span class="text-caption font-monospace text-truncate text-high-emphasis flex-grow-1">
          {{ JSON.stringify(evt.payload || {}) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface EventLogEntry {
  type: string;
  payload: any;
  timestamp: number;
}

defineProps<{
  eventLogs: EventLogEntry[];
}>();

defineEmits<{
  (e: 'clear'): void;
}>();
</script>

