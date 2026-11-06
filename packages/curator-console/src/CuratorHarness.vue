<template>
  <div class="d-flex flex-column min-vh-100 bg-background text-high-emphasis w-100">
    <!-- Masthead / Header Bar -->
    <v-card
      v-if="!hideHeader"
      elevation="1"
      rounded="0"
      class="position-sticky top-0 z-10 border-b"
      color="surface"
    >
      <div class="d-flex align-center justify-space-between flex-wrap px-4 py-3 ga-3">
        <div class="d-flex align-center ga-3">
          <v-avatar color="primary" variant="flat" size="36" class="elevation-2">
            <span class="text-subtitle-1 font-weight-bold">⚡</span>
          </v-avatar>
          <div>
            <div class="d-flex align-center ga-2">
              <h2 class="text-subtitle-1 font-weight-bold mb-0 text-high-emphasis">
                {{ title || 'Curator Agent Harness' }}
              </h2>
              <v-chip
                size="x-small"
                variant="flat"
                :color="isPaused ? 'warning' : 'success'"
                class="font-weight-bold px-2"
              >
                {{ isPaused ? '⏸ PAUSED' : '● ACTIVE' }}
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ subtitle || 'Standard Operator Prompt & Execution Testbench over GraphQL' }}
            </div>
          </div>
        </div>

        <div class="d-flex align-center ga-2 flex-wrap">
          <!-- Engine Pause / Resume -->
          <v-btn
            size="small"
            variant="tonal"
            :color="isPaused ? 'success' : 'warning'"
            :loading="togglingPause"
            prepend-icon="mdi-motion-play-outline"
            @click="handleTogglePause"
          >
            {{ isPaused ? 'Resume Engine' : 'Pause Engine' }}
          </v-btn>

          <!-- Storage Engine Badge -->
          <v-chip size="small" variant="outlined" color="primary" prepend-icon="mdi-database-outline">
            {{ dbHealth?.storageEngine || 'SQLite' }}
          </v-chip>

          <!-- Refresh Data -->
          <v-btn
            size="small"
            variant="text"
            icon="mdi-refresh"
            title="Refresh All Data"
            :loading="refreshing"
            @click="loadAllData"
          />
        </div>
      </div>
    </v-card>

    <div class="pa-4 flex-grow-1">
      <!-- =================================================================== -->
      <!-- TOP DECK: Standard Harness OpPrompt & Live Output (Zero-Prop Shell)  -->
      <!-- =================================================================== -->
      <HarnessDeck />

      <!-- =================================================================== -->
      <!-- BOTTOM DECK: Vuetify over GraphQL Workspaces Tabs                   -->
      <!-- =================================================================== -->
      <v-card elevation="1" rounded="lg" class="border" color="surface">
        <v-tabs
          v-model="activeWorkspaceTab"
          color="primary"
          density="compact"
          class="border-b"
        >
          <v-tab value="agents" prepend-icon="mdi-robot">
            Agents ({{ agents.length }})
          </v-tab>
          <v-tab value="tools" prepend-icon="mdi-wrench">
            Tools ({{ tools.length }})
          </v-tab>
          <v-tab value="requests" prepend-icon="mdi-history">
            Requests ({{ requests.length }})
          </v-tab>
          <v-tab value="workflow" prepend-icon="mdi-sitemap">
            Workflow Studio
          </v-tab>
          <v-tab value="db" prepend-icon="mdi-database-eye-outline">
            Database &amp; Storage
          </v-tab>
          <v-tab value="graphql" prepend-icon="mdi-graphql">
            GraphQL Studio
          </v-tab>
          <v-tab value="events" prepend-icon="mdi-broadcast">
            Events ({{ eventLogs.length }})
          </v-tab>
        </v-tabs>

        <v-card-text class="pa-4">
          <v-window v-model="activeWorkspaceTab">
            <v-window-item value="agents">
              <AgentsTab
                :agents="agents"
                @refresh="fetchAgents"
                @load-agent="loadAgentIntoOpPrompt"
              />
            </v-window-item>

            <v-window-item value="tools">
              <ToolsTab
                :tools="tools"
                @refresh="fetchTools"
                @load-tool="loadToolIntoOpPrompt"
              />
            </v-window-item>

            <v-window-item value="requests">
              <RequestsTab
                :requests="requests"
                @refresh="fetchRequests"
              />
            </v-window-item>

            <v-window-item value="workflow">
              <WorkflowStudioTab
                :adapter="adapter"
                @load-workflow="loadWorkflowIntoOpPrompt"
              />
            </v-window-item>

            <v-window-item value="db">
              <DatabaseHealthTab
                :db-health="dbHealth"
                :adapter="adapter"
                @refresh="fetchDbHealth"
              />
            </v-window-item>

            <v-window-item value="graphql">
              <GraphQLStudioTab
                :adapter="adapter"
              />
            </v-window-item>

            <v-window-item value="events">
              <EventStreamTab
                :event-logs="eventLogs"
                @clear="eventLogs = []"
              />
            </v-window-item>
          </v-window>
        </v-card-text>
      </v-card>
    </div>

    <!-- =================================================================== -->
    <!-- PROGRAM COMMANDS CONTEXT MENU                                       -->
    <!-- =================================================================== -->
    <HarnessContextMenu />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { CuratorConsoleAdapter, DatabaseHealth } from './types';
