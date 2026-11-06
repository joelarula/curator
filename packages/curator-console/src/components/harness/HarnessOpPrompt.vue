<template>
  <v-col cols="12" md="6" class="d-flex flex-column">
    <!-- Target Selection Row -->
    <div class="d-flex align-center ga-2 mb-3">
      <!-- Agent Mode Target -->
      <v-select
        v-if="currentMode === 'agent'"
        v-model="currentAgent"
        :items="agentSelectItems"
        item-title="title"
        item-value="value"
        label="Target Agent"
        density="compact"
        variant="outlined"
        hide-details
        class="flex-grow-1"
      />

      <!-- Tool Mode Target -->
      <v-select
        v-if="currentMode === 'tool'"
        v-model="currentTool"
        :items="toolSelectItems"
        item-title="title"
        item-value="value"
        label="Target Tool"
        density="compact"
        variant="outlined"
        hide-details
        class="flex-grow-1"
      />

      <!-- Workflow Mode Target -->
      <v-select
        v-if="currentMode === 'workflow'"
        v-model="currentWorkflowPreset"
        :items="presetItems"
        label="Workflow Template"
        density="compact"
        variant="outlined"
        hide-details
        class="flex-grow-1"
      />

      <!-- History Navigation Buttons -->
      <v-btn
        icon="mdi-chevron-left"
        variant="tonal"
        size="small"
        title="Previous Prompt"
        :disabled="historyIdx <= 0"
        @click="navHistory(-1)"
      />
      <v-btn
        icon="mdi-chevron-right"
        variant="tonal"
        size="small"
        title="Next Prompt"
        :disabled="historyIdx >= historyList.length - 1"
        @click="navHistory(1)"
      />
    </div>

    <!-- Dynamic AST Workflow Choices Bar (Above Prompt) -->
    <HarnessChoices
      v-if="currentMode === 'agent' && choicesList.length > 0"
      :choices="choicesList"
      :prompt="choicePromptText"
      :display-mode="choiceDisplayMode"
      :selected-radio="selectedRadio"
      :selected-checkboxes="selectedChecks"
      :selected-chip="selectedChip"
      class="mb-3"
      @update:selected-radio="setRadio"
      @update:selected-checkboxes="setChecks"
      @update:selected-chip="setChip"
      @update:display-mode="setDisplayMode"
      @clear="clearChoicesAction"
    />

    <!-- Main OpPrompt Input Area with Right-Click Context Menu -->
    <div
      class="position-relative flex-grow-1"
      @contextmenu.prevent="handleContextMenu($event)"
    >
      <!-- Agent Mode Prompt -->
      <v-textarea
        v-if="currentMode === 'agent'"
        v-model="agentPrompt"
        label="Instruction / Prompt for Agent (Right-click for Program Commands)"
        placeholder="Ask a question, request a tool operation, or provide dialogue alongside choice..."
        rows="7"
        variant="outlined"
        auto-grow
        class="code-input"
        hide-details
        @keydown.ctrl.enter.prevent="runExecution"
      />

      <!-- Tool Mode Arguments -->
      <v-textarea
        v-else-if="currentMode === 'tool'"
        v-model="toolArgs"
        label="Tool Arguments (JSON)"
        placeholder="{\n  &quot;baseValue&quot;: 42\n}"
        rows="7"
        variant="outlined"
        class="code-input"
        hide-details
        @keydown.ctrl.enter.prevent="runExecution"
      />

      <!-- Workflow Mode Code -->
      <v-textarea
        v-else
        v-model="workflowCode"
        label="CoffeeScript AST Code"
        placeholder="# Enter declarative workflow verbs&#10;while_loop &quot;$context.turn <= 3&quot;,&#10;  seq [&#10;    emit_event &quot;game:ping&quot;&#10;  ]"
        rows="7"
        variant="outlined"
        class="code-input"
        hide-details
        @keydown.ctrl.enter.prevent="runExecution"
      />
    </div>

    <!-- Context Extras (for Agent mode) -->
    <div v-if="currentMode === 'agent'" class="d-flex align-center ga-2 mt-2">
      <v-text-field
        v-model="actorName"
        density="compact"
        variant="outlined"
        label="Actor / User ID"
        placeholder="User"
        hide-details
        class="flex-grow-1"
      />
      <v-text-field
        v-model="convId"
        density="compact"
        variant="outlined"
        label="Conversation External ID"
        placeholder="conv_blueprint"
        hide-details
        class="flex-grow-1"
      />
    </div>

    <!-- Action Bar -->
    <div class="d-flex align-center justify-space-between mt-3 flex-wrap ga-2">
      <div class="d-flex align-center ga-2">
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-lightning-bolt"
          :loading="isExecuting"
          class="font-weight-bold"
          @click="runExecution"
        >
          {{ currentMode === 'workflow' ? 'Compile & Run AST' : 'Run OpPrompt' }}
        </v-btn>

        <v-btn
          variant="text"
          size="small"
          color="medium-emphasis"
          @click="clearPromptAction"
        >
          Clear
        </v-btn>
      </div>

      <div class="text-caption text-medium-emphasis">
        <kbd class="px-2 py-1 rounded bg-surface-variant text-caption font-monospace border">Ctrl + Enter</kbd> to execute
      </div>
    </div>
  </v-col>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useHarnessContext } from '../../context';
