<template>
  <div class="d-flex flex-column w-100">
    <v-card variant="outlined" rounded="lg" class="fill-height d-flex flex-column pa-0 border bg-surface" style="min-height: 240px;">
      <!-- Feedback / Output Top & Right Subheader -->
      <div class="d-flex align-center justify-space-between px-3 py-2 border-b bg-surface-variant flex-wrap ga-2">
        <div class="d-flex align-center ga-2 flex-wrap">
          <v-icon size="16" color="primary">mdi-monitor-dashboard</v-icon>
          <span class="text-caption font-weight-bold text-high-emphasis">FEEDBACK &amp; UI SURFACE</span>
          <v-chip
            v-if="status"
            size="x-small"
            :color="status === 'COMPLETED' ? 'success' : status === 'RUNNING' ? 'primary' : 'error'"
            variant="flat"
            class="font-weight-bold"
          >
            {{ status }}
          </v-chip>
          <v-chip v-if="duration !== null" size="x-small" variant="outlined">
            ⏱ {{ duration }}ms
          </v-chip>
          <v-chip v-if="reqId" size="x-small" variant="text" class="text-caption">
            #{{ reqId }}
          </v-chip>
        </div>

        <!-- Right-Side Toolbar & View Tabs -->
        <div class="d-flex align-center ga-2 flex-wrap">
          <v-btn
            size="x-small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-view-grid-outline"
            title="Render interactive Resource Grid | List in Feedback Pane"
            @click="openResourcesSurface"
          >
            Resources (Grid | List)
          </v-btn>

          <v-btn-toggle
            v-model="tab"
            mandatory
            density="compact"
            variant="text"
            color="primary"
          >
            <v-btn value="surface" size="x-small">
              <v-icon size="14" class="me-1">mdi-widgets-outline</v-icon>
              UI Surface
            </v-btn>
            <v-btn value="formatted" size="x-small">Formatted</v-btn>
            <v-btn value="json" size="x-small">JSON / AST</v-btn>
            <v-btn value="history" size="x-small">Turns ({{ historyList.length }})</v-btn>
          </v-btn-toggle>
        </div>
      </div>

      <!-- Feedback Body -->
      <div class="pa-3 flex-grow-1 overflow-y-auto">
        <!-- Loading State (Real-Time WebSocket Stream) -->
        <div v-if="isExecuting" class="d-flex flex-column align-center justify-center py-8 text-center">
          <v-progress-circular indeterminate color="primary" size="36" class="mb-3" />
          <div class="text-subtitle-2 text-high-emphasis font-weight-medium">
            Executing OpPrompt Turn...
          </div>
          <HarnessRunStatus v-if="currentRun?.active" :run="currentRun" default-expanded class="mt-2 text-start" />
          <div v-else-if="stepMsg" class="text-caption text-primary mt-1 font-monospace">
            {{ stepMsg }}
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            Streaming via Curator Host Channel (/api/events)
          </div>
        </div>

        <!-- Error Banner -->
        <v-alert
          v-else-if="execError"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
          closable
        >
          <strong>Execution Error:</strong> {{ execError }}
        </v-alert>

        <!-- 0. Interactive UI Surface View (Grid | List Resource Explorer, Detail Editor, Custom Components) -->
        <template v-else-if="tab === 'surface'">
          <component
            :is="customSurfaceComponent"
            v-if="customSurfaceComponent"
            :surface="activeSurface"
            v-bind="activeSurface?.props || {}"
          />
          <HarnessResourceDetail
            v-else-if="activeDetail || activeSurface?.component === 'resource-detail'"
            :item="activeDetail || activeSurface?.item || null"
          />
          <HarnessResourceCollection
            v-else-if="activeSurface"
            :surface="activeSurface"
          />
          <div v-else class="text-center py-8">
            <v-icon size="36" class="mb-2 opacity-30" color="primary">mdi-view-grid-plus-outline</v-icon>
            <div class="text-body-2 text-medium-emphasis">
              Interactive Feedback Surface Ready
            </div>
            <div class="text-caption text-disabled mt-1 mb-3">
              Prompt <code>"show app resources"</code> below or click "Resources (Grid | List)" to render custom UI components here above the prompt.
            </div>
            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-folder-multiple-image"
              @click="openResourcesSurface"
            >
              Show App Resources
            </v-btn>
          </div>
        </template>

        <!-- 1. Formatted View -->
        <template v-else-if="tab === 'formatted'">
          <div v-if="!outputText && historyList.length === 0" class="text-center py-6">
            <div class="text-h5 mb-1 opacity-30">⚡</div>
            <div class="text-body-2 text-medium-emphasis">OpPrompt feedback will stream here above your prompt.</div>
            <div class="text-caption text-disabled mt-1">
              Type <code>show app resources</code> or select an agent/tool below and press Ctrl + Enter.
            </div>
          </div>

          <div v-else class="formatted-output-view">
            <!-- Latest Execution Target Info & Choice Chip -->
            <div v-if="target" class="d-flex align-center justify-space-between mb-2 pb-2 border-b">
              <div class="d-flex align-center ga-2 flex-wrap">
                <span class="text-caption text-medium-emphasis">
                  Target: <strong>{{ target }}</strong> ({{ mode }})
                </span>
                <v-chip
                  v-if="choice"
                  size="x-small"
                  color="primary"
                  variant="flat"
                  class="font-weight-bold font-monospace"
                >
                  Choice: {{ formatChoiceDisplay(choice) }}
                </v-chip>
              </div>
              <div class="d-flex align-center ga-1">
                <v-btn
                  v-if="activeSurface"
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  prepend-icon="mdi-widgets-outline"
                  @click="tab = 'surface'"
                >
                  Open UI Surface
                </v-btn>
                <v-btn
                  size="x-small"
                  variant="text"
                  icon="mdi-content-copy"
                  title="Copy Output"
                  @click="copyToClipboard(outputText || '')"
                />
              </div>
            </div>

            <HarnessRunStatus v-if="currentRun && !currentRun.active" :run="currentRun" class="mb-2" />

            <!-- Callouts if parsed from conversational speech acts -->
            <div v-if="parsedSpeechActs.callouts.length > 0" class="d-flex flex-column ga-2 mb-3">
              <v-alert
                v-for="(c, idx) in parsedSpeechActs.callouts"
                :key="idx"
                :type="c.type"
                variant="tonal"
                density="compact"
                class="text-caption"
              >
                <div v-if="c.title" class="font-weight-bold mb-1">{{ c.title }}</div>
                <div>{{ c.body }}</div>
              </v-alert>
            </div>

            <!-- Text / Markdown Output Container -->
            <div class="mb-3">
              <pre class="font-monospace text-caption pa-3 rounded bg-surface-variant text-primary overflow-auto text-wrap">{{ displayCleanText || 'Turn completed with no text output.' }}</pre>
            </div>

            <!-- Suggestion Chips if parsed from conversational speech acts -->
            <div v-if="parsedSpeechActs.suggestions.length > 0" class="d-flex align-center flex-wrap ga-1 mt-2 mb-3">
              <span class="text-caption text-medium-emphasis me-1">💡 Suggestions:</span>
              <v-chip
                v-for="(s, idx) in parsedSpeechActs.suggestions"
                :key="idx"
                size="small"
                variant="tonal"
                :color="s.color || 'primary'"
                class="cursor-pointer font-weight-medium"
                @click="applySuggestion(s.prompt)"
              >
                {{ s.label }}
              </v-chip>
            </div>

            <!-- Sub-Responses if available -->
            <div v-if="responsesList.length > 1" class="mt-2">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-1">Additional Responses:</div>
              <v-card
                v-for="(resp, i) in responsesList.slice(1)"
                :key="i"
                variant="outlined"
                density="compact"
                class="pa-2 mb-2 text-caption"
              >
                {{ resp.content }}
              </v-card>
            </div>

            <!-- DYNAMIC AST WORKFLOW CHOICES -->
            <HarnessChoices
              v-if="choicesList.length > 0"
              :choices="choicesList"
              :prompt="choicePromptText || 'Workflow Action Required'"
              :waiting-request-id="waitingReqId"
              :display-mode="choiceDisplayMode"
              :selected-radio="selectedRadio"
              :selected-checkboxes="selectedChecks"
              :selected-chip="selectedChip"
              variant="tonal"
              color="primary"
              :show-footer-submit="true"
              :loading="isExecuting"
              class="mt-3"
              @update:selected-radio="setRadio"
              @update:selected-checkboxes="setChecks"
              @update:selected-chip="setChip"
              @update:display-mode="setDisplayMode"
              @submit="submitChoiceAction"
              @focus-prompt="focusPromptAction"
            />
          </div>
        </template>

        <!-- 2. JSON / AST View -->
        <template v-else-if="tab === 'json'">
          <div v-if="!rawPayload" class="text-center py-8">
            <div class="text-caption text-medium-emphasis">No raw AST or JSON response payload to inspect yet.</div>
          </div>
          <pre v-else class="font-monospace text-caption pa-3 rounded bg-surface-variant text-cyan-accent-2 overflow-auto">{{ JSON.stringify(rawPayload, null, 2) }}</pre>
        </template>

        <!-- 3. Turn History View -->
        <template v-else-if="tab === 'history'">
          <div v-if="historyList.length === 0" class="text-center py-6 text-caption text-medium-emphasis">
            No turn history recorded in this session.
          </div>
          <div v-else class="d-flex flex-column ga-2">
            <v-card
              v-for="(turn, idx) in historyList"
              :key="turn.id || idx"
              variant="outlined"
              density="compact"
              hover
              class="pa-2 cursor-pointer transition-swing border rounded-lg"
              @click="loadTurnAction(turn)"
            >
              <div class="d-flex align-center justify-space-between text-caption mb-1">
                <div class="d-flex align-center ga-2">
                  <span class="font-weight-bold text-primary">{{ turn.target }}</span>
                  <v-chip v-if="turn.choice" size="x-small" color="primary" variant="tonal" class="font-monospace">
                    {{ formatChoiceDisplay(turn.choice) }}
                  </v-chip>
                </div>
                <span class="text-medium-emphasis">{{ new Date(turn.timestamp).toLocaleTimeString() }}</span>
              </div>
              <div class="text-caption text-truncate font-italic opacity-80 mb-1">
                "{{ turn.prompt }}"
              </div>
              <div class="text-caption text-truncate text-medium-emphasis">
                {{ turn.output }}
              </div>
              <HarnessRunStatus v-if="turn.run" :run="turn.run" class="mt-1" @click.stop />
            </v-card>
          </div>
        </template>
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { parseSpeechActs } from '@curator/host/contracts';
import { useHarnessContext } from '../../context';
import HarnessChoices, { type ChoiceItem } from './HarnessChoices.vue';
import HarnessRunStatus from './HarnessRunStatus.vue';
import type { RunTimeline } from '../../composables/useRunTimeline';
import HarnessResourceCollection from './HarnessResourceCollection.vue';
import HarnessResourceDetail from './HarnessResourceDetail.vue';