import { provideHarnessContext } from './context';
import {
  GET_AGENTS_QUERY,
  GET_TOOLS_QUERY,
  GET_CURATOR_REQUESTS_QUERY,
  GET_DATABASE_HEALTH_QUERY,
  TRIGGER_AGENT_MUTATION,
  EXECUTE_TOOL_MUTATION,
  COMPILE_COFFEESCRIPT_MUTATION,
  BROADCAST_EVENT_MUTATION,
  TOGGLE_ENGINE_PAUSE_MUTATION,
} from './graphqlOperations';

import HarnessDeck from './components/harness/HarnessDeck.vue';
import HarnessContextMenu from './components/harness/HarnessContextMenu.vue';
import type { ChoiceItem } from './components/harness/HarnessChoices.vue';
import type { TurnHistoryEntry } from './components/harness/HarnessOutput.vue';

import AgentsTab from './components/tabs/AgentsTab.vue';
import ToolsTab from './components/tabs/ToolsTab.vue';
import RequestsTab from './components/tabs/RequestsTab.vue';
import WorkflowStudioTab from './components/tabs/WorkflowStudioTab.vue';
import DatabaseHealthTab from './components/tabs/DatabaseHealthTab.vue';
import GraphQLStudioTab from './components/tabs/GraphQLStudioTab.vue';
import EventStreamTab, { type EventLogEntry } from './components/tabs/EventStreamTab.vue';

interface Props {
  adapter?: CuratorConsoleAdapter;
  title?: string;
  subtitle?: string;
  hideHeader?: boolean;
  standalone?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  hideHeader: false,
  standalone: false,
});

// Engine & Health State
const isPaused = ref(false);
const refreshing = ref(false);
const togglingPause = ref(false);
const dbHealth = ref<DatabaseHealth | null>(null);

// Workspace Tabs State
const activeWorkspaceTab = ref('agents');
const agents = ref<any[]>([]);
const tools = ref<any[]>([]);
const requests = ref<any[]>([]);
const eventLogs = ref<EventLogEntry[]>([]);

// OpPrompt State
const execMode = ref<'agent' | 'tool' | 'workflow'>('agent');
const selectedAgent = ref('');
const selectedTool = ref('');
const selectedWorkflowPreset = ref('pingpong');

const promptInput = ref('');
const toolArgsInput = ref('{\n  "baseValue": 42,\n  "multiplier": 3\n}');
const workflowInput = ref(`# Natural CoffeeScript Verbs AST Workflow
while_loop "$context.turn <= 5",
  seq [
    wait_event "game:ping"
    set_state turn: "$context.turn + 1", score: "$context.turn * 10"
    emit_event "game:pong", turn: "$context.turn", sender: "alpha"
  ]`);

const userContextName = ref('User');
const conversationContextId = ref('conv_blueprint');

const promptHistory = ref<string[]>([]);
const promptHistoryIndex = ref<number>(-1);

