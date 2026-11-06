<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">Host &amp; MCP Tool Catalogue</h3>
        <div class="text-caption text-medium-emphasis">
          Tools registered on Curator Host queried via <code>query GetTools { tools { name description accessLevel parameters } }</code>
        </div>
      </div>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" @click="$emit('refresh')">
        Refresh Tools
      </v-btn>
    </div>

    <v-row>
      <v-col
        v-for="tool in tools"
        :key="tool.name"
        cols="12"
        md="6"
      >
        <v-card variant="outlined" rounded="lg" hover class="pa-3 cursor-pointer transition-swing">
          <div class="d-flex align-center justify-space-between mb-1">
            <div class="d-flex align-center ga-2">
              <v-icon color="secondary" size="18">mdi-wrench</v-icon>
              <span class="font-weight-bold font-monospace text-subtitle-2 text-primary">{{ tool.name }}</span>
            </div>
            <v-chip size="x-small" variant="outlined" color="info">
              {{ tool.accessLevel || 'domain' }}
            </v-chip>
          </div>

          <div class="text-caption text-medium-emphasis mb-2">
            {{ tool.description || 'No description provided.' }}
          </div>

          <v-expansion-panels variant="accordion" class="mb-2">
            <v-expansion-panel density="compact" title="JSON Schema Parameters">
              <v-expansion-panel-text>
                <pre class="font-monospace text-caption pa-2 rounded bg-surface-variant overflow-auto">{{ JSON.stringify(tool.parameters || {}, null, 2) }}</pre>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <div class="d-flex justify-end pt-2 border-t">
            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-lightning-bolt"
              @click="$emit('loadTool', tool)"
            >
              Load in OpPrompt Runner
            </v-btn>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  tools: any[];
}>();

defineEmits<{
  (e: 'refresh'): void;
  (e: 'loadTool', tool: any): void;
}>();
</script>