export interface TurnHistoryEntry {
  id: string;
  target: string;
  mode: string;
  choice?: any;
  prompt: string;
  output: string;
  timestamp: number;
  /** The turn's run as it ended (from `curator:progress`); absent for turns without a root request. */
  run?: RunTimeline | null;
}

interface Props {
  executing?: boolean;
  liveStepMessage?: string | null;
  lastExecStatus?: string | null;
  lastExecDuration?: number | null;
  lastExecRequestId?: string | null;
  lastExecTarget?: string | null;
  lastExecMode?: string | null;
  lastExecChoice?: any | null;
  lastExecOutput?: string | null;
  lastExecResponses?: any[];
  lastExecRaw?: any | null;
  lastExecError?: string | null;
  outputTab?: 'surface' | 'formatted' | 'json' | 'history';
  turnHistory?: TurnHistoryEntry[];
  availableChoices?: ChoiceItem[];
  workflowChoicePrompt?: string;
  workflowWaitingRequestId?: string | null;
  choicesDisplayMode?: 'radio' | 'checkbox' | 'chips';
  selectedRadioChoice?: string | null;
  selectedCheckboxes?: string[];
  selectedChipChoice?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  executing: undefined,
  liveStepMessage: undefined,
  lastExecStatus: undefined,
  lastExecDuration: undefined,
  lastExecRequestId: undefined,
  lastExecTarget: undefined,
  lastExecMode: undefined,
  lastExecChoice: undefined,
  lastExecOutput: undefined,
  lastExecResponses: undefined,
  lastExecRaw: undefined,
  lastExecError: undefined,
  outputTab: undefined,
  turnHistory: undefined,
  availableChoices: undefined,
  workflowChoicePrompt: '',
  workflowWaitingRequestId: undefined,
  choicesDisplayMode: undefined,
  selectedRadioChoice: undefined,
  selectedCheckboxes: undefined,
  selectedChipChoice: undefined,
});

