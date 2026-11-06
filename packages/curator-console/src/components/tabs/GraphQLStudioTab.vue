<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">Interactive GraphQL Studio</h3>
        <div class="text-caption text-medium-emphasis">
          Direct execution endpoint: <code>POST /graphql</code>
        </div>
      </div>

      <div class="d-flex align-center ga-2 flex-wrap">
        <v-select
          v-model="selectedPreset"
          :items="presetItems"
          label="Query Presets"
          density="compact"
          variant="outlined"
          hide-details
          style="min-width: 220px;"
          @update:model-value="onPresetSelected"
        />
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          prepend-icon="mdi-play"
          :loading="executing"
          @click="executeStudio"
        >
          Execute
        </v-btn>
      </div>
    </div>

    <v-row>
      <v-col cols="12" md="6">
        <v-textarea
          v-model="queryText"
          label="GraphQL Query / Mutation"
          rows="14"
          variant="outlined"
          class="font-monospace mb-2"
          hide-details
        />
      </v-col>

      <v-col cols="12" md="6">
        <v-card variant="tonal" rounded="lg" class="pa-3 fill-height d-flex flex-column border" color="surface">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-caption font-weight-bold text-medium-emphasis">JSON RESPONSE</span>
            <v-btn
              v-if="result"
              size="x-small"
              variant="text"
              icon="mdi-content-copy"
              @click="copyResult"
            />
          </div>
          <pre
            class="font-monospace text-caption pa-2 flex-grow-1 rounded bg-surface-variant text-cyan-accent-2 overflow-auto"
            style="max-height: 380px;"
          >{{ result ? JSON.stringify(result, null, 2) : '// GraphQL JSON Response will render here...' }}</pre>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CuratorConsoleAdapter } from '../../types';
import { PRESET_GRAPHQL_QUERIES } from '../../graphqlOperations';

const props = defineProps<{
  adapter?: CuratorConsoleAdapter;
}>();

const presetItems = [
  { title: 'Overview & Metrics', value: 'metrics' },
  { title: 'Tools & Agents', value: 'tools_agents' },
  { title: 'Curator Requests', value: 'requests' },
  { title: 'Database Health', value: 'databaseHealth' },
];

const selectedPreset = ref('metrics');
const queryText = ref(PRESET_GRAPHQL_QUERIES['metrics'] || '');
const result = ref<any>(null);
const executing = ref(false);

function onPresetSelected(val: string) {
  if (PRESET_GRAPHQL_QUERIES[val]) {
    queryText.value = PRESET_GRAPHQL_QUERIES[val];
  }
}

async function executeStudio() {
  executing.value = true;
  result.value = null;
  try {
    if (props.adapter?.executeGraphql) {
      result.value = await props.adapter.executeGraphql(queryText.value);
    } else {
      const res = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText.value }),
      });
      result.value = await res.json();
    }
  } catch (err: any) {
    result.value = { errors: [{ message: err.message || 'GraphQL execution error' }] };
  } finally {
    executing.value = false;
  }
}

function copyResult() {
  if (result.value) {
    navigator.clipboard?.writeText(JSON.stringify(result.value, null, 2));
  }
}
</script>

