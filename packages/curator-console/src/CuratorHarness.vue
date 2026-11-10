<template>
  <div class="d-flex flex-column min-vh-100 bg-background text-high-emphasis w-100">
    <!-- Top & Right Masthead / Header Bar -->
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
              {{ subtitle || 'Top-Down Stack & 2-Column Worktable over GraphQL & AST' }}
            </div>
          </div>
        </div>

        <!-- Top-Right Toolbar & Menus -->
        <div class="d-flex align-center ga-2 flex-wrap">
          <v-btn
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-view-grid-outline"
            @click="showResourcesSurface()"
          >
            App Resources
          </v-btn>

          <v-btn-toggle
            v-model="layoutMode"
            mandatory
            density="compact"
            color="primary"
            variant="outlined"
          >
            <v-btn value="stack" size="small" title="Top-Down Stack: Feedback above Prompt">
              <v-icon size="16" class="me-1">mdi-view-sequential-outline</v-icon>
              Stack
            </v-btn>
            <v-btn value="workbench" size="small" title="2-Column Split: Prompt+Feedback | Scene Worktable">
              <v-icon size="16" class="me-1">mdi-view-split-vertical</v-icon>
              Worktable
            </v-btn>
          </v-btn-toggle>

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
      <!-- PRIMARY DECK: Top-Down Stack OR Two-Column Prompt & Worktable       -->
      <!-- =================================================================== -->
      <HarnessDeck />

      <!-- =================================================================== -->
      <!-- LOWER DIAGNOSTICS & WORKSPACE TABS                                  -->
      <!-- =================================================================== -->
      <v-card elevation="1" rounded="lg" class="border" color="surface">
        <v-tabs
          v-model="activeWorkspaceTab"
          color="primary"
          density="compact"
          class="border-b"
        >
          <v-tab value="resources" prepend-icon="mdi-folder-multiple-image">
            Resources ({{ uiSurface?.total ?? uiSurface?.items?.length ?? 0 }})
          </v-tab>
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
          <v-tab v-if="conversations.available.value" value="conversations" prepend-icon="mdi-forum-outline">
            Conversations
          </v-tab>
          <v-tab value="settings" prepend-icon="mdi-cog-outline">
            Settings
          </v-tab>
        </v-tabs>

        <v-card-text class="pa-4">
          <v-window v-model="activeWorkspaceTab">
            <v-window-item value="resources">
              <HarnessResourceDetail
                v-if="activeResourceDetail"
                :item="activeResourceDetail"
              />
              <HarnessResourceCollection
                v-else
                :surface="uiSurface"
              />
            </v-window-item>

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

            <v-window-item value="conversations">
              <ConversationsTab :list="conversations" :stream="channelStream" :active-external-id="conversationContextId" @open="openConversation" />
            </v-window-item>

            <v-window-item value="settings">
              <SettingsTab :config="pluginConfig" />
            </v-window-item>
          </v-window>
        </v-card-text>
      </v-card>
    </div>

    <!-- =================================================================== -->
    <!-- CONTEXTUAL MENUS (Program Commands & Resource-Scoped Menu)          -->
    <!-- =================================================================== -->
    <HarnessContextMenu />
    <HarnessResourceContextMenu />
    <HarnessToolArgsDialog />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { parseSpeechActs, interruptOptions, interruptTitle, PROGRESS_EVENT_TYPE, extractSurface, parseComposerInput } from '@curator/host/contracts';
import type {
  CuratorConsoleAdapter,
  DatabaseHealth,
  HarnessLayoutMode,
  HarnessResourceViewMode,
  HarnessResourceItem,
  HarnessUiSurface,
  HarnessUploadedFile,
} from './types';
import { provideHarnessContext } from './context';
import { useRunTimeline } from './composables/useRunTimeline';
import { useChoices } from './composables/useChoices';
import { useInterrupts } from './composables/useInterrupts';
import { useMessageActions, type HarnessMessageRef } from './composables/useMessageActions';
import {
  GET_AGENTS_QUERY,
  GET_TOOLS_QUERY,
  GET_TOOLS_QUERY_BASIC,
  GET_AGENTS_QUERY_BASIC,
  ALLOWED_ACTIONS_QUERY,
  GET_CURATOR_REQUEST_BY_ID_QUERY,
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
import HarnessToolArgsDialog from './components/harness/HarnessToolArgsDialog.vue';
import HarnessResourceContextMenu from './components/harness/HarnessResourceContextMenu.vue';
import HarnessResourceCollection from './components/harness/HarnessResourceCollection.vue';
import HarnessResourceDetail from './components/harness/HarnessResourceDetail.vue';
import type { ChoiceItem } from './components/harness/HarnessChoices.vue';
import type { TurnHistoryEntry } from './components/harness/HarnessOutput.vue';

import AgentsTab from './components/tabs/AgentsTab.vue';
import ToolsTab from './components/tabs/ToolsTab.vue';
import RequestsTab from './components/tabs/RequestsTab.vue';
import WorkflowStudioTab from './components/tabs/WorkflowStudioTab.vue';
import DatabaseHealthTab from './components/tabs/DatabaseHealthTab.vue';
import GraphQLStudioTab from './components/tabs/GraphQLStudioTab.vue';
import EventStreamTab, { type EventLogEntry } from './components/tabs/EventStreamTab.vue';
import SettingsTab from './components/tabs/SettingsTab.vue';
import ConversationsTab from './components/tabs/ConversationsTab.vue';
import { usePluginConfig } from './composables/usePluginConfig';
import { useSurfaces } from './composables/useSurfaces';
import { useCommandCatalog, isCommandAllowed } from './composables/useCommandCatalog';
import { useAttachments, promptWithAttachments, type AttachedResource } from './composables/useAttachments';
import { useSources } from './composables/useSources';
import { usePromptLibrary } from './composables/usePromptLibrary';
import { useConversations, type ConversationView } from './composables/useConversations';
import { useChannelStream } from './composables/useChannelStream';

interface Props {
  adapter?: CuratorConsoleAdapter;
  title?: string;
  subtitle?: string;
  hideHeader?: boolean;
  standalone?: boolean;
  defaultLayout?: HarnessLayoutMode;
  customComponents?: Record<string, any>;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  hideHeader: false,
  standalone: false,
  defaultLayout: 'stack',
  customComponents: () => ({}),
});