const emit = defineEmits<{
  (e: 'update:outputTab', tab: 'surface' | 'formatted' | 'json' | 'history'): void;
  (e: 'update:selectedRadioChoice', val: string | null): void;
  (e: 'update:selectedCheckboxes', val: string[]): void;
  (e: 'update:selectedChipChoice', val: string | null): void;
  (e: 'update:choicesDisplayMode', mode: 'radio' | 'checkbox' | 'chips'): void;
  (e: 'loadTurn', turn: any): void;
  (e: 'submitChoice'): void;
  (e: 'focusPrompt'): void;
}>();

const harness = useHarnessContext();

// Execution & Output State
const isExecuting = computed(() => props.executing ?? harness?.executing.value ?? false);
const stepMsg = computed(() => props.liveStepMessage ?? harness?.liveStepMessage.value ?? null);
const currentRun = computed(() => harness?.runTimeline?.value ?? null);
const status = computed(() => props.lastExecStatus ?? harness?.lastExecStatus.value ?? null);
const duration = computed(() => props.lastExecDuration ?? harness?.lastExecDuration.value ?? null);
const reqId = computed(() => props.lastExecRequestId ?? harness?.lastExecRequestId.value ?? null);
const target = computed(() => props.lastExecTarget ?? harness?.lastExecTarget.value ?? null);
const mode = computed(() => props.lastExecMode ?? harness?.lastExecMode.value ?? null);
const choice = computed(() => props.lastExecChoice ?? harness?.lastExecChoice.value ?? null);
const outputText = computed(() => props.lastExecOutput ?? harness?.lastExecOutput.value ?? null);
const parsedSpeechActs = computed(() => parseSpeechActs(outputText.value || ''));
const displayCleanText = computed(() => {
  if (parsedSpeechActs.value.hasSpeechActs) {
    return parsedSpeechActs.value.cleanText;
  }
  return outputText.value;
});

