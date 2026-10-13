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
          <v-btn icon="mdi-sync" variant="text" @click="fetchAgents" :loading="loading" title="Refresh Agents"></v-btn>
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
                  <v-icon size="20">{{ agent.avatar || (agent.enabled ? 'mdi-robot' : 'mdi-robot-off') }}</v-icon>
                </v-avatar>
              </template>
              
              <v-list-item-title class="font-weight-bold d-flex align-center">
                <span>{{ agent.name }}</span>
                <v-chip v-if="agent.hasPausedRequests" size="x-small" color="warning" class="ms-2 font-weight-bold" variant="flat">
                  HITL
                </v-chip>
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption opacity-60">
                <span v-if="agent.roles?.length" class="text-primary font-weight-medium me-1">
                  [{{ agent.roles.map((r: any) => r.name).join(', ') }}]
                </span>
                <span>{{ agent.schedule }}</span>
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
          <v-avatar color="primary" variant="tonal" size="32" class="me-3" rounded="lg">
            <v-icon size="18">{{ selectedAgent.avatar || 'mdi-robot' }}</v-icon>
          </v-avatar>
          <div class="d-flex flex-column">
            <div class="text-subtitle-1 font-weight-black uppercase tracking-widest truncate leading-tight">
              {{ selectedAgent.name }}
            </div>
            <div class="text-caption opacity-40 font-mono">
              {{ selectedAgent.uri || ('agent:' + selectedAgent.name) }}
            </div>
          </div>
          <v-spacer></v-spacer>
          <v-tabs v-model="activeTab" color="primary" density="compact">
            <v-tab value="config" prepend-icon="mdi-cog">Config</v-tab>
            <v-tab value="roles" prepend-icon="mdi-shield-lock">Roles & Whitelist</v-tab>
            <v-tab value="script" prepend-icon="mdi-code-braces">Script</v-tab>
            <v-tab value="requests" prepend-icon="mdi-format-list-checks">Requests</v-tab>
            <v-tab value="audit" prepend-icon="mdi-history">Audit Log</v-tab>
          </v-tabs>
          <v-btn icon="mdi-close" variant="text" class="ms-4" @click="closeDetail" title="Close Detail"></v-btn>
        </v-toolbar>

        <div class="flex-grow-1 overflow-y-auto">
          <v-window v-model="activeTab" class="h-100">
            
            <!-- 1. Config & Identity Tab -->
            <v-window-item value="config" class="pa-6 h-100">
              <v-card variant="outlined" class="glass-card pa-6 rounded-xl">
                <div class="text-subtitle-2 font-weight-bold mb-4 opacity-70 d-flex align-center">
                  <v-icon size="18" class="me-2 text-primary">mdi-badge-account-horizontal</v-icon>
                  Verifiable Agent Identity & Governance Parameters
                </div>
                
                <v-row>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="configForm.name"
                      label="Agent Name"
                      variant="outlined"
                      density="comfortable"
                    ></v-text-field>
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="configForm.uri"
                      label="RDF Identity URI"
                      variant="outlined"
                      density="comfortable"
                      hint="Globally unique semantic URI"
                      persistent-hint
                    ></v-text-field>
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="configForm.avatar"
                      label="Avatar Icon (MDI)"
                      variant="outlined"
                      density="comfortable"
                      placeholder="mdi-robot, mdi-brain, etc."
                    ></v-text-field>
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="configForm.schedule"
                      label="Schedule (e.g. 'every 5 minutes')"
                      variant="outlined"
                      density="comfortable"
                    ></v-text-field>
                  </v-col>
                  <v-col cols="12">
                    <v-text-field
                      v-model="configForm.description"
                      label="Agent Purpose / Description"
                      variant="outlined"
                      density="comfortable"
                    ></v-text-field>
                  </v-col>
                  <v-col cols="12">
                    <v-textarea
                      v-model="configForm.systemPrompt"
                      label="System Prompt / Persona Boundary"
                      variant="outlined"
                      density="comfortable"
                      rows="4"
                      hint="Directives and constraints enforced during autonomous execution"
                      persistent-hint
                    ></v-textarea>
                  </v-col>
                </v-row>
                
                <div class="d-flex align-center ga-4 mt-6">
                  <v-btn color="primary" @click="saveAgentConfig" :loading="savingConfig">Save Identity & Config</v-btn>
                  <v-btn variant="tonal" prepend-icon="mdi-play" @click="runAgentManual(selectedAgent)">Execute Now</v-btn>
                  <v-spacer></v-spacer>
                  <v-btn color="error" variant="text" @click="confirmDelete(selectedAgent)">Delete Agent</v-btn>
                </div>
              </v-card>
            </v-window-item>

            <!-- 2. Roles & Whitelist Governance Tab -->
            <v-window-item value="roles" class="pa-6 h-100">
              <v-alert
                type="info"
                variant="tonal"
                class="mb-6 rounded-xl border border-primary border-opacity-20"
                icon="mdi-shield-check"
              >
                <div class="text-subtitle-2 font-weight-bold">Principle of Least Privilege</div>
                <div class="text-caption opacity-80">
                  All tool access in Curator Core is whitelist-based by default. An agent is denied execution of any tool unless granted by its assigned roles or permissions. Sensitive operations require Human-in-the-Loop approval.
                </div>
              </v-alert>

              <v-card variant="outlined" class="glass-card pa-6 rounded-xl mb-6">
                <div class="text-subtitle-2 font-weight-bold mb-3 d-flex align-center">
                  <v-icon size="18" class="me-2 text-primary">mdi-shield-account</v-icon>
                  Assigned Whitelist Roles
                </div>

                <div v-if="!selectedAgent.roles || selectedAgent.roles.length === 0" class="text-body-2 text-error mb-4">
                  ⚠️ No roles assigned! This agent cannot execute any tools until granted a role.
                </div>

                <div class="d-flex flex-wrap align-center ga-2 mb-4">
                  <v-chip
                    v-for="role in (selectedAgent.roles || [])"
                    :key="role.id"
                    color="primary"
                    variant="tonal"
                    closable
                    class="font-weight-bold"
                    @click:close="removeRole(role.name)"
                  >
                    <v-icon start size="16">mdi-shield-key</v-icon>
                    {{ role.name }}
                  </v-chip>
                </div>

                <v-divider class="my-4 border-opacity-10"></v-divider>

                <div class="d-flex align-center ga-3">
                  <v-select
                    v-model="roleToAssign"
                    :items="unassignedRoles"
                    label="Grant Role"
                    variant="outlined"
                    density="compact"
                    hide-details
                    style="max-width: 320px;"
                    placeholder="Select role to whitelist"
                  ></v-select>
                  <v-btn
                    color="primary"
                    variant="tonal"
                    prepend-icon="mdi-plus"
                    :disabled="!roleToAssign"
                    :loading="assigningRole"
                    @click="assignRole"
                  >
                    Assign Role
                  </v-btn>
                </div>
              </v-card>

              <!-- Human-in-the-Loop Active Approvals Card -->
              <v-card variant="outlined" class="glass-card pa-6 rounded-xl mb-6">
                <div class="d-flex align-center mb-3">
                  <v-icon size="18" class="me-2 text-warning">mdi-check-decagram</v-icon>
                  <div>
                    <div class="text-subtitle-2 font-weight-bold">Active Tool Approvals (Revocable)</div>
                    <div class="text-caption opacity-50">Permanent and conversation approvals granted for this agent</div>
                  </div>
                  <v-spacer></v-spacer>
                  <div class="d-flex align-center ga-2">
                    <v-select
                      v-model="toolToApprove"
                      :items="gatedToolNames"
                      label="Tool to Approve"
                      variant="outlined"
                      density="compact"
                      hide-details
                      style="max-width: 240px;"
                      placeholder="Select gated tool"
                    ></v-select>
                    <v-btn
                      color="warning"
                      variant="tonal"
                      prepend-icon="mdi-shield-check"
                      :disabled="!toolToApprove"
                      @click="grantPermanentApproval"
                    >
                      Grant Permanent
                    </v-btn>
                  </div>
                </div>

                <div v-if="activeApprovals.length === 0" class="text-caption opacity-40 py-2">
                  No active permanent or conversation approvals. Gated tools will pause for human confirmation when triggered.
                </div>

                <div v-else class="d-flex flex-wrap ga-3">
                  <v-card
                    v-for="approval in activeApprovals"
                    :key="approval.id"
                    variant="tonal"
                    color="surface"
                    class="pa-3 rounded-lg border border-white border-opacity-10 d-flex align-center ga-3"
                  >
                    <div>
                      <div class="font-weight-bold font-mono text-body-2">
                        <code>{{ approval.toolName }}</code>
                      </div>
                      <div class="text-caption opacity-60">
                        {{ approval.scope }} • Approved by {{ approval.approvedBy }}
                      </div>
                    </div>
                    <v-spacer></v-spacer>
                    <v-btn
                      size="small"
                      color="error"
                      variant="tonal"
                      prepend-icon="mdi-cancel"
                      @click="revokeApproval(approval.id)"
                    >
                      Revoke
                    </v-btn>
                  </v-card>
                </div>
              </v-card>

              <!-- Effective Tools Whitelist Matrix -->
              <v-card variant="outlined" class="glass-card rounded-xl overflow-hidden">
                <div class="px-6 py-4 border-b border-white border-opacity-5 d-flex align-center">
                  <div>
                    <div class="text-subtitle-2 font-weight-bold">Tool Gating & Capability Matrix</div>
                    <div class="text-caption opacity-50">Configured security access levels and approval requirements</div>
                  </div>
                  <v-spacer></v-spacer>
                  <v-text-field
                    v-model="toolSearch"
                    prepend-inner-icon="mdi-magnify"
                    label="Search tools"
                    variant="outlined"
                    density="compact"
                    hide-details
                    style="max-width: 250px;"
                  ></v-text-field>
                </div>

                <v-table density="comfortable" class="bg-transparent">
                  <thead>
                    <tr>
                      <th class="text-left">Tool Name</th>
                      <th class="text-left">Access Level</th>
                      <th class="text-left">Required Role</th>
                      <th class="text-left">Whitelist Status</th>
                      <th class="text-left">Gating / Approval</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in filteredTools" :key="t.name">
                      <td class="font-weight-medium">
                        <code>{{ t.name }}</code>
                        <div class="text-caption opacity-50">{{ t.description }}</div>
                      </td>
                      <td>
                        <v-chip size="x-small" :color="getAccessLevelColor(t.accessLevel)" variant="tonal" class="font-weight-bold">
                          {{ t.accessLevel }}
                        </v-chip>
                      </td>
                      <td>
                        <span class="font-mono text-caption opacity-80">{{ t.requiredRole || 'agent:admin' }}</span>
                      </td>
                      <td>
                        <v-chip
                          size="x-small"
                          :color="isToolWhitelistedForAgent(t) ? 'success' : 'error'"
                          variant="tonal"
                          class="font-weight-bold"
                        >
                          <v-icon start size="14">
                            {{ isToolWhitelistedForAgent(t) ? 'mdi-check-circle' : 'mdi-cancel' }}
                          </v-icon>
                          {{ isToolWhitelistedForAgent(t) ? 'Permitted' : 'Blocked' }}
                        </v-chip>
                      </td>
                      <td>
                        <v-chip
                          v-if="t.requiresHumanApproval || t.requiresConfirmation"
                          size="x-small"
                          color="warning"
                          variant="flat"
                          class="font-weight-bold"
                        >
                          <v-icon start size="14">mdi-shield-alert</v-icon>
                          Human Approval Required
                        </v-chip>
                        <span v-else class="text-caption opacity-40">Automated</span>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card>
            </v-window-item>

            <!-- 3. Script Tab -->
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

            <!-- 4. Requests Tab -->
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
                    <v-chip
                      size="x-small"
                      :color="getStatusColor(item.status)"
                      variant="tonal"
                      class="font-weight-black"
                    >
                      <v-icon v-if="item.status === 'PAUSED'" start size="14">mdi-pause-circle</v-icon>
                      {{ item.status === 'PAUSED' ? 'PAUSED (Awaiting Human Approval)' : item.status }}
                    </v-chip>
                  </template>
                  <template v-slot:item.createdAt="{ item }">
                    <span class="text-caption opacity-60">{{ formatDate(item.createdAt) }}</span>
                  </template>
                  <template v-slot:item.toolName="{ item }">
                    <span class="font-weight-medium">{{ item.toolName || 'Workflow Execution' }}</span>
                  </template>
                </v-data-table>
              </v-card>
            </v-window-item>

            <!-- 5. Audit Log Tab -->
            <v-window-item value="audit" class="pa-6 h-100">
              <div class="d-flex align-center mb-4">
                <div>
                  <div class="text-subtitle-2 font-weight-bold">Immutable Audit Trail</div>
                  <div class="text-caption opacity-50">Historical log of agent workflow events, permissions, and tool executions</div>
                </div>
                <v-spacer></v-spacer>
                <v-btn
                  variant="tonal"
                  prepend-icon="mdi-refresh"
                  size="small"
                  :loading="loadingAuditLogs"
                  @click="fetchAgentAuditLogs"
                >
                  Refresh Logs
                </v-btn>
              </div>

              <v-card variant="outlined" class="glass-card rounded-xl overflow-hidden">
                <v-table density="comfortable" class="bg-transparent">
                  <thead>
                    <tr>
                      <th class="text-left">Timestamp</th>
                      <th class="text-left">Action / Event</th>
                      <th class="text-left">Status</th>
                      <th class="text-left">Tool / Resource</th>
                      <th class="text-left">Actor</th>
                      <th class="text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="auditLogs.length === 0">
                      <td colspan="6" class="text-center py-6 opacity-40">No audit records recorded yet.</td>
                    </tr>
                    <tr v-for="log in auditLogs" :key="log.id">
                      <td class="text-caption opacity-60 font-mono">{{ formatDate(log.timestamp) }}</td>
                      <td>
                        <v-chip size="x-small" :color="getActionColor(log.action)" variant="tonal" class="font-weight-bold">
                          {{ log.action }}
                        </v-chip>
                      </td>
                      <td>
                        <v-chip size="x-small" :color="getAuditStatusColor(log.status)" variant="flat" class="font-weight-bold">
                          {{ log.status }}
                        </v-chip>
                      </td>
                      <td>
                        <span v-if="log.metadata?.tool || log.metadata?.toolName" class="font-mono text-caption">
                          <code>{{ log.metadata?.tool || log.metadata?.toolName }}</code>
                        </span>
                        <span v-else class="text-caption opacity-40">-</span>
                      </td>
                      <td class="text-caption opacity-80">{{ log.userId || 'system' }}</td>
                      <td class="text-caption font-mono text-truncate" style="max-width: 250px;">
                        {{ formatLogMetadata(log.metadata) }}
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card>
            </v-window-item>

          </v-window>
        </div>
      </div>
    </div>

    <!-- Request Detail Overlay with Human-In-The-Loop Approval Action -->
    <v-dialog v-model="showRequestDetail" max-width="800" scrollable>
      <v-card v-if="selectedRequest" rounded="xl" class="glass-card border border-white border-opacity-10 bg-console h-75">
        <v-toolbar flat color="transparent" class="px-4 border-b border-white border-opacity-5">
          <v-chip :color="getStatusColor(selectedRequest.status)" size="small" class="me-3 font-weight-black">
            {{ selectedRequest.status }}
          </v-chip>
          <v-toolbar-title class="text-subtitle-2 font-weight-medium opacity-60">
            Request #{{ selectedRequest.id }}
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" @click="showRequestDetail = false"></v-btn>
        </v-toolbar>
        
        <v-card-text class="pa-6">
          <!-- Gated Tool Human Approval Alert -->
          <v-alert
            v-if="selectedRequest.status === 'PAUSED'"
            type="warning"
            variant="tonal"
            class="mb-6 rounded-xl border border-warning"
            icon="mdi-shield-alert"
          >
            <div class="text-subtitle-2 font-weight-bold mb-1">Human-in-the-Loop Approval Required</div>
            <div class="text-body-2 mb-3">
              This request attempted to execute a gated tool:
              <strong v-if="selectedRequest.context?.__pendingApprovalTool__">
                <code>{{ selectedRequest.context.__pendingApprovalTool__ }}</code>
              </strong>
              <strong v-else>
                <code>{{ selectedRequest.toolName || 'Sensitive Action' }}</code>
              </strong>.
              Operation has been safely suspended according to Curator governance policy.
            </div>
            <div class="text-caption font-weight-bold opacity-80 mb-1">Approval Scope:</div>
            <v-radio-group v-model="approvalScopeChoice" inline density="compact" hide-details class="mb-4">
              <v-radio value="ONETIME" label="One-Time (This step only)"></v-radio>
              <v-radio value="CONVERSATION" label="Conversation (Session duration)"></v-radio>
              <v-radio value="PERMANENT" label="Permanent (Revocable in Roles tab)"></v-radio>
            </v-radio-group>

            <v-btn
              color="warning"
              variant="flat"
              prepend-icon="mdi-check-decagram"
              class="font-weight-bold text-black"
              :loading="approvingRequest"
              @click="approveCurrentRequest"
            >
              Approve & Resume ({{ approvalScopeChoice }})
            </v-btn>
          </v-alert>

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
const allRoles = ref<any[]>([])
const allTools = ref<any[]>([])
const loading = ref(false)
const showList = ref(true)
const showDetail = ref(true)
const activeTab = ref('config')