// Engine & Health State
const isPaused = ref(false);
const refreshing = ref(false);
const togglingPause = ref(false);
const dbHealth = ref<DatabaseHealth | null>(null);

// Layout & Generative UI Surface State
const layoutMode = ref<HarnessLayoutMode>(props.defaultLayout || 'stack');
// Surfaces of this session (output panel); the active one is what the surface tab and the worktable show
const surfaces = useSurfaces();
const uiSurface = surfaces.active;
const worktableSurface = surfaces.active;
const resourceViewMode = ref<HarnessResourceViewMode>('grid');
const resourceSearchQuery = ref('');
const resourceCategoryFilter = ref('');
const resourceAuthorFilter = ref('');
const resourcePublishedFilter = ref<'all' | 'published' | 'draft'>('all');
const selectedResourceKeys = ref<string[]>([]);
const activeResourceDetail = ref<HarnessResourceItem | null>(null);

// File Upload State
const pendingUploadFiles = ref<HarnessUploadedFile[]>([]);
const uploadingFiles = ref(false);

// Workspace Tabs State
const activeWorkspaceTab = ref('agents');
const agents = ref<any[]>([]);
const tools = ref<any[]>([]);
const requests = ref<any[]>([]);
const eventLogs = ref<EventLogEntry[]>([]);

// OpPrompt State
// The agent prompt, or the CoffeeScript editor opened from the workflow studio
const execMode = ref<'agent' | 'workflow'>('agent');
const selectedAgent = ref('');
const selectedWorkflowPreset = ref('pingpong');

const promptInput = ref('');
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

// Choices State (one source at a time: an open interrupt wins over speech-act and workflow choices)
const choices = useChoices();
const {
  choicesDisplayMode,
  selectedRadioChoice,
  selectedCheckboxes,
  selectedChipChoice,
  availableChoices,
  workflowChoicePrompt,
  workflowWaitingRequestId,
  workflowChoiceEvent,
  workflowChoiceAs,
  activeChoiceValue,
} = choices;

// Program Commands Context Menu State
const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);

// Resource Contextual Menu State (Close by Resource)
const resourceContextMenuVisible = ref(false);
const resourceContextMenuX = ref(0);
const resourceContextMenuY = ref(0);
const resourceContextMenuTarget = ref<HarnessResourceItem | null>(null);

// Execution State
const executing = ref(false);
const liveStepMessage = ref<string | null>(null);
// Typed progress for the current turn; its latest line also drives liveStepMessage.
const runTimeline = useRunTimeline(props.adapter?.onProgress?.bind(props.adapter));
watch(runTimeline.activeLine, (line) => {
  if (line && executing.value) liveStepMessage.value = line;
});