function applySuggestion(prompt: string) {
  if (harness) {
    harness.promptInput.value = prompt;
    harness.focusPrompt();
  }
}
const responsesList = computed(() => props.lastExecResponses ?? harness?.lastExecResponses.value ?? []);
const rawPayload = computed(() => props.lastExecRaw ?? harness?.lastExecRaw.value ?? null);
const execError = computed(() => props.lastExecError ?? harness?.lastExecError.value ?? null);

// UI Surface State
const activeSurface = computed(() => harness?.uiSurface.value ?? null);
const activeDetail = computed(() => harness?.activeResourceDetail.value ?? null);
const customSurfaceComponent = computed(() => {
  const compName = activeSurface.value?.component;
  if (!compName || !harness?.customComponents) return null;
  return harness.customComponents[compName] || null;
});

const tab = computed({
  get: () => props.outputTab ?? harness?.outputTab.value ?? 'formatted',
  set: (val) => {
    if (harness) harness.outputTab.value = val;
    emit('update:outputTab', val);
  },
});

const historyList = computed(() => props.turnHistory ?? harness?.turnHistory.value ?? []);

// Choices State
const choicesList = computed(() => props.availableChoices ?? harness?.availableChoices.value ?? []);
const choicePromptText = computed(() => props.workflowChoicePrompt ?? harness?.workflowChoicePrompt.value ?? '');
const waitingReqId = computed(() => props.workflowWaitingRequestId ?? harness?.workflowWaitingRequestId.value ?? null);
const choiceDisplayMode = computed(() => props.choicesDisplayMode ?? harness?.choicesDisplayMode.value ?? 'radio');
const selectedRadio = computed(() => props.selectedRadioChoice ?? harness?.selectedRadioChoice.value ?? null);
const selectedChecks = computed(() => props.selectedCheckboxes ?? harness?.selectedCheckboxes.value ?? []);
const selectedChip = computed(() => props.selectedChipChoice ?? harness?.selectedChipChoice.value ?? null);

function openResourcesSurface() {
  if (harness) {
    harness.outputTab.value = 'surface';
    harness.showResourcesSurface();
  }
}

function setRadio(val: string | null) {
  if (harness) harness.selectedRadioChoice.value = val;
  emit('update:selectedRadioChoice', val);
}

function setChecks(val: string[]) {
  if (harness) harness.selectedCheckboxes.value = val;
  emit('update:selectedCheckboxes', val);
}

function setChip(val: string | null) {
  if (harness) harness.selectedChipChoice.value = val;
  emit('update:selectedChipChoice', val);
}

function setDisplayMode(mode: 'radio' | 'checkbox' | 'chips') {
  if (harness) harness.choicesDisplayMode.value = mode;
  emit('update:choicesDisplayMode', mode);
}

function submitChoiceAction() {
  if (harness?.submitChoice) harness.submitChoice();
  else if (harness?.executeOpPrompt) harness.executeOpPrompt();
  emit('submitChoice');
}

function focusPromptAction() {
  if (harness?.focusPrompt) harness.focusPrompt();
  emit('focusPrompt');
}

function loadTurnAction(turn: TurnHistoryEntry) {
  if (harness?.loadTurn) harness.loadTurn(turn);
  emit('loadTurn', turn);
}

function formatChoiceDisplay(c: any): string {
  if (!c) return '';
  if (Array.isArray(c)) return c.join(', ');
  if (typeof c === 'object') return c.label || c.value || JSON.stringify(c);
  return String(c).toUpperCase();
}

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text);
}
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
