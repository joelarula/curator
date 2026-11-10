<template>
  <div class="d-flex flex-column w-100">
    <!-- Target Selection & Quick Prompt Commands Row -->
    <div class="d-flex align-center ga-2 mb-2 flex-wrap">
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
        style="min-width: 200px;"
      >
        <template #item="{ props: itemProps, item }">
          <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" :prepend-icon="item.raw.icon">
            <template #append>
              <span class="d-flex ga-1">
                <v-icon v-if="item.raw.caps?.tools && item.raw.caps.tools !== 'none'" size="14" title="Uses tools">mdi-wrench-outline</v-icon>
                <v-icon v-if="item.raw.caps?.vision" size="14" title="Understands images">mdi-eye-outline</v-icon>
                <v-icon v-if="!item.raw.enabled" size="14" color="warning" title="Disabled">mdi-pause-circle-outline</v-icon>
              </span>
            </template>
          </v-list-item>
        </template>
      </v-select>

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
        style="min-width: 200px;"
      />
      <v-btn
        v-if="currentMode === 'workflow'"
        size="small"
        variant="text"
        prepend-icon="mdi-arrow-left"
        title="Back to the agent prompt"
        @click="currentMode = 'agent'"
      >
        Back to prompt
      </v-btn>

      <!-- File Upload Trigger -->
      <v-btn
        size="small"
        variant="tonal"
        color="secondary"
        prepend-icon="mdi-paperclip"
        :loading="uploading"
        title="Upload files to VM Storage and attach to prompt/tool"
        @click="triggerFilePicker"
      >
        Upload File
      </v-btn>
      <input
        ref="fileInputRef"
        type="file"
        multiple
        style="display: none"
        @change="onFilesPicked"
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

    <!-- Attached / Uploaded Files Bar -->
    <div v-if="uploadedFiles.length > 0" class="d-flex align-center flex-wrap ga-1 mb-2 px-2 py-1 rounded bg-surface-variant border">
      <span class="text-caption font-weight-bold text-medium-emphasis me-1">Attached VM Files:</span>
      <v-chip
        v-for="(file, idx) in uploadedFiles"
        :key="file.url || idx"
        size="x-small"
        color="primary"
        variant="tonal"
        closable
        prepend-icon="mdi-file-image-outline"
        @click:close="removeUploadedFile(idx)"
      >
        {{ file.filename }} ({{ Math.round((file.size || 0) / 1024) }}KB)
      </v-chip>
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
      class="mb-2"
      @update:selected-radio="setRadio"
      @update:selected-checkboxes="setChecks"
      @update:selected-chip="setChip"
      @update:display-mode="setDisplayMode"
      @clear="clearChoicesAction"
    />

    <!-- Main OpPrompt Input Area with Right-Click Context Menu & File Drop -->
    <div
      class="position-relative flex-grow-1"
      @contextmenu.prevent="handleContextMenu($event)"
      @dragover.prevent
      @drop.prevent="onFilesDropped"
    >
      <!-- Agent Mode Prompt -->
      <v-textarea
        v-if="currentMode === 'agent'"
        ref="promptField"
        v-model="agentPrompt"
        label="Instruction / Prompt (/ for commands and tools, @ for agents)"
        placeholder="Ask a question, type / for commands and tools or @ to address an agent, or drop image files..."
        rows="4"
        variant="outlined"
        auto-grow
        class="code-input"
        hide-details
        @keydown.ctrl.enter.prevent="runExecution"
        @keydown="onComposerKeydown"
        @keyup="refreshComposer"
        @click="refreshComposer"
        @blur="closeComposerSoon"
      />

      <!-- Composer suggestions: /commands, tools and choices; @agents (same list as the CLI and the context menu) -->
      <v-card
        v-if="currentMode === 'agent' && composerItems.length > 0"
        class="position-absolute border"
        style="left: 0; right: 0; top: 100%; z-index: 20;"
        elevation="8"
        rounded="lg"
      >
        <v-list density="compact" class="py-1">
          <v-list-item
            v-for="(item, i) in composerItems"
            :key="`${item.source}-${item.name}`"
            :active="i === composerIndex"
            :prepend-icon="item.icon"
            rounded="md"
            @mousedown.prevent="applyComposerItem(item)"
          >
            <v-list-item-title class="font-monospace text-caption">
              {{ composerTrigger?.trigger }}{{ item.name }}
              <span v-if="item.usage" class="text-medium-emphasis">{{ item.usage }}</span>
              <span v-if="item.title" class="text-medium-emphasis"> · {{ item.title }}</span>
            </v-list-item-title>
            <v-list-item-subtitle v-if="item.description" class="text-caption">{{ item.description }}</v-list-item-subtitle>
            <template #append>
              <v-chip size="x-small" variant="text">{{ item.source }}</v-chip>
            </template>
          </v-list-item>
        </v-list>
      </v-card>

      <!-- Workflow Mode Code -->
      <v-textarea
        v-else
        v-model="workflowCode"
        label="CoffeeScript AST Code"
        placeholder="# Enter declarative workflow verbs&#10;seq [&#10;  tool &quot;gallery_show_resources&quot;&#10;]"
        rows="5"
        variant="outlined"
        class="code-input"
        hide-details
        @keydown.ctrl.enter.prevent="runExecution"
      />
    </div>

    <!-- Context Extras & Action Bar -->
    <div class="d-flex align-center justify-space-between mt-2 flex-wrap ga-2">
      <div class="d-flex align-center ga-2 flex-wrap">
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
          variant="tonal"
          size="small"
          color="primary"
          prepend-icon="mdi-view-grid-outline"
          @click="promptShowResources"
        >
          Show App Resources
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

      <div class="d-flex align-center ga-2">
        <v-text-field
          v-if="currentMode === 'agent'"
          v-model="actorName"
          density="compact"
          variant="outlined"
          label="Actor"
          hide-details
          style="width: 110px;"
        />
        <div class="text-caption text-medium-emphasis d-none d-sm-block">
          <kbd class="px-2 py-1 rounded bg-surface-variant text-caption font-monospace border">Ctrl + Enter</kbd>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { CommandDescriptor, ComposerTrigger } from '@curator/host/contracts';