// Open interrupts, answered through conversation_resume via executeTool (host.runTool)
async function runHostTool(name: string, args: Record<string, unknown>): Promise<any> {
  const data = await executeGraphql(EXECUTE_TOOL_MUTATION, { name, args });
  const res = data?.executeTool;
  if (!res?.success) throw new Error(res?.error || `Tool '${name}' failed`);
  return res.result;
}
const interrupts = useInterrupts(props.adapter?.onProgress?.bind(props.adapter), runHostTool);
// Tools offered on messages (ui.messageAction), opened from the context menu on a turn
const messageActions = useMessageActions(tools, runHostTool);
// Plugin settings (config_get / config_set / config_unset)
const pluginConfig = usePluginConfig(runHostTool);
// One command list for the composer (/ and @), the context menu and the CLI vocabulary
// Host actions the user may perform (db.status, db.export): commands needing others are hidden and refused
const allowedActions = ref<string[]>([]);
// # attachments: resource suggestions and the chips sent with the next turn
const attachments = useAttachments(tools, runHostTool);
// Prompt library: saved project prompts and MCP prompts, offered after / (reloaded with the tool list)
const promptLibrary = usePromptLibrary(tools, runHostTool);
// Conversation organisation (conversation_list / _rename / _pin / _archive / _delete)
const conversations = useConversations(tools, runHostTool);
// The shared message stream of an open channel (channel_messages / channel_post)
const channelStream = useChannelStream(tools, runHostTool, { subscribe: props.adapter?.onProgress?.bind(props.adapter) });
watch(tools, () => {
  promptLibrary.load();
  if (activeWorkspaceTab.value === 'conversations') conversations.load();
});
const commandCatalog = useCommandCatalog({ tools, agents, choices: availableChoices, allowedActions, resources: attachments.hits, prompts: promptLibrary.entries });
// Source chips under the latest answer: the run's tool calls and the resources attached to that turn
const lastAttached = ref<AttachedResource[]>([]);
const sources = useSources({
  run: runTimeline.current,
  attached: lastAttached,
  loadResponses: async (requestId) => {
    const data = await executeGraphql(GET_CURATOR_REQUEST_BY_ID_QUERY, { id: String(requestId) });
    return (data?.curatorRequest?.responses ?? []).map((r: any) => String(r?.content ?? ''));
  },
  runTool: runHostTool,
  show: (surface) => {
    surfaces.show(surface);
    outputTab.value = 'surface';
  },
});
// Tool picked in the composer whose required arguments are missing: asked for with a generated form
const toolFormTarget = ref<any | null>(null);
const toolFormArgs = ref<Record<string, unknown>>({});
const contextMenuTurn = ref<HarnessMessageRef | null>(null);
// A prompt interrupt with choices drives the choice bar; resolving it clears them
watch(interrupts.choiceInterrupt, (interrupt) => {
  if (!interrupt) {
    choices.clearChoices('interrupt');
    return;
  }
  const options = interruptOptions(interrupt);
  const resumeValues = new Map<string, unknown>();
  const items: ChoiceItem[] = options.map((o, i) => {
    const key = typeof o.value === 'string' ? o.value : `option_${i}`;
    resumeValues.set(key, o.value);
    return { label: o.label, value: key };
  });
  choices.setChoices('interrupt', items, {
    prompt: interruptTitle(interrupt),
    interruptId: interrupt.id,
    inputType: interrupt.payload?.inputType,
    resumeValues,
  });
});
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
const outputTab = ref<'surface' | 'formatted' | 'json' | 'history'>('formatted');

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
  tool "gallery_show_resources"
  emit_event "gallery:loaded"
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


const clearChoiceSelection = choices.clearSelection;

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
    const items: ChoiceItem[] = incomingChoices.map((c: any, i: number) => {
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
    choices.setChoices('workflow', items, {
      prompt: payload.prompt || payload.choicePrompt || 'Workflow awaiting selection:',
      requestId: payload.requestId ? String(payload.requestId) : null,
      event: payload.waitEvent || payload.event || 'curator:choice',
      as: payload.as || payload.choiceAs || null,
      inputType: payload.inputType,
    });
  } else if (eventType === 'request_done' || payload?.status === 'COMPLETED') {
    if (workflowWaitingRequestId.value && String(payload?.requestId || payload?.id) === workflowWaitingRequestId.value) {
      choices.clearChoices('workflow');
    }
  }
}

// -----------------------------------------------------------------------------
// Extract or Hydrate UI Surface from Tool / Agent Payloads
// -----------------------------------------------------------------------------
function applySurfaceIfPresent(payload: any, requestId?: string | number | null): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = extractSurface(payload) as HarnessUiSurface | null;
  if (candidate) {
    surfaces.show(candidate, { requestId });
    if (candidate.viewMode) {
      resourceViewMode.value = candidate.viewMode;
    }
    outputTab.value = 'surface';
    return true;
  }
  return false;
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
// Resource Surface & Contextual Actions
// -----------------------------------------------------------------------------
async function showResourcesSurface(filters: Record<string, any> = {}) {
  activeResourceDetail.value = null;
  try {
    if (props.adapter?.listResources) {
      const surface = await props.adapter.listResources(filters);
      uiSurface.value = surface;
      worktableSurface.value = surface;
      outputTab.value = 'surface';
      return;
    }

    // Prefer gallery_show_resources or gallery_search_items tool if available
    const resourceTool =
      tools.value.find((t: any) => t.name === 'gallery_show_resources') ||
      tools.value.find((t: any) => t.name === 'gallery_search_items') ||
      tools.value.find((t: any) => t.name === 'search_knowledge');

    if (resourceTool) {
      const res = await executeGraphql(EXECUTE_TOOL_MUTATION, {
        name: resourceTool.name,
        args: { limit: 200, ...filters },
      });
      if (res?.executeTool?.result) {
        applySurfaceIfPresent(res.executeTool.result);
        lastExecStatus.value = 'COMPLETED';
        lastExecTarget.value = resourceTool.name;
        lastExecRaw.value = res.executeTool.result;
        return;
      }
    }

    // Fallback to GraphQL galleryItems query if server exposes it
    const gqlData = await executeGraphql(
      `query GetResources($search: String, $categoryKey: String, $authorKey: String) {
        galleryItems(search: $search, categoryKey: $categoryKey, authorKey: $authorKey, publishedOnly: false, limit: 250) {
          id key name title: name link photo photoUrl thumbnailUrl published authorKey authorName description categoryKeys
          categories { key name link }
        }
        galleryCategories(includeUnpublished: true) { key name nameEn link published paintingCount }
        galleryAuthors { key name link paintingCount }
      }`,
      {
        search: filters.search || undefined,
        categoryKey: filters.categoryKey || undefined,
        authorKey: filters.authorKey || undefined,
      }
    );

    if (gqlData?.galleryItems) {
      applySurfaceIfPresent({
        title: 'Gallery Resources',
        items: gqlData.galleryItems,
        total: gqlData.galleryItems.length,
        categories: gqlData.galleryCategories || [],
        authors: gqlData.galleryAuthors || [],
      });
    }
  } catch (err: any) {
    console.warn('[Harness] showResourcesSurface fallback notice:', err?.message);
  }
}