// Choices State (Dictated Dynamically by AST Workflow - NO hardcoded presets)
const choicesDisplayMode = ref<'radio' | 'checkbox' | 'chips'>('radio');
const selectedRadioChoice = ref<string | null>(null);
const selectedCheckboxes = ref<string[]>([]);
const selectedChipChoice = ref<string | null>(null);

const availableChoices = ref<ChoiceItem[]>([]);
const workflowChoicePrompt = ref<string>('');
const workflowWaitingRequestId = ref<string | null>(null);
const workflowChoiceEvent = ref<string>('curator:choice');
const workflowChoiceAs = ref<string | null>(null);

// Program Commands Context Menu State
const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);

// Execution State
const executing = ref(false);
const liveStepMessage = ref<string | null>(null);
const lastExecChoice = ref<any | null>(null);
const lastExecStatus = ref<string | null>(null);
const lastExecDuration = ref<number | null>(null);
const lastExecRequestId = ref<string | null>(null);
const lastExecTarget = ref<string | null>(null);
const lastExecMode = ref<string | null>(null);
const lastExecOutput = ref<string | null>(null);
const lastExecResponses = ref<Array<{ content: string }>>([]);
const lastExecRaw = ref<any | null>(null);
const lastExecError = ref<string | null>(null);
const outputTab = ref<'formatted' | 'json' | 'history'>('formatted');

const turnHistory = ref<TurnHistoryEntry[]>([]);

// Workflow Presets
const workflowPresetItems = [
  { title: 'Ping-Pong Event Loop', value: 'pingpong' },
  { title: 'Sequential Tool Execution', value: 'seq' },
  { title: 'Stateful Accumulator', value: 'state' },
];

const workflowPresets: Record<string, string> = {
  pingpong: `# Natural CoffeeScript Verbs AST Workflow
while_loop "$context.turn <= 5",
  seq [
    wait_event "game:ping"
    set_state turn: "$context.turn + 1", score: "$context.turn * 10"
    emit_event "game:pong", turn: "$context.turn", sender: "alpha"
  ]`,
  seq: `# Sequential Tool Pipeline
seq [
  tool "calculate_metric", baseValue: 25, multiplier: 4
  emit_event "metric:computed", value: 100
]`,
  state: `# Stateful Counter Loop
while_loop "$context.count < 3",
  seq [
    set_state count: "$context.count + 1"
    emit_event "counter:tick", current: "$context.count"
  ]`,
};

watch(selectedWorkflowPreset, (val) => {
  if (workflowPresets[val]) {
    workflowInput.value = workflowPresets[val];
  }
});

watch(selectedTool, (toolName) => {
  onToolSelected(toolName);
});

// Computed Choice State
const activeChoiceValue = computed(() => {
  if (choicesDisplayMode.value === 'radio') return selectedRadioChoice.value;
  if (choicesDisplayMode.value === 'checkbox') return selectedCheckboxes.value;
  return selectedChipChoice.value;
});

function clearChoiceSelection() {
  selectedRadioChoice.value = null;
  selectedCheckboxes.value = [];
  selectedChipChoice.value = null;
}

function formatChoiceDisplay(choice: any): string {
  if (!choice) return '';
  if (Array.isArray(choice)) return choice.join(', ');
  if (typeof choice === 'object') return choice.label || choice.value || JSON.stringify(choice);
  return String(choice).toUpperCase();
}

function getChoiceColor(val: any): string {
  const s = String(val).toLowerCase();
  if (s.includes('call') || s.includes('approve') || s.includes('yes') || s.includes('ok') || s.includes('accept')) return 'success';
  if (s.includes('raise') || s.includes('bet') || s.includes('warn') || s.includes('change')) return 'warning';
  if (s.includes('fold') || s.includes('reject') || s.includes('no') || s.includes('cancel')) return 'error';
  if (s.includes('check') || s.includes('info') || s.includes('status')) return 'info';
  return 'primary';
}