const selectedAgentId = ref<string | null>(null)
const selectedAgent = computed(() => agents.value.find(a => a.id === selectedAgentId.value))

// Forms
const configForm = ref({
  name: '',
  uri: '',
  description: '',
  systemPrompt: '',
  avatar: '',
  schedule: ''
})
const savingConfig = ref(false)

const scriptForm = ref({ name: '', code: '' })
const scriptMode = ref('Dynamic (JS)')
const savingScript = ref(false)

// Roles & Approvals
const roleToAssign = ref<string | null>(null)
const assigningRole = ref(false)
const toolSearch = ref('')
const toolToApprove = ref<string | null>(null)
const agentApprovals = ref<any[]>([])
const approvalScopeChoice = ref<'ONETIME' | 'CONVERSATION' | 'PERMANENT'>('ONETIME')

const unassignedRoles = computed(() => {
  const currentRoleNames = (selectedAgent.value?.roles || []).map((r: any) => r.name)
  return allRoles.value
    .map(r => r.name)
    .filter(name => !currentRoleNames.includes(name))
})

const activeApprovals = computed(() => {
  return agentApprovals.value.filter(a => !a.revoked)
})

const gatedToolNames = computed(() => {
  return allTools.value
    .filter(t => t.requiresHumanApproval || t.requiresConfirmation)
    .map(t => t.name)
})

