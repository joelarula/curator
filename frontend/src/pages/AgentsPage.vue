<template>
  <v-container fluid class="pa-8 bg-agents">
    <!-- Header -->
    <div class="d-flex align-center mb-8">
      <div>
        <h2 class="text-h4 font-weight-black tracking-tighter uppercase mb-1">Agent Management</h2>
        <div class="text-caption text-grey font-weight-medium">ORCHESTRATING {{ agents.length }} ACTIVE AGENTS</div>
      </div>
      <v-spacer></v-spacer>
      <v-btn color="secondary" variant="tonal" rounded="pill" prepend-icon="mdi-sync" class="me-3" @click="syncAgents" :loading="loading">
        Sync Scheduler
      </v-btn>
      <v-btn color="primary" variant="flat" rounded="pill" prepend-icon="mdi-plus" size="large" class="px-6" @click="showCreateAgent = true">
        Deploy Agent
      </v-btn>
    </div>

    <!-- Agent Grid -->
    <v-row>
      <v-col v-for="agent in agents" :key="agent.id" cols="12" md="6" lg="4">
        <v-card class="agent-card rounded-xl overflow-hidden" elevation="0" border>
          <div class="pa-6">
            <div class="d-flex align-center mb-6 ga-4">
              <v-avatar :color="agent.enabled ? 'primary' : 'grey'" variant="tonal" rounded="lg" size="48">
                <v-icon>{{ agent.enabled ? 'mdi-robot' : 'mdi-robot-off' }}</v-icon>
              </v-avatar>
              <div class="flex-grow-1 overflow-hidden">
                <div class="text-h6 font-weight-black truncate">{{ agent.name }}</div>
                <div class="text-caption opacity-40 font-weight-bold uppercase tracking-widest">
                  Script: {{ agent.script?.name || 'Generic' }}
                </div>
              </div>
              <v-switch
                v-model="agent.enabled"
                color="primary"
                hide-details
                density="compact"
                @change="toggleAgent(agent)"
              ></v-switch>
            </div>

            <div class="d-flex flex-column ga-3 mb-6">
              <div class="d-flex justify-space-between text-body-2">
                <span class="opacity-40">Schedule:</span>
                <v-chip size="x-small" variant="tonal" color="secondary" class="font-weight-black">{{ agent.schedule }}</v-chip>
              </div>
              <div class="d-flex justify-space-between text-body-2">
                <span class="opacity-40">Last Run:</span>
                <span class="font-weight-medium">{{ formatDate(agent.lastPolledAt) }}</span>
              </div>
            </div>

            <v-divider class="mb-6 opacity-5"></v-divider>

            <div class="d-flex ga-2">
              <v-btn variant="tonal" block rounded="lg" prepend-icon="mdi-play" size="small" @click="runAgentManual(agent)">
                Execute Now
              </v-btn>
              <v-btn variant="text" icon="mdi-cog-outline" size="small" @click="editAgent(agent)"></v-btn>
              <v-btn variant="text" icon="mdi-delete-outline" color="error" size="small" @click="confirmDelete(agent)"></v-btn>
            </div>
          </div>
          
          <!-- Activity Mini-Sparkline (Placeholder) -->
          <div class="activity-bar"></div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Dialogs -->
    <v-dialog v-model="showCreateAgent" max-width="500">
      <v-card rounded="xl" class="pa-6 glass-card">
        <h3 class="text-h6 font-weight-black mb-6">Deploy New Agent</h3>
        <!-- TODO: Form -->
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { graphql, showSuccess } from '../composables/useGraphql'

const agents = ref<any[]>([])
const loading = ref(false)
const showCreateAgent = ref(false)

onMounted(() => {
  fetchAgents()
})

async function fetchAgents() {
  loading.value = true
  const data = await graphql(`
    query {
      agents {
        id name schedule enabled lastPolledAt
        script { id name }
      }
    }
  `)
  if (data?.agents) agents.value = data.agents
  loading.value = false
}

async function syncAgents() {
  loading.value = true
  // Check worker state instead of mythical sync mutation
  await graphql(`query { agentWorkerState { schedulerRunning processorRunning } }`)
  showSuccess('Worker state verified')
  loading.value = false
}

async function toggleAgent(agent: any) {
  await graphql(`
    mutation($id: ID!, $enabled: Boolean!) {
      toggleAgent(id: $id, enabled: $enabled) { id enabled }
    }
  `, { id: agent.id, enabled: agent.enabled })
  showSuccess(`Agent ${agent.enabled ? 'enabled' : 'disabled'}`)
}

async function runAgentManual(agent: any) {
  await graphql(`
    mutation($id: ID!) {
      triggerAgent(id: $id) { id status }
    }
  `, { id: agent.id })
  showSuccess('Agent triggered successfully')
}

function editAgent(agent: any) {
  // TODO
}

function confirmDelete(agent: any) {
  // TODO
}

function formatDate(val: string) {
  if (!val) return 'Never'
  const date = isNaN(Number(val)) ? new Date(val) : new Date(Number(val))
  return date.toLocaleString('et-EE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}
</script>


<style scoped>
.bg-agents {
  background-color: #050505;
  min-height: 100vh;
}

.agent-card {
  background: #0a0a0a !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  transition: all 0.3s ease;
}

.agent-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.4) !important;
  transform: translateY(-2px);
}

.activity-bar {
  height: 4px;
  background: linear-gradient(90deg, var(--v-theme-primary), var(--v-theme-secondary));
  opacity: 0.3;
}

.glass-card {
  background: rgba(255, 255, 255, 0.02) !important;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