async function openResourceDetail(item: HarnessResourceItem) {
  activeResourceDetail.value = item;
  outputTab.value = 'surface';
}

function openResourceContextMenu(e: MouseEvent, item: HarnessResourceItem) {
  resourceContextMenuTarget.value = item;
  const target = (e.currentTarget || e.target) as HTMLElement;
  if (e.clientX && e.clientY && e.button === 2) {
    resourceContextMenuX.value = e.clientX;
    resourceContextMenuY.value = e.clientY;
  } else if (target && typeof target.getBoundingClientRect === 'function') {
    const rect = target.getBoundingClientRect();
    resourceContextMenuX.value = rect.left;
    resourceContextMenuY.value = rect.bottom + 4;
  } else {
    resourceContextMenuX.value = e.clientX || 120;
    resourceContextMenuY.value = e.clientY || 120;
  }
  resourceContextMenuVisible.value = true;
}

async function handleResourceAction(action: string, item: HarnessResourceItem, payload?: any) {
  if (action === 'inspect' || action === 'edit') {
    await openResourceDetail(item);
    return;
  }

  if (action === 'reference-prompt') {
    execMode.value = 'agent';
    const refTag = `@resource:${item.key}`;
    promptInput.value = promptInput.value ? `${promptInput.value} ${refTag}` : `${refTag} `;
    return;
  }

  if (action === 'toggle-publish') {
    const nextPub = !item.published;
    await executeGraphql(EXECUTE_TOOL_MUTATION, {
      name: 'gallery_upsert_item',
      args: {
        key: item.key,
        name: item.title || item.name || item.key,
        published: nextPub,
      },
    });
    item.published = nextPub;
    await showResourcesSurface({
      search: resourceSearchQuery.value || undefined,
      categoryKey: resourceCategoryFilter.value || undefined,
      authorKey: resourceAuthorFilter.value || undefined,
    });
    return;
  }

  if (action === 'save-metadata' && payload) {
    await executeGraphql(EXECUTE_TOOL_MUTATION, {
      name: 'gallery_upsert_item',
      args: payload,
    });
    await showResourcesSurface({
      search: resourceSearchQuery.value || undefined,
      categoryKey: resourceCategoryFilter.value || undefined,
      authorKey: resourceAuthorFilter.value || undefined,
    });
    activeResourceDetail.value = null;
    return;
  }

  if (action === 'attach-file' && payload) {
    await executeGraphql(EXECUTE_TOOL_MUTATION, {
      name: 'gallery_upsert_item',
      args: {
        key: item.key,
        name: item.title || item.name || item.key,
        photo: payload.filename,
        photoUrl: payload.url,
      },
    });
    await showResourcesSurface();
    return;
  }

  if (action === 'regenerate-thumbnail') {
    await executeGraphql(EXECUTE_TOOL_MUTATION, {
      name: 'gallery_regenerate_thumbnail',
      args: { key: item.key },
    });
    await showResourcesSurface();
    return;
  }

  if (action === 'delete') {
    await executeGraphql(EXECUTE_TOOL_MUTATION, {
      name: 'gallery_delete_item',
      args: { key: item.key },
    });
    if (activeResourceDetail.value?.key === item.key) {
      activeResourceDetail.value = null;
    }
    await showResourcesSurface();
  }
}

async function handleBulkResourceAction(action: string, keys: string[], payload?: any) {
  if (!keys.length) return;
  await executeGraphql(EXECUTE_TOOL_MUTATION, {
    name: 'gallery_bulk_update',
    args: {
      keys,
      action,
      ...(payload || {}),
    },
  });
  await showResourcesSurface({
    search: resourceSearchQuery.value || undefined,
    categoryKey: resourceCategoryFilter.value || undefined,
    authorKey: resourceAuthorFilter.value || undefined,
  });
}

// -----------------------------------------------------------------------------
// File Upload Helper (Browser FileList -> Base64 -> VM Storage)
// -----------------------------------------------------------------------------
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function uploadFilesToStorage(
  fileList: FileList | File[],
  bucket = 'photos'
): Promise<HarnessUploadedFile[]> {
  const filesArray = Array.from(fileList);
  if (filesArray.length === 0) return [];

  uploadingFiles.value = true;
  try {
    const payloadFiles = await Promise.all(
      filesArray.map(async (f) => ({
        filename: f.name,
        data: await readFileAsBase64(f),
        mimeType: f.type || undefined,
        bucket,
      }))
    );

    let uploaded: HarnessUploadedFile[] = [];
    if (props.adapter?.uploadFiles) {
      const res = await props.adapter.uploadFiles(payloadFiles);
      uploaded = res.files || [];
    } else {
      const res = await fetch('/api/curator/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, files: payloadFiles }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Upload failed');
      }
      uploaded = json.files || [];
    }

    pendingUploadFiles.value.push(...uploaded);

    // Refresh resource surface if open
    if (uiSurface.value) {
      await showResourcesSurface();
    }

    return uploaded;
  } catch (err: any) {
    lastExecError.value = err?.message || 'File upload failed';
    return [];
  } finally {
    uploadingFiles.value = false;
  }
}