const filteredTools = computed(() => {
  if (!toolSearch.value) return allTools.value
  const q = toolSearch.value.toLowerCase()
  return allTools.value.filter(t => 
    t.name.toLowerCase().includes(q) || 
    (t.description && t.description.toLowerCase().includes(q)) ||
    (t.requiredRole && t.requiredRole.toLowerCase().includes(q))
  )
})

// Requests & HITL
const agentRequests = ref<any[]>([])
const loadingRequests = ref(false)
const approvingRequest = ref(false)
const requestHeaders = [
  { title: 'Status', key: 'status', width: '220px' },
  { title: 'Tool / Action', key: 'toolName' },
  { title: 'Time', key: 'createdAt', align: 'end' as const }
]

const showRequestDetail = ref(false)
const selectedRequest = ref<any>(null)

// Audit Logs
const auditLogs = ref<any[]>([])
const loadingAuditLogs = ref(false)

onMounted(async () => {
  await fetchGovernanceData()
  await fetchAgents()
  
  if (route.params.id) {
    const found = agents.value.find(a => a.id === route.params.id)
    if (found) {
      selectAgent(found)
    }
  }
})

async function fetchGovernanceData() {
  try {
    const data = await graphql(`
      query {
        roles {
          id name description
        }
        tools {
          id name description accessLevel requiredRole requiresHumanApproval requiresConfirmation
        }
      }
    `)
    if (data?.roles) allRoles.value = data.roles
    if (data?.tools) allTools.value = data.tools
  } catch (err) {
    console.warn('Could not fetch governance data:', err)
  }
}

