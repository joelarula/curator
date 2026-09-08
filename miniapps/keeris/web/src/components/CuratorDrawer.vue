<template>
  <v-navigation-drawer
    :model-value="modelValue"
    location="right"
    width="420"
    color="surface"
    elevation="4"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="pa-4 d-flex align-center justify-space-between border-b">
      <div class="d-flex align-center">
        <v-icon icon="mdi-robot" color="primary" class="mr-2" />
        <span class="text-h6 font-weight-bold">Curator AST Engine</span>
      </div>
      <v-btn icon="mdi-close" variant="text" size="small" @click="$emit('update:modelValue', false)" />
    </div>

    <div class="pa-4">
      <div class="text-subtitle-2 font-weight-bold mb-2">Active Curator Agents (In-Worker Wasm)</div>
      
      <v-card v-for="agent in agents" :key="agent.id" variant="tonal" color="surface-variant" class="mb-3 pa-3">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="font-weight-bold">{{ agent.name }}</div>
          <v-chip size="x-small" :color="agent.isActive ? 'success' : 'grey'" variant="flat">
            {{ agent.isActive ? 'Active Schedule' : 'Inactive' }}
          </v-chip>
        </div>
        <div class="text-caption text-medium-emphasis mb-3">Cron Schedule: {{ agent.schedule }}</div>
        
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          block
          prepend-icon="mdi-play"
          :loading="triggering[agent.name]"
          @click="triggerAgent(agent.name)"
        >
          Trigger Indexing Task
        </v-btn>
      </v-card>

      <v-divider class="my-4" />

      <div class="d-flex align-center justify-space-between mb-2">
        <span class="text-subtitle-2 font-weight-bold">AST Execution History</span>
        <v-btn icon="mdi-refresh" variant="text" size="x-small" @click="fetchRequests" />
      </div>

      <div v-if="requests.length === 0" class="text-caption text-medium-emphasis py-4 text-center">
        No AST workflow execution requests logged yet in OPFS SQLite.
      </div>

      <v-expansion-panels v-else variant="inset">
        <v-expansion-panel v-for="req in requests" :key="req.id">
          <v-expansion-panel-title>
            <div class="d-flex align-center justify-space-between w-100 mr-2">
              <span class="text-caption font-mono">{{ req.id }}</span>
              <v-chip size="x-small" :color="req.status === 'completed' ? 'success' : 'warning'" variant="tonal">
                {{ req.status }}
              </v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="text-caption text-medium-emphasis mb-1">Created: {{ req.createdAt }}</div>
            <div v-for="resp in req.responses" :key="resp.id" class="pa-2 rounded bg-background text-caption font-mono mt-2" style="white-space: pre-wrap;">
              {{ resp.content }}
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>
  </v-navigation-drawer>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { requestGraphql, onWorkerReady } from '@wasm/graphql-client.js';

defineProps({
  modelValue: Boolean,
});

defineEmits(['update:modelValue']);

const agents = ref([]);
const requests = ref([]);
const triggering = ref({});

async function fetchAgents() {
  try {
    const data = await requestGraphql(`
      query GetCuratorAgents {
        curatorAgents {
          id
          name
          schedule
          isActive
        }
      }
    `);
    agents.value = data.curatorAgents || [];
  } catch (err) {
    console.error('[CuratorDrawer] Failed to fetch agents:', err);
  }
}

async function fetchRequests() {
  try {
    const data = await requestGraphql(`
      query GetCuratorRequests {
        curatorRequests(limit: 10) {
          id
          ast
          status
          createdAt
          responses {
            id
            content
            createdAt
          }
        }
      }
    `);
    requests.value = data.curatorRequests || [];
  } catch (err) {
    console.error('[CuratorDrawer] Failed to fetch requests:', err);
  }
}

async function triggerAgent(agentName) {
  triggering.value[agentName] = true;
  try {
    await requestGraphql(`
      mutation TriggerAgent($agentName: String!) {
        triggerCuratorAgent(agentName: $agentName) {
          id
          status
        }
      }
    `, { agentName });

    setTimeout(() => {
      fetchRequests();
      triggering.value[agentName] = false;
    }, 1500);
  } catch (err) {
    console.error('[CuratorDrawer] Failed to trigger agent:', err);
    triggering.value[agentName] = false;
  }
}

onMounted(() => {
  onWorkerReady(() => {
    fetchAgents();
    fetchRequests();
  });
});
</script>