function removePendingUploadFile(index: number) {
  pendingUploadFiles.value.splice(index, 1);
}

// -----------------------------------------------------------------------------
// Data Loaders
// -----------------------------------------------------------------------------
async function fetchAllowedActions() {
  try {
    const data = await executeGraphql(ALLOWED_ACTIONS_QUERY);
    allowedActions.value = Array.isArray(data?.allowedActions) ? data.allowedActions : [];
  } catch {
    // Servers without the query: no role-controlled actions offered (allow-list)
    allowedActions.value = [];
  }
}

async function fetchAgents() {
  try {
    // Servers without presentation/capability fields reject the full query: fall back
    const data = await executeGraphql(GET_AGENTS_QUERY).catch(() => executeGraphql(GET_AGENTS_QUERY_BASIC));
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
    // Servers without the `ui` field on tools reject the full query: fall back (no message actions then)
    const data = await executeGraphql(GET_TOOLS_QUERY).catch(() => executeGraphql(GET_TOOLS_QUERY_BASIC));
    tools.value = data.tools || [];
  } catch (err) {
    console.warn('[Harness] fetchTools failed:', err);
  }
}

async function fetchRequests() {
  try {
    const data = await executeGraphql(GET_CURATOR_REQUESTS_QUERY, { limit: 20 });
    requests.value = data.curatorRequests || [];

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
  await fetchAllowedActions();
  await Promise.allSettled([
    fetchAgents(),
    fetchTools(),
    fetchRequests(),
    ...(allowedActions.value.includes('db.status') ? [fetchDbHealth()] : []),
  ]);
  refreshing.value = false;
}

// -----------------------------------------------------------------------------
// OpPrompt Execution Engine
// -----------------------------------------------------------------------------
async function executeOpPrompt() {
  if (executing.value) return;

  // `/1` or `/<choice value>` picks that choice, then submits like picking it in the choice bar
  const typed = promptInput.value.trim();
  if (typed.startsWith('/')) {
    const parsed = parseComposerInput(typed, commandCatalog.catalog.value);
    if (parsed.kind === 'choice') {
      selectChoiceFromMenu(String(parsed.entry.value ?? parsed.name));
      promptInput.value = '';
    }
  }

  const startTime = Date.now();
  executing.value = true;
  runTimeline.reset();
  lastAttached.value = [];
  lastExecError.value = null;
  lastExecStatus.value = 'RUNNING';
  lastExecOutput.value = null;
  lastExecRaw.value = null;
  lastExecResponses.value = [];
  lastExecMode.value = execMode.value;

  try {
    // Choices of an open interrupt are answers: resume it (conversation_resume) instead of starting a turn
    if (choices.source.value === 'interrupt' && choices.interruptId.value) {
      const chosen = activeChoiceValue.value;
      if (chosen == null || (Array.isArray(chosen) && chosen.length === 0)) throw new Error('Select an answer first.');
      const id = choices.interruptId.value;
      const answered = await interrupts.resume(id, choices.resumeValueFor(chosen));
      if (!answered) throw new Error(interrupts.error.value || 'Resume failed');
      lastExecTarget.value = `interrupt ${id}`;
      lastExecStatus.value = 'COMPLETED';
      lastExecOutput.value = `Answered: ${formatChoiceDisplay(chosen)}`;
      lastExecDuration.value = Date.now() - startTime;
      return;
    }

    if (execMode.value === 'agent') {
      let prompt = promptInput.value.trim();

      // Composer: `/command`, `/tool args`, `@agent message` (same vocabulary as the CLI)
      if (prompt.startsWith('/') || prompt.startsWith('@')) {
        const parsed = parseComposerInput(prompt, commandCatalog.catalog.value);
        if (parsed.kind === 'unknown') {
          throw new Error(parsed.trigger === '/' ? `Unknown command /${parsed.name}` : `Unknown agent @${parsed.name}`);
        }
        if (parsed.kind === 'command') {
          await executeCommand(`/${parsed.name}`);
          lastExecTarget.value = `/${parsed.name}`;
          lastExecStatus.value = 'COMPLETED';
          lastExecOutput.value = lastExecOutput.value ?? `Ran /${parsed.name}`;
          lastExecDuration.value = Date.now() - startTime;
          return;
        }
        if (parsed.kind === 'tool') {
          promptInput.value = '';
          if (parsed.missing.length > 0) {
            // Ask for the rest with the tool's schema form instead of failing validation
            toolFormTarget.value = parsed.entry;
            toolFormArgs.value = { ...parsed.args };
            lastExecStatus.value = null;
            return;
          }
          await runToolTurn(parsed.entry, parsed.args, startTime);
          return;
        }
        if (parsed.kind === 'prompt') {
          // A library prompt fills the prompt box for review; missing arguments are asked for with a form
          promptInput.value = '';
          lastExecStatus.value = null;
          if (parsed.missing.length > 0) {
            toolFormTarget.value = { ...parsed.entry, kind: 'prompt' };
            toolFormArgs.value = { ...parsed.args };
            return;
          }
          promptInput.value = await promptLibrary.render(parsed.entry, parsed.args);
          return;
        }
        if (parsed.kind === 'agent') {
          if (!parsed.message) throw new Error(`Type a message after @${parsed.name}`);
          selectedAgent.value = parsed.name;
          prompt = parsed.message;
        }
      }
      const chosen = activeChoiceValue.value;
      const hasChoice = chosen && (!Array.isArray(chosen) || chosen.length > 0);

      if (!prompt && !hasChoice) {
        throw new Error('Please select an action choice or enter a prompt instruction.');
      }

      // Check for natural-language resource surface command: e.g. "show app resources", "/resources"
      const normPrompt = prompt.toLowerCase();
      if (
        normPrompt === '/resources' ||
        normPrompt.includes('show app resources') ||
        normPrompt.includes('show resources') ||
        normPrompt.includes('show gallery') ||
        normPrompt.includes('grid view') ||
        normPrompt.includes('list view')
      ) {
        if (normPrompt.includes('list view')) resourceViewMode.value = 'list';
        else if (normPrompt.includes('grid view')) resourceViewMode.value = 'grid';

        await showResourcesSurface();
        lastExecStatus.value = 'COMPLETED';
        lastExecTarget.value = 'gallery_show_resources';
        lastExecOutput.value = `Rendered interactive Resource ${resourceViewMode.value.toUpperCase()} view in Feedback Pane (${uiSurface.value?.total ?? 0} items).`;
        lastExecDuration.value = Date.now() - startTime;
        turnHistory.value.unshift({
          id: String(Date.now()),
          target: 'gallery_show_resources',
          mode: 'agent',
          prompt,
          output: lastExecOutput.value,
          timestamp: Date.now(),
        });
        return;
      }

      lastExecTarget.value = selectedAgent.value;

      if (prompt && !promptHistory.value.includes(prompt)) {
        promptHistory.value.push(prompt);
      }
      promptHistoryIndex.value = promptHistory.value.length;

      // # attachments: each chip is attached to the conversation; the model gets their excerpts with the prompt
      const attachedResources = attachments.attachments.value.length > 0 ? await attachments.attachAll() : [];
      lastAttached.value = attachedResources;
      const promptBody = promptWithAttachments(prompt, attachedResources);
      let combinedPromptText = promptBody;
      if (hasChoice) {
        const choiceLabel = formatChoiceDisplay(chosen);
        combinedPromptText = promptBody ? `[Action: ${choiceLabel}] ${promptBody}` : `[Action: ${choiceLabel}]`;
      }

      const contextPayload: Record<string, any> = {
        message: combinedPromptText,
        speech: prompt || combinedPromptText,
        user: userContextName.value || 'User',
        conversationId: conversationContextId.value || 'conv_default',
        ...(pendingUploadFiles.value.length > 0 ? { attachments: pendingUploadFiles.value } : {}),
        ...(attachedResources.length > 0 ? { resources: attachedResources.map((r) => ({ uri: r.uri, title: r.title })) } : {}),
      };

      if (hasChoice) {
        contextPayload.choice = chosen;
        contextPayload.choices = Array.isArray(chosen) ? chosen : [chosen];
        contextPayload.action = typeof chosen === 'string' ? chosen.toUpperCase() : chosen;
      }

      lastExecChoice.value = hasChoice ? chosen : null;

      if (props.adapter?.send) {
        await props.adapter.send('user:speech', contextPayload);
      }

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
      liveStepMessage.value = 'Streaming turn messages over channel...';
      runTimeline.begin(triggerRes.requestId);

      let channelOutput: string | null = null;
      let channelRaw: any = null;

      await new Promise<void>((resolve, reject) => {
        let timer: any = null;
        let unsub: (() => void) | null = null;

        const onEvent = (type: string, payload: any) => {
          const evtReqId = String(payload?.requestId ?? payload?.id ?? '');

          // The run parked on an interrupt: end the turn so its card or choices can be answered
          if (
            type === PROGRESS_EVENT_TYPE &&
            payload?.kind === 'wait.opened' &&
            runTimeline.current.value?.conversationId != null &&
            payload.conversationId === runTimeline.current.value.conversationId
          ) {
            cleanup();
            resolve();
            return;
          }

          if (!evtReqId || evtReqId === triggerRes.requestId) {
            if (type.includes('step') || type.includes('tool') || type.includes('log')) {
              liveStepMessage.value = payload?.message || payload?.tool || `Event: ${type}`;
            }
          }

          if (
            type === 'curator:message' ||
            type === 'curator:response' ||
            type === 'agent:response' ||
            type === 'chat:response'
          ) {
            channelOutput = payload?.text || payload?.content || payload?.message || (typeof payload === 'string' ? payload : JSON.stringify(payload));
            channelRaw = payload;
            applySurfaceIfPresent(payload, payload?.requestId);
          } else if (type === 'curator:tool_call_result') {
            channelOutput = typeof payload?.result === 'object' ? JSON.stringify(payload.result, null, 2) : String(payload?.result ?? JSON.stringify(payload));
            channelRaw = payload;
            applySurfaceIfPresent(payload?.result, payload?.requestId);
          }

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

        timer = setTimeout(() => {
          cleanup();
          resolve();
        }, 30000);

        function cleanup() {
          if (timer) clearTimeout(timer);
          if (unsub) unsub();
        }
      });

      const parked = runTimeline.current.value?.status === 'waiting';
      lastExecStatus.value = parked ? 'WAITING_FOR_USER' : 'COMPLETED';
      lastExecOutput.value = channelOutput || (parked ? 'Waiting for your answer.' : 'Turn completed.');
      lastExecRaw.value = channelRaw || triggerRes;

      // Automatically hydrate choices from conversational speech acts (<choose> / <ask>)
      const parsedActs = parseSpeechActs(lastExecOutput.value);
      if (parsedActs.activeChoices.length > 0) {
        choices.setChoices(
          'speech',
          parsedActs.activeChoices.map((c) => ({ label: c.label, value: c.value, action: c.action })),
          { prompt: parsedActs.choiceGroups[0]?.prompt || 'Select an option to proceed' }
        );
      }
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
      outputTab.value = 'formatted';
    }

    lastExecDuration.value = Date.now() - startTime;

    const chosenSnapshot = lastExecChoice.value;
    const historyPrompt = promptInput.value
      ? `${chosenSnapshot ? `[${formatChoiceDisplay(chosenSnapshot)}] ` : ''}${promptInput.value}`
      : (chosenSnapshot ? `[${formatChoiceDisplay(chosenSnapshot)}]` : `${execMode.value}: ${lastExecTarget.value}`);

    turnHistory.value.unshift({
      id: String(Date.now()),
      target: lastExecTarget.value || 'target',
      mode: execMode.value,
      choice: chosenSnapshot,
      prompt: historyPrompt,
      output: lastExecOutput.value || '',
      timestamp: Date.now(),
      run: runTimeline.snapshot(),
      surfaceId: surfaces.entryFor(lastExecRequestId.value)?.id ?? null,
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
    runTimeline.end();
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

/** Opens a tool's argument form (the composer's `/tool` form); pending uploads fill file fields it declares. */
function openToolForm(tool: any) {
  const props: Record<string, any> = tool?.parameters?.properties ?? {};
  const args: Record<string, unknown> = {};
  const uploaded = pendingUploadFiles.value;
  if (uploaded.length > 0) {
    if ('files' in props) args.files = uploaded;
    if ('photo' in props) args.photo = uploaded[0].filename;
    if ('photoUrl' in props) args.photoUrl = uploaded[0].url;
  }
  toolFormArgs.value = args;
  toolFormTarget.value = tool;
}

function loadToolIntoOpPrompt(tool: any) {
  openToolForm(tool);
}

/** Leaves the CoffeeScript editor (opened from the workflow studio) for the agent prompt. */
function closeWorkflowEditor() {
  execMode.value = 'agent';
}

/** Continues a conversation from the list: later turns carry its id. */
function openConversation(c: ConversationView) {
  conversationContextId.value = c.externalId;
  clearPromptInput();
  lastExecOutput.value = null;
  lastExecRaw.value = null;
  lastExecStatus.value = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  contextMenuTurn.value = null;
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

/** Shows a tool result like a tool turn: output, surface, history. */
function showToolResult(toolName: string, result: any, opts: { requestId?: string | null; prompt?: string; startTime: number }) {
  lastExecMode.value = 'tool';
  lastExecTarget.value = toolName;
  lastExecDuration.value = Date.now() - opts.startTime;
  lastExecError.value = null;
  lastExecStatus.value = 'COMPLETED';
  lastExecRaw.value = result;
  lastExecOutput.value = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const hasSurface = applySurfaceIfPresent(result, opts.requestId ?? null);
  if (!hasSurface) outputTab.value = 'formatted';
  turnHistory.value.unshift({
    id: String(Date.now()),
    target: toolName,
    mode: 'tool',
    prompt: opts.prompt ?? `/${toolName}`,
    output: lastExecOutput.value || '',
    timestamp: Date.now(),
    surfaceId: hasSurface ? surfaces.activeId.value : null,
  });
}

/** Runs a tool from the composer (`/tool args` or its argument form) through the host and shows the result. */
async function runToolTurn(tool: any, args: Record<string, unknown>, startTime = Date.now()) {
  const owns = !executing.value;
  if (owns) executing.value = true;
  try {
    const data = await executeGraphql(EXECUTE_TOOL_MUTATION, { name: tool.name, args });
    const res = data?.executeTool;
    if (!res?.success) throw new Error(res?.error || `Tool '${tool.name}' failed`);
    if (res.requestId) {
      lastExecRequestId.value = String(res.requestId);
      runTimeline.begin(res.requestId);
    }
    showToolResult(tool.name, res.result, { requestId: res.requestId ?? null, startTime, prompt: `/${tool.name} ${JSON.stringify(args)}` });
  } catch (err: any) {
    lastExecStatus.value = 'FAILED';
    lastExecError.value = err?.message ?? String(err);
  } finally {
    if (owns) {
      executing.value = false;
      runTimeline.end();
    }
  }
}

/** Submits the composer's tool argument form. */
async function submitToolForm() {
  const tool = toolFormTarget.value;
  if (!tool) return;
  const args = { ...toolFormArgs.value };
  toolFormTarget.value = null;
  if (tool.kind === 'prompt') {
    try {
      promptInput.value = await promptLibrary.render(tool, args);
    } catch (err: any) {
      lastExecStatus.value = 'FAILED';
      lastExecError.value = err?.message ?? String(err);
    }
    return;
  }
  await runToolTurn(tool, args);
  if (tool.name === 'prompt_save' || tool.name === 'prompt_delete') await promptLibrary.load();
}

/** Opens the context menu on a message: its message actions are listed first. */
function openTurnMenu(e: MouseEvent, message: HarnessMessageRef) {
  openContextMenu(e);
  contextMenuTurn.value = message;
}

/** Runs a message action on the turn the menu was opened on and shows its result like a tool turn. */
async function runMessageAction(tool: any) {
  const message = contextMenuTurn.value;
  contextMenuVisible.value = false;
  if (!message) return;
  const startTime = Date.now();
  const out = await messageActions.run(tool, message);
  if (!out.ok) {
    lastExecMode.value = 'tool';
    lastExecTarget.value = tool.name;
    lastExecStatus.value = 'FAILED';
    lastExecError.value = messageActions.error.value;
    return;
  }
  showToolResult(tool.name, out.result, { startTime, prompt: `${tool.ui?.messageAction?.label ?? tool.name}: ${message.text.slice(0, 60)}` });
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
  contextMenuVisible.value = false;
  openToolForm(tool);
}

function switchAgentFromMenu(agentName: string) {
  selectedAgent.value = agentName;
  execMode.value = 'agent';
  contextMenuVisible.value = false;
}

async function executeCommand(cmd: string) {
  contextMenuVisible.value = false;
  if (!isCommandAllowed(cmd.replace(/^\//, ''), allowedActions.value, tools.value.map((t: any) => t?.name))) {
    lastExecStatus.value = 'FAILED';
    lastExecError.value = `You do not have the role for ${cmd}.`;
    return;
  }
  if (cmd === '/resources') {
    await showResourcesSurface();
  } else if (cmd === '/layout') {
    layoutMode.value = layoutMode.value === 'stack' ? 'workbench' : 'stack';
  } else if (cmd === '/status') {
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
  } else if (cmd === '/save-prompt') {
    // The prompt_save form, prefilled with the prompt text (or the last sent prompt)
    const tool = tools.value.find((t: any) => t?.name === 'prompt_save');
    if (!tool) return;
    const text = promptInput.value.trim() || promptHistory.value[promptHistory.value.length - 1] || '';
    toolFormArgs.value = text ? { text } : {};
    toolFormTarget.value = tool;
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
// Provide Harness Context to all Child Components
// -----------------------------------------------------------------------------
provideHarnessContext({
  agents,
  tools,
  workflowPresetItems,
  isPaused,
  layoutMode,
  uiSurface,
  worktableSurface,
  resourceViewMode,
  resourceSearchQuery,
  resourceCategoryFilter,
  resourceAuthorFilter,
  resourcePublishedFilter,
  selectedResourceKeys,
  activeResourceDetail,
  customComponents: {
    ...(props.adapter?.customComponents || {}),
    ...(props.customComponents || {}),
  },
  pendingUploadFiles,
  uploadingFiles,
  execMode,
  closeWorkflowEditor,
  selectedAgent,
  selectedWorkflowPreset,
  promptInput,
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
  runTimeline: runTimeline.current,
  interrupts,
  surfaces,
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
  resourceContextMenuVisible,
  resourceContextMenuX,
  resourceContextMenuY,
  resourceContextMenuTarget,
  executeOpPrompt,
  submitChoice: executeOpPrompt,
  clearChoices: clearChoiceSelection,
  clearPrompt: clearPromptInput,
  navigateHistory,
  loadTurn: loadTurnIntoOutput,
  openContextMenu,
  openTurnMenu,
  contextMenuTurn,
  messageActions,
  runMessageAction,
  commandCatalog,
  attachments,
  sources,
  promptLibrary,
  conversations,
  channelStream,
  toolFormTarget,
  toolFormArgs,
  submitToolForm,
  selectChoiceFromMenu,
  switchAgentFromMenu,
  insertToolCommand,
  executeCommand,
  focusPrompt: focusPromptInput,
  showResourcesSurface,
  openResourceDetail,
  openResourceContextMenu,
  handleResourceAction,
  handleBulkResourceAction,
  uploadFilesToStorage,
  removePendingUploadFile,
});

// -----------------------------------------------------------------------------
// Lifecycle & Event Bus Listener
// -----------------------------------------------------------------------------
let unsubscribeProgress: (() => void) | null = null;
let unsubscribeDbChange: (() => void) | null = null;

onMounted(async () => {
  await loadAllData();
  interrupts.hydrate().catch(() => {});
  // Restore result surfaces from stored responses (a reload loses the in-memory list)
  surfaces.rebuildFrom(requests.value as any);
  // Automatically hydrate initial resource surface if available
  showResourcesSurface().catch(() => {});

  if (props.adapter?.onProgress) {
    unsubscribeProgress = props.adapter.onProgress((type, payload) => {
      eventLogs.value.unshift({ type, payload, timestamp: Date.now() });
      if (eventLogs.value.length > 100) eventLogs.value.pop();

      const incoming = payload?.choices || payload?.activeChoices;
      if (Array.isArray(incoming) && incoming.length > 0) {
        updateChoicesFromPayload(payload, type);
      }
      if (type === 'gallery:item_updated' || type === 'gallery:migrated') {
        showResourcesSurface().catch(() => {});
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