async function fetchAgents() {
  loading.value = true
  try {
    const data = await graphql(`
      query {
        agents {
          id name schedule enabled lastPolledAt
          uri description systemPrompt avatar
          roles { id name description }
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
  
  // Init config forms
  configForm.value.name = agent.name || ''
  configForm.value.uri = agent.uri || `agent:${agent.name}`
  configForm.value.description = agent.description || ''
  configForm.value.systemPrompt = agent.systemPrompt || ''
  configForm.value.avatar = agent.avatar || ''
  configForm.value.schedule = agent.schedule || ''
  
  // Init script
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

  // Fetch requests, approvals & audit logs
  fetchAgentRequests(agent.name)
  fetchAgentApprovals(agent.id)
  fetchAgentAuditLogs()
}

async function fetchAgentRequests(agentName: string) {
  loadingRequests.value = true
  try {
    const data = await graphql(`
      query($name: String!) {
        agent(name: $name) {
          requests {
            id status createdAt toolName toolCalls context
            responses { id content createdAt }
          }
        }
      }
    `, { name: agentName })
    
    if (data?.agent?.requests) {
      agentRequests.value = data.agent.requests
      if (selectedAgent.value) {
        selectedAgent.value.hasPausedRequests = agentRequests.value.some(r => r.status === 'PAUSED')
      }
    } else {
      agentRequests.value = []
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingRequests.value = false
  }
}

async function fetchAgentAuditLogs() {
  if (!selectedAgent.value) return
  loadingAuditLogs.value = true
  try {
    const data = await graphql(`
      query($agentId: ID!) {
        auditLogs(agentId: $agentId, limit: 50) {
          id action status userId agentId requestId metadata timestamp
        }
      }
    `, { agentId: selectedAgent.value.id })

    if (data?.auditLogs) {
      auditLogs.value = data.auditLogs
    }
  } catch (err) {
    console.error(err)
  } finally {
    loadingAuditLogs.value = false
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
        updateAgent(id: $id, input: $input) {
          id name uri description systemPrompt avatar schedule
        }
      }
    `, { 
      id: selectedAgent.value.id, 
      input: {
        name: configForm.value.name,
        uri: configForm.value.uri,
        description: configForm.value.description,
        systemPrompt: configForm.value.systemPrompt,
        avatar: configForm.value.avatar,
        schedule: configForm.value.schedule
      } 
    })
    
    if (data?.updateAgent) {
      Object.assign(selectedAgent.value, data.updateAgent)
      showSuccess('Agent identity & configuration saved')
    }
  } catch (e: any) {
    showError(e.message)
  } finally {
    savingConfig.value = false
  }
}

