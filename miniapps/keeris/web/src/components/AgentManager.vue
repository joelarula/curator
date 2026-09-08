<template>
  <v-card color="surface" variant="outlined" class="pa-4 rounded-lg mt-4">
    <v-card-title class="d-flex align-center justify-space-between pb-2">
      <div class="d-flex align-center">
        <v-icon icon="mdi-robot-industrial" color="primary" class="mr-2" />
        <span class="text-h6 font-weight-bold">Program Agents & Scrapers Control</span>
      </div>

      <v-btn
        color="primary"
        variant="tonal"
        size="small"
        prepend-icon="mdi-refresh"
        :loading="loading"
        @click="fetchAgents"
      >
        Refresh Agents
      </v-btn>
    </v-card-title>

    <v-card-text class="pt-2">
      <div class="text-body-2 text-medium-emphasis mb-4">
        Toggle individual ERR program scraper agents on or off. Active agents run background AST workflow tasks in the Wasm Web Worker on OPFS SQLite.
      </div>

      <v-row>
        <v-col v-for="agent in agents" :key="agent.id" cols="12" md="4">
          <v-card variant="outlined" :color="agent.isActive ? 'primary' : 'surface-variant'" class="pa-4 rounded-lg">
            <div class="d-flex align-center justify-space-between mb-3">
              <div class="d-flex align-center">
                <v-avatar :color="agent.isActive ? 'primary' : 'grey'" size="36" class="mr-3">
                  <v-icon icon="mdi-robot" color="white" />
                </v-avatar>
                <div>
                  <div class="font-weight-bold text-subtitle-1">{{ agent.name }}</div>
                  <div class="text-caption text-medium-emphasis">Cron: {{ agent.schedule }}</div>
                </div>
              </div>

              <!-- ON / OFF Toggle Switch -->
              <v-switch
                :model-value="agent.isActive"
                color="primary"
                hide-details
                density="compact"
                :loading="toggling[agent.id]"
                @update:model-value="toggleAgent(agent, $event)"
              />
            </div>

            <v-divider class="my-3" />

            <!-- Agent Summary Stats -->
            <div class="d-flex justify-space-between text-caption text-medium-emphasis mb-1">
              <span>Status:</span>
              <span :class="agent.isActive ? 'text-success font-weight-bold' : 'text-grey'">
                {{ agent.isActive ? 'ENABLED (ACTIVE)' : 'DISABLED (OFF)' }}
              </span>
            </div>

            <div class="d-flex justify-space-between text-caption text-medium-emphasis mb-1">
              <span>Indexed Episodes:</span>
              <span class="font-weight-bold text-high-emphasis">{{ agent.episodesCount || 0 }}</span>
            </div>

            <div class="d-flex justify-space-between text-caption text-medium-emphasis mb-1">
              <span>Tracks Cataloged:</span>
              <span class="font-weight-bold text-high-emphasis">{{ agent.tracksCount || 0 }}</span>
            </div>

            <div class="d-flex justify-space-between text-caption text-medium-emphasis mb-3">
              <span>Last Execution:</span>
              <span class="text-caption">{{ agent.lastRunAt || 'Never' }}</span>
            </div>

            <v-btn
              color="primary"
              variant="flat"
              block
              size="small"
              prepend-icon="mdi-play"
              :disabled="!agent.isActive"
              :loading="running[agent.name]"
              @click="runAgentScraper(agent.name)"
            >
              Run Scraper Task Now
            </v-btn>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { requestGraphql, onWorkerReady } from '@wasm/graphql-client.js';

const agents = ref([]);
const loading = ref(false);
const toggling = ref({});
const running = ref({});

async function fetchAgents() {
  loading.value = true;
  try {
    const data = await requestGraphql(`
      query GetAgentsSummary {
        curatorAgents {
          id
          name
          schedule
          isActive
          episodesCount
          tracksCount
          lastRunAt
        }
      }
    `);
    agents.value = data.curatorAgents || [];
  } catch (err) {
    console.error('[AgentManager] Failed to fetch agents:', err);
  } finally {
    loading.value = false;
  }
}

async function toggleAgent(agent, newStatus) {
  toggling.value[agent.id] = true;
  try {
    await requestGraphql(`
      mutation ToggleAgent($id: ID!, $isActive: Boolean!) {
        toggleCuratorAgent(id: $id, isActive: $isActive) {
          id
          isActive
        }
      }
    `, { id: agent.id, isActive: newStatus });
    await fetchAgents();
  } catch (err) {
    console.error('[AgentManager] Failed to toggle agent:', err);
  } finally {
    toggling.value[agent.id] = false;
  }
}

async function runAgentScraper(agentName) {
  running.value[agentName] = true;
  try {
    await requestGraphql(`
      mutation RunAgent($agentName: String!) {
        triggerCuratorAgent(agentName: $agentName) {
          id
          status
        }
      }
    `, { agentName });
    setTimeout(() => {
      fetchAgents();
      running.value[agentName] = false;
    }, 2000);
  } catch (err) {
    console.error('[AgentManager] Failed to run agent scraper:', err);
    running.value[agentName] = false;
  }
}

onMounted(() => {
  onWorkerReady(() => {
    fetchAgents();
  });
});
</script>