function updateChoicesFromPayload(payload: any, eventType?: string) {
  const incomingChoices = payload?.choices || payload?.activeChoices;
  if (Array.isArray(incomingChoices) && incomingChoices.length > 0) {
    availableChoices.value = incomingChoices.map((c: any, i: number) => {
      if (typeof c === 'string') {
        return {
          label: c,
          value: c,
          action: c.toUpperCase(),
          color: getChoiceColor(c),
        };
      }
      const val = c.value !== undefined ? c.value : (c.id || c.action || `choice_${i}`);
      const label = c.label || c.title || c.name || String(val);
      return {
        label,
        value: String(val),
        action: c.action || (typeof val === 'string' ? val.toUpperCase() : undefined),
        color: c.color || getChoiceColor(val),
        tool: c.tool,
        args: c.args,
      };
    });

    workflowChoicePrompt.value = payload.prompt || payload.choicePrompt || 'Workflow awaiting selection:';
    workflowWaitingRequestId.value = payload.requestId ? String(payload.requestId) : null;
    workflowChoiceEvent.value = payload.waitEvent || payload.event || 'curator:choice';
    workflowChoiceAs.value = payload.as || payload.choiceAs || null;

    const inputType = String(payload.inputType || '').toLowerCase();
    if (inputType.includes('check') || inputType.includes('multi')) {
      choicesDisplayMode.value = 'checkbox';
    } else if (inputType.includes('chip') || incomingChoices.length > 4) {
      choicesDisplayMode.value = 'chips';
    } else {
      choicesDisplayMode.value = 'radio';
    }

    if (choicesDisplayMode.value === 'radio' && availableChoices.value.length > 0) {
      selectedRadioChoice.value = availableChoices.value[0].value;
    }
  } else if (eventType === 'request_done' || payload?.status === 'COMPLETED') {
    if (workflowWaitingRequestId.value && String(payload?.requestId || payload?.id) === workflowWaitingRequestId.value) {
      availableChoices.value = [];
      workflowChoicePrompt.value = '';
      workflowWaitingRequestId.value = null;
      clearChoiceSelection();
    }
  }
}