async function assignRole() {
  if (!selectedAgent.value || !roleToAssign.value) return
  assigningRole.value = true
  try {
    const data = await graphql(`
      mutation($agentId: ID!, $roleName: String!) {
        assignAgentRole(agentId: $agentId, roleName: $roleName) {
          id roles { id name description }
        }
      }
    `, { agentId: selectedAgent.value.id, roleName: roleToAssign.value })

    if (data?.assignAgentRole) {
      selectedAgent.value.roles = data.assignAgentRole.roles
      roleToAssign.value = null
      showSuccess(`Role granted to ${selectedAgent.value.name}`)
      fetchAgentAuditLogs()
    }
  } catch (e: any) {
    showError(e.message)
  } finally {
    assigningRole.value = false
  }
}

async function removeRole(roleName: string) {
  if (!selectedAgent.value) return
  try {
    const data = await graphql(`
      mutation($agentId: ID!, $roleName: String!) {
        removeAgentRole(agentId: $agentId, roleName: $roleName) {
          id roles { id name description }
        }
      }
    `, { agentId: selectedAgent.value.id, roleName })

    if (data?.removeAgentRole) {
      selectedAgent.value.roles = data.removeAgentRole.roles
      showSuccess(`Role '${roleName}' revoked`)
      fetchAgentAuditLogs()
    }
  } catch (e: any) {
    showError(e.message)
  }
}