import HarnessChoices, { type ChoiceItem } from './HarnessChoices.vue';

interface Props {
  execMode?: 'agent' | 'tool' | 'workflow';
  selectedAgent?: string;
  selectedTool?: string;
  selectedWorkflowPreset?: string;
  promptInput?: string;
  toolArgsInput?: string;
  workflowInput?: string;
  userContextName?: string;
  conversationContextId?: string;
  agents?: any[];
  tools?: any[];
  workflowPresetItems?: any[];
  promptHistoryIndex?: number;
  promptHistory?: string[];
  executing?: boolean;
  availableChoices?: ChoiceItem[];
  choicesDisplayMode?: 'radio' | 'checkbox' | 'chips';
  selectedRadioChoice?: string | null;
  selectedCheckboxes?: string[];
  selectedChipChoice?: string | null;
  workflowChoicePrompt?: string;
}

const props = withDefaults(defineProps<Props>(), {
  execMode: undefined,
  selectedAgent: undefined,
  selectedTool: undefined,
  selectedWorkflowPreset: undefined,
  promptInput: undefined,
  toolArgsInput: undefined,
  workflowInput: undefined,
  userContextName: undefined,
  conversationContextId: undefined,
  agents: undefined,
  tools: undefined,
  workflowPresetItems: undefined,
  promptHistoryIndex: undefined,
  promptHistory: undefined,
  executing: undefined,
  availableChoices: undefined,
  choicesDisplayMode: undefined,
  selectedRadioChoice: undefined,
  selectedCheckboxes: undefined,
  selectedChipChoice: undefined,
  workflowChoicePrompt: '',
});

const emit = defineEmits<{
  (e: 'update:execMode', mode: 'agent' | 'tool' | 'workflow'): void;
  (e: 'update:selectedAgent', val: string): void;
  (e: 'update:selectedTool', val: string): void;
  (e: 'update:selectedWorkflowPreset', val: string): void;
  (e: 'update:promptInput', val: string): void;
  (e: 'update:toolArgsInput', val: string): void;
  (e: 'update:workflowInput', val: string): void;
  (e: 'update:userContextName', val: string): void;
  (e: 'update:conversationContextId', val: string): void;
  (e: 'update:selectedRadioChoice', val: string | null): void;
  (e: 'update:selectedCheckboxes', val: string[]): void;
  (e: 'update:selectedChipChoice', val: string | null): void;
  (e: 'update:choicesDisplayMode', mode: 'radio' | 'checkbox' | 'chips'): void;
  (e: 'clearChoices'): void;
  (e: 'execute'): void;
  (e: 'clear'): void;
  (e: 'navigateHistory', direction: number): void;
  (e: 'openContextMenu', event: MouseEvent): void;
}>();

const harness = useHarnessContext();

// Two-way bindings with context and props fallback
const currentMode = computed({
  get: () => props.execMode ?? harness?.execMode.value ?? 'agent',
  set: (val) => {
    if (harness) harness.execMode.value = val;
    emit('update:execMode', val);
  },
});

const currentAgent = computed({
  get: () => props.selectedAgent ?? harness?.selectedAgent.value ?? '',
  set: (val) => {
    if (harness) harness.selectedAgent.value = val;
    emit('update:selectedAgent', val);
  },
});

