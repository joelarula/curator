<template>
  <v-container fluid class="pa-0 fill-height bg-agents">
    <div class="d-flex w-100 h-100 overflow-hidden">
      
      <!-- Left Panel: Agents List -->
      <div 
        v-show="showList" 
        :class="showDetail && selectedAgent ? 'list-panel border-e border-white border-opacity-10' : 'w-100'" 
        class="d-flex flex-column h-100 transition-all overflow-hidden"
      >
        <v-toolbar flat color="transparent" class="px-6 border-b border-white border-opacity-5">
          <v-icon color="primary" class="me-3">mdi-robot-outline</v-icon>
          <v-toolbar-title class="text-subtitle-1 font-weight-black tracking-widest uppercase">
            Agents
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-sync" variant="text" @click="syncAgents" :loading="loading" title="Sync Scheduler"></v-btn>
          <v-btn color="primary" variant="flat" rounded="pill" prepend-icon="mdi-plus" class="ms-2 px-4" @click="openCreateAgent">
            Deploy
          </v-btn>
          <v-btn v-if="selectedAgent" icon="mdi-chevron-left" variant="text" class="ms-2" @click="showList = false" title="Collapse List"></v-btn>
        </v-toolbar>

        <div class="flex-grow-1 overflow-y-auto pa-4">
          <v-list bg-color="transparent" class="pa-0">
            <v-list-item
              v-for="agent in agents"
              :key="agent.id"
              :active="selectedAgentId === agent.id"
              color="primary"
              variant="flat"
              class="mb-2 rounded-lg border border-white border-opacity-5"
              @click="selectAgent(agent)"
            >
              <template v-slot:prepend>
                <v-avatar :color="agent.enabled ? 'primary' : 'grey'" variant="tonal" rounded="lg" size="40" class="me-3">
                  <v-icon size="20">{{ agent.enabled ? 'mdi-robot' : 'mdi-robot-off' }}</v-icon>
                </v-avatar>
              </template>
              
              <v-list-item-title class="font-weight-bold">{{ agent.name }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption opacity-50">
                {{ agent.schedule }} • Last: {{ formatDate(agent.lastPolledAt) }}
              </v-list-item-subtitle>

              <template v-slot:append>
                <v-switch
                  v-model="agent.enabled"
                  color="primary"
                  hide-details
                  density="compact"
                  @click.stop
                  @change="toggleAgent(agent)"
                ></v-switch>
              </template>
            </v-list-item>
          </v-list>
        </div>
      </div>

      <!-- Right Panel: Agent Detail -->
      <div 
        v-if="selectedAgent && showDetail" 
        :class="showList ? 'detail-panel' : 'w-100'" 
        class="d-flex flex-column h-100 bg-console transition-all overflow-hidden"
      >
        <v-toolbar flat color="transparent" class="px-6 border-b border-white border-opacity-5">
          <v-btn v-if="!showList" icon="mdi-chevron-right" variant="text" class="me-4" @click="showList = true" title="Show List"></v-btn>
          <div class="text-subtitle-1 font-weight-black uppercase tracking-widest truncate">
            {{ selectedAgent.name }}
          </div>
          <v-spacer></v-spacer>
          <v-tabs v-model="activeTab" color="primary" density="compact">
            <v-tab value="config">Config</v-tab>
            <v-tab value="script">Script</v-tab>
            <v-tab value="requests">Requests</v-tab>
          </v-tabs>
          <v-btn icon="mdi-close" variant="text" class="ms-4" @click="closeDetail" title="Close Detail"></v-btn>
        </v-toolbar>

        <div class="flex-grow-1 overflow-y-auto">
          <!-- Config Tab -->
          <v-window v-model="activeTab" class="h-100">
            <v-window-item value="config" class="pa-6 h-100">
              <v-card variant="outlined" class="glass-card pa-6 rounded-xl">
                <v-text-field
                  v-model="configForm.name"
                  label="Agent Name"
                  variant="outlined"
                  class="mb-4"
                ></v-text-field>
                <v-text-field
                  v-model="configForm.schedule"
                  label="Schedule (e.g. 'every 5 minutes')"
                  variant="outlined"
                  class="mb-4"
                ></v-text-field>
                
                <div class="d-flex align-center ga-4 mt-4">
                  <v-btn color="primary" @click="saveAgentConfig" :loading="savingConfig">Save Config</v-btn>
                  <v-btn variant="tonal" prepend-icon="mdi-play" @click="runAgentManual(selectedAgent)">Execute Now</v-btn>
                  <v-spacer></v-spacer>
                  <v-btn color="error" variant="text" @click="confirmDelete(selectedAgent)">Delete Agent</v-btn>
                </div>
              </v-card>
            </v-window-item>

            <!-- Script Tab -->
            <v-window-item value="script" class="pa-6 h-100 d-flex flex-column">
              <div class="d-flex ga-4 mb-4">
                <v-text-field
                  v-model="scriptForm.name"
                  label="Script Name"
                  variant="outlined"
                  density="compact"
                  hide-details
                  readonly
                  class="flex-grow-1 opacity-50"
                ></v-text-field>
                <v-select
                  v-model="scriptMode"
                  :items="['Dynamic (JS)', 'Static (JSON)']"
                  label="Mode"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="shrink-select"
                ></v-select>
              </div>

              <div class="editor-wrapper flex-grow-1 rounded-xl overflow-hidden glass-card d-flex flex-column">
                <div class="editor-header px-4 py-2 d-flex align-center border-b border-white border-opacity-5">
                  <span class="text-caption font-weight-bold opacity-40">{{ scriptMode === 'Dynamic (JS)' ? 'script.body.js' : 'toolCalls.json' }}</span>
                </div>
                <v-textarea
                  v-model="scriptForm.code"
                  variant="plain"
                  class="mono-editor px-4 py-2 flex-grow-1"
                  hide-details
                  no-resize
                ></v-textarea>
              </div>

              <div class="d-flex justify-end mt-4 ga-4">
                <v-btn variant="tonal" color="primary" @click="saveScript" :loading="savingScript">Save Script</v-btn>
              </div>
            </v-window-item>

            <!-- Requests Tab -->
            <v-window-item value="requests" class="pa-6 h-100">
              <v-card variant="outlined" class="glass-card rounded-xl overflow-hidden">
                <v-data-table
                  :headers="requestHeaders"
                  :items="agentRequests"
                  :loading="loadingRequests"
                  density="comfortable"
                  hover
                  class="bg-transparent"
                  @click:row="openRequestDetail"
                >
                  <template v-slot:item.status="{ item }">
                    <v-chip size="x-small" :color="getStatusColor(item.status)" variant="tonal" class="font-weight-black">
                      {{ item.status }}
                    </v-chip>
                  </template>
                  <template v-slot:item.createdAt="{ item }">
                    <span class="text-caption opacity-60">{{ formatDate(item.createdAt) }}</span>
                  </template>
                  <template v-slot:item.toolName="{ item }">
                    <span class="font-weight-medium">{{ item.toolName || 'Script Execution' }}</span>
                  </template>
                </v-data-table>
              </v-card>
            </v-window-item>
          </v-window>
        </div>
      </div>
    </div>

    <!-- Request Detail Overlay -->
    <v-dialog v-model="showRequestDetail" max-width="800" scrollable>
      <v-card v-if="selectedRequest" rounded="xl" class="glass-card border border-white border-opacity-10 bg-console h-75">
        <v-toolbar flat color="transparent" class="px-4 border-b border-white border-opacity-5">
          <v-chip :color="getStatusColor(selectedRequest.status)" size="small" class="me-3 font-weight-black">{{ selectedRequest.status }}</v-chip>
          <v-toolbar-title class="text-subtitle-2 font-weight-medium opacity-60">
            Request {{ selectedRequest.id }}
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" @click="showRequestDetail = false"></v-btn>
        </v-toolbar>
        
        <v-card-text class="pa-6">
          <div v-if="selectedRequest.toolCalls" class="mb-6 pa-4 rounded-lg border border-white border-opacity-5 bg-black">
            <div class="text-overline mb-2 opacity-40">Tool Chain execution</div>
            <div class="d-flex flex-wrap ga-2">
              <v-chip v-for="(call, i) in selectedRequest.toolCalls" :key="i" size="small" variant="tonal">
                {{ call.name }}
              </v-chip>
            </div>
          </div>

          <div class="text-overline mb-2 opacity-40">Responses</div>
          <div v-if="!selectedRequest.responses || selectedRequest.responses.length === 0" class="opacity-30 text-body-2">
            No responses recorded.
          </div>
          <div class="d-flex flex-column ga-4">
            <div v-for="resp in selectedRequest.responses" :key="resp.id" class="pa-4 rounded-lg bg-black border border-white border-opacity-5">
              <div v-html="formatResponse(resp.content)"></div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { graphql, showSuccess, showError } from '../composables/useGraphql'
import { openDeployAgent } from '../composables/useGlobalActions'

const router = useRouter()
const route = useRoute()

// State
const agents = ref<any[]>([])
const loading = ref(false)
const showList = ref(true)
const showDetail = ref(true)
const activeTab = ref('config')

const selectedAgentId = ref<string | null>(null)
const selectedAgent = computed(() => agents.value.find(a => a.id === selectedAgentId.value))

// Forms
const configForm = ref({ name: '', schedule: '' })
const savingConfig = ref(false)

const scriptForm = ref({ name: '', code: '' })
const scriptMode = ref('Dynamic (JS)')
const savingScript = ref(false)

// Requests
const agentRequests = ref<any[]>([])
const loadingRequests = ref(false)
const requestHeaders = [
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Tool / Action', key: 'toolName' },
  { title: 'Time', key: 'createdAt', align: 'end' as const }
]

const showRequestDetail = ref(false)
const selectedRequest = ref<any>(null)

onMounted(async () => {
  await fetchAgents()
  
  // If route has an ID, select it
  if (route.params.id) {
    const found = agents.value.find(a => a.id === route.params.id)
    if (found) {
      selectAgent(found)
    }
  }
})

async function fetchAgents() {
  loading.value = true
  try {
    const data = await graphql(`
      query {
        agents {
          id name schedule enabled lastPolledAt
          script { id name body toolCalls }
        }
      }
    `)
    if (data?.agents) {
      agents.value = data.agents
    }
  } finally {
    loading.value = false
  }
}

async function selectAgent(agent: any) {
  selectedAgentId.value = agent.id
  showDetail.value = true
  router.replace({ name: 'agent-detail', params: { id: agent.id } })
  
  // Init forms
  configForm.value.name = agent.name
  configForm.value.schedule = agent.schedule
  
  scriptForm.value.name = agent.script?.name || `${agent.name}_script`
  if (agent.script?.body) {
    scriptMode.value = 'Dynamic (JS)'
    scriptForm.value.code = agent.script.body
  } else if (agent.script?.toolCalls) {
    scriptMode.value = 'Static (JSON)'
    scriptForm.value.code = JSON.stringify(agent.script.toolCalls, null, 2)
  } else {
    scriptMode.value = 'Dynamic (JS)'
    scriptForm.value.code = 'const chain = ToolChain.start()\n  .toJSON();'
  }

  // Fetch agent specific requests
  fetchAgentRequests(agent.name)
}

async function fetchAgentRequests(agentName: string) {
  loadingRequests.value = true
  try {
    const data = await graphql(`
      query($name: String!) {
        agent(name: $name) {
          requests {
            id status createdAt toolName toolCalls
            responses { id content createdAt }
          }
        }
      }
    `, { name: agentName })
    
    if (data?.agent?.requests) {
      agentRequests.value = data.agent.requests
    } else {
      agentRequests.value = []
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingRequests.value = false
  }
}

function closeDetail() {
  selectedAgentId.value = null
  showDetail.value = false
  router.replace({ name: 'agents' })
}

async function saveAgentConfig() {
  if (!selectedAgent.value) return
  savingConfig.value = true
  try {
    const data = await graphql(`
      mutation($id: ID!, $input: AgentInput!) {
        updateAgent(id: $id, input: $input) { id name schedule }
      }
    `, { 
      id: selectedAgent.value.id, 
      input: { name: configForm.value.name, schedule: configForm.value.schedule } 
    })
    
    if (data?.updateAgent) {
      selectedAgent.value.name = data.updateAgent.name
      selectedAgent.value.schedule = data.updateAgent.schedule
      showSuccess('Agent configuration saved')
    }
  } catch (e: any) {
    showError(e.message)
  } finally {
    savingConfig.value = false
  }
}

async function saveScript() {
  if (!selectedAgent.value) return
  savingScript.value = true
  try {
    const isDynamic = scriptMode.value === 'Dynamic (JS)'
    const body = isDynamic ? scriptForm.value.code : null
    let toolCalls = null
    if (!isDynamic) {
      try {
        toolCalls = JSON.parse(scriptForm.value.code)
      } catch (e) {
        throw new Error('Invalid JSON format for Static mode')
      }
    }

    const data = await graphql(`
      mutation($input: UpsertAgentWithScriptInput!) {
        upsertAgentWithScript(input: $input) {
          id name schedule script { id name body toolCalls }
        }
      }
    `, {
      input: {
        agentName: selectedAgent.value.name,
        scriptName: scriptForm.value.name,
        schedule: selectedAgent.value.schedule,
        body,
        toolCalls
      }
    })

    if (data?.upsertAgentWithScript) {
      selectedAgent.value.script = data.upsertAgentWithScript.script
      showSuccess('Script saved successfully')
    }
  } catch (e: any) {
    showError(e.message)
  } finally {
    savingScript.value = false
  }
}

async function toggleAgent(agent: any) {
  try {
    await graphql(`
      mutation($id: ID!, $enabled: Boolean!) {
        toggleAgent(id: $id, enabled: $enabled) { id enabled }
      }
    `, { id: agent.id, enabled: agent.enabled })
    showSuccess(`Agent ${agent.enabled ? 'enabled' : 'disabled'}`)
  } catch (e: any) {
    agent.enabled = !agent.enabled // revert
    showError(e.message)
  }
}

async function runAgentManual(agent: any) {
  try {
    await graphql(`
      mutation($id: ID!) {
        triggerAgent(id: $id) { id status }
      }
    `, { id: agent.id })
    showSuccess('Agent execution triggered')
    // Refresh requests
    setTimeout(() => fetchAgentRequests(agent.name), 1000)
  } catch (e: any) {
    showError(e.message)
  }
}

async function syncAgents() {
  loading.value = true
  try {
    await graphql(`query { agentWorkerState { schedulerRunning } }`)
    showSuccess('Worker state verified')
  } finally {
    loading.value = false
  }
}

function openCreateAgent() {
  openDeployAgent()
}

function openRequestDetail(_event: any, { item }: any) {
  selectedRequest.value = item
  showRequestDetail.value = true
}

function confirmDelete(agent: any) {
  // TODO
  showError('Delete not fully implemented yet')
}

function formatDate(val: string) {
  if (!val) return 'Never'
  const date = isNaN(Number(val)) ? new Date(val) : new Date(Number(val))
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getStatusColor(status: string) {
  if (status === 'COMPLETED') return 'success'
  if (status === 'FAILED') return 'error'
  if (status === 'PROCESSING') return 'warning'
  return 'secondary'
}

function formatResponse(content: string) {
  try {
    const parsed = JSON.parse(content)
    return `<pre class="json-content">${JSON.stringify(parsed, null, 2)}</pre>`
  } catch {
    return content.replace(/\n/g, '<br>')
  }
}
</script>

<style scoped>
.bg-agents {
  background-color: #050505;
}

.bg-console {
  background-color: #030303;
}

.list-panel {
  width: 350px;
  min-width: 350px;
}

.detail-panel {
  width: calc(100% - 350px);
}

.transition-all {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.glass-card {
  background: rgba(255, 255, 255, 0.02) !important;
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shrink-select {
  max-width: 180px;
}

.mono-editor :deep(textarea) {
  font-family: 'Fira Code', 'Roboto Mono', monospace;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #80CBC4 !important;
}

:deep(.json-content) {
  background: rgba(0,0,0,0.3);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.85rem;
  color: #90A4AE;
  margin: 0;
}
</style>