function isToolWhitelistedForAgent(tool: any): boolean {
  if (!selectedAgent.value) return false
  const roles = (selectedAgent.value.roles || []).map((r: any) => r.name)
  if (roles.length === 0) return false
  if (roles.includes('admin') || roles.includes('agent:admin') || roles.includes('system:admin')) return true
  if (tool.requiredRole && roles.includes(tool.requiredRole)) return true
  if (roles.includes(`tool:${tool.name}`) || roles.includes(tool.name)) return true
  return false
}

async function fetchAgentApprovals(agentId: string) {
  try {
    const data = await graphql(`
      query($agentId: ID!) {
        toolApprovals(agentId: $agentId) {
          id toolName scope revoked approvedBy createdAt
        }
      }
    `, { agentId })
    if (data?.toolApprovals) {
      agentApprovals.value = data.toolApprovals
    }
  } catch (err) {
    console.warn('Could not fetch agent approvals:', err)
  }
}

async function grantPermanentApproval() {
  if (!selectedAgent.value || !toolToApprove.value) return
  try {
    const data = await graphql(`
      mutation($agentId: ID!, $toolName: String!, $scope: ApprovalScope!) {
        grantToolApproval(agentId: $agentId, toolName: $toolName, scope: $scope) {
          id toolName scope revoked
        }
      }
    `, {
      agentId: selectedAgent.value.id,
      toolName: toolToApprove.value,
      scope: 'PERMANENT'
    })

    if (data?.grantToolApproval) {
      showSuccess(`Permanent approval granted for '${toolToApprove.value}'`)
      toolToApprove.value = null
      fetchAgentApprovals(selectedAgent.value.id)
      fetchAgentAuditLogs()
    }
  } catch (e: any) {
    showError(e.message)
  }
}

