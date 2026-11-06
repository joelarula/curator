<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">Registered Curator Agents</h3>
        <div class="text-caption text-medium-emphasis">
          Agents queried via <code>query GetAgents { agents { name description schedule enabled } }</code>
        </div>
      </div>
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" @click="$emit('refresh')">
        Refresh Agents
      </v-btn>
    </div>

    <v-row>
      <v-col
        v-for="ag in agents"
        :key="ag.name"
        cols="12"
        md="6"
        lg="4"
      >
        <v-card variant="outlined" rounded="lg" hover class="fill-height d-flex flex-column pa-3 cursor-pointer transition-swing">
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="d-flex align-center ga-2">
              <v-icon color="primary" size="20">mdi-robot</v-icon>
              <span class="font-weight-bold text-subtitle-2">{{ ag.name }}</span>
            </div>
            <v-chip
              size="x-small"
              :color="ag.enabled ? 'success' : 'grey'"
              variant="flat"
              class="font-weight-bold"
            >
              {{ ag.enabled ? 'ENABLED' : 'DISABLED' }}
            </v-chip>
          </div>

          <div class="text-caption text-medium-emphasis flex-grow-1 mb-3">
            {{ ag.description || 'No description provided.' }}
          </div>

          <div class="d-flex align-center justify-space-between pt-2 border-t mt-auto">
            <v-chip size="x-small" variant="tonal" prepend-icon="mdi-clock-outline">
              {{ ag.schedule || 'manual' }}
            </v-chip>

            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-arrow-up-bold"
              @click="$emit('loadAgent', ag.name)"
            >
              Load in OpPrompt
            </v-btn>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  agents: any[];
}>();

defineEmits<{
  (e: 'refresh'): void;
  (e: 'loadAgent', name: string): void;
}>();
</script>