const currentTool = computed({
  get: () => props.selectedTool ?? harness?.selectedTool.value ?? '',
  set: (val) => {
    if (harness) harness.selectedTool.value = val;
    emit('update:selectedTool', val);
  },
});

const currentWorkflowPreset = computed({
  get: () => props.selectedWorkflowPreset ?? harness?.selectedWorkflowPreset.value ?? 'pingpong',
  set: (val) => {
    if (harness) harness.selectedWorkflowPreset.value = val;
    emit('update:selectedWorkflowPreset', val);
  },
});

const agentPrompt = computed({
  get: () => props.promptInput ?? harness?.promptInput.value ?? '',
  set: (val) => {
    if (harness) harness.promptInput.value = val;
    emit('update:promptInput', val);
  },
});

const toolArgs = computed({
  get: () => props.toolArgsInput ?? harness?.toolArgsInput.value ?? '{}',
  set: (val) => {
    if (harness) harness.toolArgsInput.value = val;
    emit('update:toolArgsInput', val);
  },
});

const workflowCode = computed({
  get: () => props.workflowInput ?? harness?.workflowInput.value ?? '',
  set: (val) => {
    if (harness) harness.workflowInput.value = val;
    emit('update:workflowInput', val);
  },
});

const actorName = computed({
  get: () => props.userContextName ?? harness?.userContextName.value ?? 'User',
  set: (val) => {
    if (harness) harness.userContextName.value = val;
    emit('update:userContextName', val);
  },
});

const convId = computed({
  get: () => props.conversationContextId ?? harness?.conversationContextId.value ?? 'conv_blueprint',
  set: (val) => {
    if (harness) harness.conversationContextId.value = val;
    emit('update:conversationContextId', val);
  },
});

// Catalogs
const agentList = computed(() => props.agents ?? harness?.agents.value ?? []);
const toolList = computed(() => props.tools ?? harness?.tools.value ?? []);
const presetItems = computed(() => props.workflowPresetItems ?? harness?.workflowPresetItems ?? []);

const agentSelectItems = computed(() => {
  return agentList.value.map((a: any) => ({
    title: `🤖 ${a.name} (${a.enabled ? 'Active' : 'Disabled'})`,
    value: a.name,
  }));
});

const toolSelectItems = computed(() => {
  return toolList.value.map((t: any) => ({
    title: `🛠️ ${t.name}`,
    value: t.name,
  }));
});

// History
const historyIdx = computed(() => props.promptHistoryIndex ?? harness?.promptHistoryIndex.value ?? -1);
const historyList = computed(() => props.promptHistory ?? harness?.promptHistory.value ?? []);

function navHistory(direction: number) {
  if (harness?.navigateHistory) harness.navigateHistory(direction);
  emit('navigateHistory', direction);
}

// Choices
const choicesList = computed(() => props.availableChoices ?? harness?.availableChoices.value ?? []);
const choicePromptText = computed(() => props.workflowChoicePrompt ?? harness?.workflowChoicePrompt.value ?? '');
const choiceDisplayMode = computed(() => props.choicesDisplayMode ?? harness?.choicesDisplayMode.value ?? 'radio');
const selectedRadio = computed(() => props.selectedRadioChoice ?? harness?.selectedRadioChoice.value ?? null);
const selectedChecks = computed(() => props.selectedCheckboxes ?? harness?.selectedCheckboxes.value ?? []);
const selectedChip = computed(() => props.selectedChipChoice ?? harness?.selectedChipChoice.value ?? null);

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

function clearChoicesAction() {
  if (harness?.clearChoices) harness.clearChoices();
  emit('clearChoices');
}

// Execution
const isExecuting = computed(() => props.executing ?? harness?.executing.value ?? false);

function runExecution() {
  if (harness?.executeOpPrompt) harness.executeOpPrompt();
  emit('execute');
}

function clearPromptAction() {
  if (harness?.clearPrompt) harness.clearPrompt();
  emit('clear');
}

function handleContextMenu(e: MouseEvent) {
  if (harness?.openContextMenu) harness.openContextMenu(e);
  emit('openContextMenu', e);
}
</script>

<style scoped>
.code-input :deep(textarea) {
  font-family: 'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace !important;
  font-size: 0.88rem !important;
  line-height: 1.45 !important;
}
</style>