async function revokeApproval(approvalId: string) {
  try {
    const data = await graphql(`
      mutation($id: ID!) {
        revokeToolApproval(id: $id)
      }
    `, { id: approvalId })

    if (data?.revokeToolApproval) {
      showSuccess('Tool approval revoked. Future executions will require confirmation.')
      if (selectedAgent.value) {
        fetchAgentApprovals(selectedAgent.value.id)
        fetchAgentAuditLogs()
      }
    }
  } catch (e: any) {
    showError(e.message)
  }
}

async function approveCurrentRequest() {
  if (!selectedRequest.value) return
  approvingRequest.value = true
  try {
    const data = await graphql(`
      mutation($id: ID!, $scope: ApprovalScope) {
        approveRequest(id: $id, scope: $scope) {
          id status context
        }
      }
    `, { id: selectedRequest.value.id, scope: approvalScopeChoice.value })

    if (data?.approveRequest) {
      selectedRequest.value.status = data.approveRequest.status
      selectedRequest.value.context = data.approveRequest.context
      showSuccess(`Approval granted (${approvalScopeChoice.value})! Workflow resumed.`)
      if (selectedAgent.value) {
        fetchAgentRequests(selectedAgent.value.name)
        fetchAgentApprovals(selectedAgent.value.id)
        fetchAgentAuditLogs()
      }
    }
  } catch (e: any) {
    showError(e.message)
  } finally {
    approvingRequest.value = false
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
    setTimeout(() => {
      fetchAgentRequests(agent.name)
      fetchAgentAuditLogs()
    }, 1000)
  } catch (e: any) {
    showError(e.message)
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
  showError('Agent deletion disabled in demo mode')
}

function formatDate(val: string) {
  if (!val) return 'Never'
  const date = isNaN(Number(val)) ? new Date(val) : new Date(Number(val))
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getStatusColor(status: string) {
  if (status === 'COMPLETED') return 'success'
  if (status === 'FAILED') return 'error'
  if (status === 'PAUSED') return 'warning'
  if (status === 'PROCESSING') return 'info'
  return 'secondary'
}

function getAccessLevelColor(lvl: string) {
  if (lvl === 'safe_read') return 'success'
  if (lvl === 'safe_write') return 'info'
  if (lvl === 'elevated') return 'warning'
  if (lvl === 'destructive') return 'error'
  if (lvl === 'admin') return 'purple'
  return 'secondary'
}

function getActionColor(action: string) {
  if (action?.includes('BLOCKED')) return 'error'
  if (action?.includes('APPROVAL')) return 'warning'
  if (action?.includes('ROLE')) return 'info'
  if (action?.includes('COMPLETED')) return 'success'
  return 'primary'
}

function getAuditStatusColor(status: string) {
  if (status === 'SUCCESS') return 'success'
  if (status === 'BLOCKED') return 'error'
  if (status === 'PAUSED') return 'warning'
  if (status === 'FAILED') return 'error'
  return 'secondary'
}

function formatLogMetadata(metadata: any) {
  if (!metadata) return '-'
  if (typeof metadata === 'string') return metadata
  return JSON.stringify(metadata)
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