import { useHarnessContext } from '../../context';
import HarnessChoices, { type ChoiceItem } from './HarnessChoices.vue';

interface Props {
  execMode?: 'agent' | 'workflow';
  selectedAgent?: string;
  selectedWorkflowPreset?: string;
  promptInput?: string;
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
  selectedWorkflowPreset: undefined,
  promptInput: undefined,
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
  (e: 'update:execMode', mode: 'agent' | 'workflow'): void;
  (e: 'update:selectedAgent', val: string): void;
  (e: 'update:selectedWorkflowPreset', val: string): void;
  (e: 'update:promptInput', val: string): void;
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
const fileInputRef = ref<HTMLInputElement | null>(null);

const uploadedFiles = computed(() => harness?.pendingUploadFiles.value ?? []);
const uploading = computed(() => harness?.uploadingFiles.value ?? false);

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

// Catalogs
const agentList = computed(() => props.agents ?? harness?.agents.value ?? []);
const presetItems = computed(() => props.workflowPresetItems ?? harness?.workflowPresetItems ?? []);

const agentSelectItems = computed(() => {
  return agentList.value.map((a: any) => ({
    title: a.title || a.name,
    subtitle: a.description || (a.title && a.title !== a.name ? a.name : undefined),
    icon: a.icon || 'mdi-robot-outline',
    caps: a.capabilities ?? null,
    enabled: a.enabled !== false,
    value: a.name,
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

// ── Composer: / and @ suggestions ───────────────────────────────────────────
const promptField = ref<any>(null);
const composerTrigger = ref<ComposerTrigger | null>(null);
const composerItems = ref<CommandDescriptor[]>([]);
const composerIndex = ref(0);

function textareaEl(): HTMLTextAreaElement | null {
  return promptField.value?.$el?.querySelector?.('textarea') ?? null;
}

/** Recomputes the trigger at the cursor and its suggestions. */
function refreshComposer(e?: KeyboardEvent) {
  if (e && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
  const el = textareaEl();
  const text = agentPrompt.value ?? '';
  const cursor = el?.selectionStart ?? text.length;
  const result = harness?.commandCatalog.suggest(text, cursor) ?? { trigger: null, items: [] };
  composerTrigger.value = result.trigger;
  composerItems.value = result.items;
  if (composerIndex.value >= result.items.length) composerIndex.value = 0;
}

function closeComposer() {
  composerItems.value = [];
  composerTrigger.value = null;
  composerIndex.value = 0;
}

function closeComposerSoon() {
  setTimeout(closeComposer, 150);
}

/** Puts the picked entry into the prompt; a choice is selected in the choice bar instead. */
async function applyComposerItem(item: CommandDescriptor) {
  const trigger = composerTrigger.value;
  if (!trigger) return;
  const text = agentPrompt.value ?? '';
  if (item.source === 'choice') {
    harness?.selectChoiceFromMenu(String(item.value ?? item.name));
    agentPrompt.value = (text.slice(0, trigger.start) + text.slice(trigger.end)).trim();
    closeComposer();
    return;
  }
  const insert = `${trigger.trigger}${item.name} `;
  agentPrompt.value = text.slice(0, trigger.start) + insert + text.slice(trigger.end);
  closeComposer();
  await nextTick();
  const el = textareaEl();
  if (el) {
    const pos = trigger.start + insert.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  }
}

function onComposerKeydown(e: KeyboardEvent) {
  if (composerItems.value.length === 0 || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = composerItems.value.length;
    composerIndex.value = (composerIndex.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    applyComposerItem(composerItems.value[composerIndex.value]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeComposer();
  }
}

function runExecution() {
  if (harness?.executeOpPrompt) harness.executeOpPrompt();
  emit('execute');
}

function promptShowResources() {
  if (!harness) return;
  harness.promptInput.value = 'show app resources';
  harness.showResourcesSurface();
}

function clearPromptAction() {
  if (harness?.clearPrompt) harness.clearPrompt();
  emit('clear');
}

function handleContextMenu(e: MouseEvent) {
  if (harness?.openContextMenu) harness.openContextMenu(e);
  emit('openContextMenu', e);
}

function triggerFilePicker() {
  fileInputRef.value?.click();
}

async function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length || !harness) return;
  await harness.uploadFilesToStorage(input.files, 'photos');
  input.value = '';
}

async function onFilesDropped(e: DragEvent) {
  if (!e.dataTransfer?.files?.length || !harness) return;
  await harness.uploadFilesToStorage(e.dataTransfer.files, 'photos');
}

function removeUploadedFile(idx: number) {
  harness?.removePendingUploadFile(idx);
}
</script>

<style scoped>
.code-input :deep(textarea) {
  font-family: 'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace !important;
  font-size: 0.88rem !important;
  line-height: 1.45 !important;
}
</style>