// -----------------------------------------------------------------------------
// GraphQL Client Helper
// -----------------------------------------------------------------------------
async function executeGraphql(query: string, variables?: any): Promise<any> {
  if (props.adapter?.requestGraphql) {
    return props.adapter.requestGraphql(query, variables);
  }
  const res = await fetch('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed: ${res.statusText}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

// -----------------------------------------------------------------------------
// Data Loaders
// -----------------------------------------------------------------------------
async function fetchAgents() {
  try {
    const data = await executeGraphql(GET_AGENTS_QUERY);
    agents.value = data.agents || [];
    if (!selectedAgent.value && agents.value.length > 0) {
      selectedAgent.value = agents.value[0].name;
    }
  } catch (err) {
    console.warn('[Harness] fetchAgents failed:', err);
  }
}

async function fetchTools() {
  try {
    const data = await executeGraphql(GET_TOOLS_QUERY);
    tools.value = data.tools || [];
    if (!selectedTool.value && tools.value.length > 0) {
      selectedTool.value = tools.value[0].name;
    }
  } catch (err) {
    console.warn('[Harness] fetchTools failed:', err);
  }
}

async function fetchRequests() {
  try {
    const data = await executeGraphql(GET_CURATOR_REQUESTS_QUERY, { limit: 20 });
    requests.value = data.curatorRequests || [];

    // Reactive check: If any request in the database is currently WAITING_FOR_USER
    const waitingReq = requests.value.find((r: any) => r.status === 'WAITING_FOR_USER');
    if (waitingReq) {
      const ctx = typeof waitingReq.context === 'string' ? JSON.parse(waitingReq.context) : waitingReq.context;
      const incoming = ctx?.activeChoices || waitingReq.ast?.choices;
      if (incoming && incoming.length > 0) {
        updateChoicesFromPayload({
          requestId: waitingReq.id,
          prompt: ctx?.choicePrompt || 'Workflow awaiting selection:',
          choices: incoming,
          waitEvent: ctx?.waitEvent || 'curator:choice',
          as: ctx?.choiceAs || ctx?.as,
          inputType: ctx?.inputType,
        });
      }
    }
  } catch (err) {
    console.warn('[Harness] fetchRequests failed:', err);
  }
}

async function fetchDbHealth() {
  try {
    const data = await executeGraphql(GET_DATABASE_HEALTH_QUERY);
    dbHealth.value = data.curatorDatabaseHealth;
  } catch (err) {
    console.warn('[Harness] fetchDbHealth failed:', err);
  }
}

async function loadAllData() {
  refreshing.value = true;
  await Promise.allSettled([
    fetchAgents(),
    fetchTools(),
    fetchRequests(),
    fetchDbHealth(),
  ]);
  refreshing.value = false;
}

// -----------------------------------------------------------------------------
// OpPrompt Execution Engine
// -----------------------------------------------------------------------------
async function executeOpPrompt() {
  if (executing.value) return;

  const startTime = Date.now();
  executing.value = true;
  lastExecError.value = null;
  lastExecStatus.value = 'RUNNING';
  lastExecOutput.value = null;
  lastExecRaw.value = null;
  lastExecResponses.value = [];
  lastExecMode.value = execMode.value;

  try {
    if (execMode.value === 'agent') {
      const prompt = promptInput.value.trim();
      const chosen = activeChoiceValue.value;
      const hasChoice = chosen && (!Array.isArray(chosen) || chosen.length > 0);

      if (!prompt && !hasChoice) {
        throw new Error('Please select an action choice or enter a prompt instruction.');
      }
      lastExecTarget.value = selectedAgent.value;

      // Track history
      if (prompt && !promptHistory.value.includes(prompt)) {
        promptHistory.value.push(prompt);
      }
      promptHistoryIndex.value = promptHistory.value.length;

      // Combine choice and prompt text: e.g. [Action: RAISE] I'll see that bet
      let combinedPromptText = prompt;
      if (hasChoice) {
        const choiceLabel = formatChoiceDisplay(chosen);
        combinedPromptText = prompt ? `[Action: ${choiceLabel}] ${prompt}` : `[Action: ${choiceLabel}]`;
      }

      // Rich context payload merging choice and prompt speech
      const contextPayload: Record<string, any> = {
        message: combinedPromptText,
        speech: prompt || combinedPromptText,
        user: userContextName.value || 'User',
        conversationId: conversationContextId.value || 'conv_default',
      };

      if (hasChoice) {
        contextPayload.choice = chosen;
        contextPayload.choices = Array.isArray(chosen) ? chosen : [chosen];
        contextPayload.action = typeof chosen === 'string' ? chosen.toUpperCase() : chosen;
      }

      lastExecChoice.value = hasChoice ? chosen : null;

      // Follow Curator Core Channel & Messages contract: send messages through channel
      if (props.adapter?.send) {
        await props.adapter.send('user:speech', contextPayload);
      }

      // If fulfilling an active waiting AST workflow request, dispatch choice event to channel
      if (workflowWaitingRequestId.value && hasChoice) {
        const choicePayload = {
          choice: chosen,
          choices: Array.isArray(chosen) ? chosen : [chosen],
          action: typeof chosen === 'string' ? chosen.toUpperCase() : chosen,
          message: prompt,
          speech: prompt,
          requestId: workflowWaitingRequestId.value,
          as: workflowChoiceAs.value,
          conversationId: conversationContextId.value,
        };

        const choiceEvt = workflowChoiceEvent.value || 'curator:choice';
        if (props.adapter?.send) {
          await props.adapter.send(choiceEvt, choicePayload);
        } else if (props.adapter?.emitEvent) {
          await props.adapter.emitEvent(choiceEvt, choicePayload);
        } else {
          try {
            await executeGraphql(BROADCAST_EVENT_MUTATION, {
              type: choiceEvt,
              payload: choicePayload,
            });
          } catch (_) {}
        }

        if (props.adapter?.resumeRequest) {
          try {
            await props.adapter.resumeRequest(workflowWaitingRequestId.value);
          } catch (_) {}
        }
      }

      const result = await executeGraphql(TRIGGER_AGENT_MUTATION, {
        name: selectedAgent.value,
        context: JSON.stringify(contextPayload),
      });

      const triggerRes = result.triggerAgent;
      if (!triggerRes.success) throw new Error(triggerRes.error || 'Agent trigger failed');

      lastExecRequestId.value = triggerRes.requestId;

      // Reactive completion via channel and messages stream (matching CLI client)
      liveStepMessage.value = 'Streaming turn messages over channel...';

      let channelOutput: string | null = null;
      let channelRaw: any = null;

      await new Promise<void>((resolve, reject) => {
        let timer: any = null;
        let unsub: (() => void) | null = null;

        const onEvent = (type: string, payload: any) => {
          const evtReqId = String(payload?.requestId ?? payload?.id ?? '');

          // Live step updates
          if (!evtReqId || evtReqId === triggerRes.requestId) {
            if (type.includes('step') || type.includes('tool') || type.includes('log')) {
              liveStepMessage.value = payload?.message || payload?.tool || `Event: ${type}`;
            }
          }

          // Inbound message output stream on channel (matching CLI client)
          if (
            type === 'curator:message' ||
            type === 'curator:response' ||
            type === 'agent:response' ||
            type === 'chat:response'
          ) {
            channelOutput = payload?.text || payload?.content || payload?.message || (typeof payload === 'string' ? payload : JSON.stringify(payload));
            channelRaw = payload;
          } else if (type === 'curator:tool_call_result') {
            channelOutput = typeof payload?.result === 'object' ? JSON.stringify(payload.result, null, 2) : String(payload?.result ?? JSON.stringify(payload));
            channelRaw = payload;
          }

          // Request completion via WebSocket channel
          if (
            (type === 'request_done' || type === 'request_failed' || type === 'request_poisoned') &&
            (!evtReqId || evtReqId === triggerRes.requestId)
          ) {
            if (type === 'request_done' && !channelOutput) {
              channelOutput = payload?.output || payload?.response?.content || payload?.result || (payload?.responses?.[0]?.content) || 'Turn completed.';
              channelRaw = payload;
            }
            cleanup();
            if (type === 'request_failed' || type === 'request_poisoned') {
              reject(new Error(`Agent request failed: ${payload?.status || type}`));
            } else {
              resolve();
            }
          }
        };

        if (props.adapter?.onProgress) {
          unsub = props.adapter.onProgress(onEvent);
        } else if (props.adapter?.on) {
          unsub = props.adapter.on((e) => onEvent(e.type, e.payload));
        }

        // 30s safety timeout in case WebSocket disconnected
        timer = setTimeout(() => {
          cleanup();
          resolve();
        }, 30000);

        function cleanup() {
          if (timer) clearTimeout(timer);
          if (unsub) unsub();
        }
      });

      lastExecStatus.value = 'COMPLETED';
      lastExecOutput.value = channelOutput || 'Turn completed.';
      lastExecRaw.value = channelRaw || triggerRes;
    } else if (execMode.value === 'tool') {
      lastExecTarget.value = selectedTool.value;
      const parsedArgs = JSON.parse(toolArgsInput.value || '{}');

      // Send tool_call message through channel (matching CLI client)
      if (props.adapter?.send) {
        await props.adapter.send('curator:tool_call', {
          tool: selectedTool.value,
          args: parsedArgs,
        });
      }

      const result = await executeGraphql(EXECUTE_TOOL_MUTATION, {
        name: selectedTool.value,
        args: parsedArgs,
      });

      const toolRes = result.executeTool;
      if (!toolRes.success) throw new Error(toolRes.error || 'Tool execution failed');

      lastExecStatus.value = 'COMPLETED';
      lastExecRaw.value = toolRes.result;
      lastExecOutput.value = JSON.stringify(toolRes.result, null, 2);
    } else if (execMode.value === 'workflow') {
      lastExecTarget.value = 'CoffeeScript Workflow';
      const result = await executeGraphql(COMPILE_COFFEESCRIPT_MUTATION, {
        code: workflowInput.value,
      });

      const compRes = result.compileCoffeeScript;
      if (!compRes.success) throw new Error(compRes.error || 'Workflow compilation failed');

      lastExecStatus.value = 'COMPLETED';
      lastExecRaw.value = compRes.ast;
      lastExecOutput.value = `Workflow AST Compiled Successfully:\n${JSON.stringify(compRes.ast, null, 2)}`;
    }

    lastExecDuration.value = Date.now() - startTime;

    const chosenSnapshot = lastExecChoice.value;
    const historyPrompt = promptInput.value
      ? `${chosenSnapshot ? `[${formatChoiceDisplay(chosenSnapshot)}] ` : ''}${promptInput.value}`
      : (chosenSnapshot ? `[${formatChoiceDisplay(chosenSnapshot)}]` : `${execMode.value}: ${lastExecTarget.value}`);

    // Record in Turn History
    turnHistory.value.unshift({
      id: String(Date.now()),
      target: lastExecTarget.value || 'target',
      mode: execMode.value,
      choice: chosenSnapshot,
      prompt: historyPrompt,
      output: lastExecOutput.value || '',
      timestamp: Date.now(),
    });

    fetchRequests();
    fetchDbHealth();
  } catch (err: any) {
    lastExecStatus.value = 'FAILED';
    lastExecError.value = err.message || 'Execution error';
    lastExecDuration.value = Date.now() - startTime;
  } finally {
    executing.value = false;
    liveStepMessage.value = null;
  }
}

// -----------------------------------------------------------------------------
// Interactive Helpers & Loaders
// -----------------------------------------------------------------------------
function loadAgentIntoOpPrompt(agentName: string) {
  execMode.value = 'agent';
  selectedAgent.value = agentName;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadToolIntoOpPrompt(tool: any) {
  execMode.value = 'tool';
  selectedTool.value = tool.name;
  onToolSelected(tool.name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onToolSelected(toolName: string) {
  const tool = tools.value.find((t) => t.name === toolName);
  if (tool?.parameters?.properties) {
    const template: Record<string, any> = {};
    for (const [k, v] of Object.entries<any>(tool.parameters.properties)) {
      template[k] = v.default !== undefined ? v.default : v.type === 'number' ? 0 : 'sample';
    }
    toolArgsInput.value = JSON.stringify(template, null, 2);
  } else {
    toolArgsInput.value = '{\n  "input": "sample"\n}';
  }
}

function loadWorkflowIntoOpPrompt(code?: string) {
  execMode.value = 'workflow';
  if (code) {
    workflowInput.value = code;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearPromptInput() {
  if (execMode.value === 'agent') promptInput.value = '';
  else if (execMode.value === 'tool') toolArgsInput.value = '{}';
  else workflowInput.value = '';
}

function navigateHistory(direction: number) {
  const nextIdx = promptHistoryIndex.value + direction;
  if (nextIdx >= 0 && nextIdx < promptHistory.value.length) {
    promptHistoryIndex.value = nextIdx;
    promptInput.value = promptHistory.value[nextIdx];
  }
}

function loadTurnIntoOutput(turn: TurnHistoryEntry) {
  lastExecTarget.value = turn.target;
  lastExecOutput.value = turn.output;
  lastExecChoice.value = turn.choice || null;
  outputTab.value = 'formatted';
}

function focusPromptInput() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// -----------------------------------------------------------------------------
// Context Menu Handlers
// -----------------------------------------------------------------------------
function openContextMenu(e: MouseEvent) {
  const target = (e.currentTarget || e.target) as HTMLElement;
  if (e.clientX && e.clientY && e.button === 2) {
    contextMenuX.value = e.clientX;
    contextMenuY.value = e.clientY;
  } else if (target && typeof target.getBoundingClientRect === 'function') {
    const rect = target.getBoundingClientRect();
    contextMenuX.value = rect.left;
    contextMenuY.value = rect.bottom + 4;
  } else {
    contextMenuX.value = e.clientX || 100;
    contextMenuY.value = e.clientY || 100;
  }
  contextMenuVisible.value = true;
}

function selectChoiceFromMenu(val: string) {
  if (choicesDisplayMode.value === 'radio') {
    selectedRadioChoice.value = val;
  } else if (choicesDisplayMode.value === 'chips') {
    selectedChipChoice.value = val;
  } else {
    if (!selectedCheckboxes.value.includes(val)) {
      selectedCheckboxes.value.push(val);
    }
  }
  contextMenuVisible.value = false;
}

function insertToolCommand(tool: any) {
  execMode.value = 'agent';
  promptInput.value = promptInput.value
    ? `${promptInput.value}\n[Tool: ${tool.name}]`
    : `Execute tool ${tool.name}`;
  contextMenuVisible.value = false;
}

function switchAgentFromMenu(agentName: string) {
  selectedAgent.value = agentName;
  execMode.value = 'agent';
  contextMenuVisible.value = false;
}

async function executeCommand(cmd: string) {
  contextMenuVisible.value = false;
  if (cmd === '/status') {
    activeWorkspaceTab.value = 'db';
    fetchDbHealth();
  } else if (cmd === '/pause') {
    handleTogglePause();
  } else if (cmd === '/workflow') {
    activeWorkspaceTab.value = 'workflow';
  } else if (cmd === '/export') {
    if (props.adapter?.exportDatabase) props.adapter.exportDatabase();
    else window.open('/api/curator/db/export', '_blank');
  } else if (cmd === '/clear') {
    clearPromptInput();
    lastExecOutput.value = null;
    lastExecRaw.value = null;
  }
}

// -----------------------------------------------------------------------------
// Engine & DB Controls
// -----------------------------------------------------------------------------
async function handleTogglePause() {
  togglingPause.value = true;
  try {
    if (props.adapter?.togglePause) {
      isPaused.value = await props.adapter.togglePause();
    } else {
      const data = await executeGraphql(TOGGLE_ENGINE_PAUSE_MUTATION);
      isPaused.value = data.toggleEnginePause;
    }
  } catch (err: any) {
    alert(`Could not toggle engine pause: ${err.message}`);
  } finally {
    togglingPause.value = false;
  }
}

// -----------------------------------------------------------------------------
// Provide Harness Context to all Child Components (Zero-Prop Injection)
// -----------------------------------------------------------------------------
provideHarnessContext({
  agents,
  tools,
  workflowPresetItems,
  isPaused,
  execMode,
  selectedAgent,
  selectedTool,
  selectedWorkflowPreset,
  promptInput,
  toolArgsInput,
  workflowInput,
  userContextName,
  conversationContextId,
  promptHistory,
  promptHistoryIndex,
  choicesDisplayMode,
  selectedRadioChoice,
  selectedCheckboxes,
  selectedChipChoice,
  availableChoices,
  workflowChoicePrompt,
  workflowWaitingRequestId,
  activeChoiceValue,
  executing,
  liveStepMessage,
  lastExecChoice,
  lastExecStatus,
  lastExecDuration,
  lastExecRequestId,
  lastExecTarget,
  lastExecMode,
  lastExecOutput,
  lastExecResponses,
  lastExecRaw,
  lastExecError,
  outputTab,
  turnHistory,
  contextMenuVisible,
  contextMenuX,
  contextMenuY,
  executeOpPrompt,
  submitChoice: executeOpPrompt,
  clearChoices: clearChoiceSelection,
  clearPrompt: clearPromptInput,
  navigateHistory,
  loadTurn: loadTurnIntoOutput,
  openContextMenu,
  selectChoiceFromMenu,
  switchAgentFromMenu,
  insertToolCommand,
  executeCommand,
  focusPrompt: focusPromptInput,
});

// -----------------------------------------------------------------------------
// Lifecycle & Event Bus Listener
// -----------------------------------------------------------------------------
let unsubscribeProgress: (() => void) | null = null;
let unsubscribeDbChange: (() => void) | null = null;

onMounted(() => {
  loadAllData();

  if (props.adapter?.onProgress) {
    unsubscribeProgress = props.adapter.onProgress((type, payload) => {
      eventLogs.value.unshift({ type, payload, timestamp: Date.now() });
      if (eventLogs.value.length > 100) eventLogs.value.pop();

      // Automatically capture active choices emitted by Host / Workflows over WebSocket!
      const incoming = payload?.choices || payload?.activeChoices;
      if (Array.isArray(incoming) && incoming.length > 0) {
        updateChoicesFromPayload(payload, type);
      }
    });
  }

  if (props.adapter?.onDatabaseChange) {
    unsubscribeDbChange = props.adapter.onDatabaseChange(() => {
      fetchRequests();
      fetchDbHealth();
    });
  }
});

onUnmounted(() => {
  if (unsubscribeProgress) unsubscribeProgress();
  if (unsubscribeDbChange) unsubscribeDbChange();
});
</script>

<style scoped>
.z-10 {
  z-index: 10;
}
</style>
