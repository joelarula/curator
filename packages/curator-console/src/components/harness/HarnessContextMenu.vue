<template>
  <div>
    <!-- Invisible fixed positioning anchor for context menu -->
    <div
      ref="anchorRef"
      :style="anchorStyle"
    />

    <v-menu
      v-model="isVisible"
      :target="anchorRef"
      :close-on-content-click="false"
      location="bottom start"
      transition="scale-transition"
      min-width="260"
      max-width="340"
    >
      <v-card elevation="8" rounded="lg" class="pa-1 border" color="surface">
        <v-list density="compact" nav class="py-1">
          <!-- 1. Active AST Workflow Choices (if any) -->
          <template v-if="choiceItems.length > 0">
            <v-list-subheader class="text-uppercase text-caption font-weight-bold text-primary px-2">
              ⚡ Workflow Choices (AST)
            </v-list-subheader>
            <v-list-item
              v-for="c in choiceItems"
              :key="c.value"
              :value="c.value"
              :active="activeChoice === c.value"
              rounded="md"
              class="mb-1"
              @click="selectChoice(c.value)"
            >
              <template #prepend>
                <v-icon :color="c.color || 'primary'" size="18">mdi-checkbox-blank-circle</v-icon>
              </template>
              <v-list-item-title class="font-weight-medium">{{ c.label }}</v-list-item-title>
              <template #append v-if="c.action">
                <v-chip size="x-small" :color="c.color || 'primary'" variant="outlined" class="font-mono">
                  {{ c.action }}
                </v-chip>
              </template>
            </v-list-item>
            <v-divider class="my-1" />
          </template>

          <!-- 2. Registered Tools Insertion -->
          <template v-if="toolItems.length > 0">
            <v-list-subheader class="text-uppercase text-caption font-weight-bold text-medium-emphasis px-2">
              🛠️ Execute / Insert Tool
            </v-list-subheader>
            <v-list-item
              v-for="t in toolItems.slice(0, 5)"
              :key="t.name"
              prepend-icon="mdi-wrench"
              rounded="md"
              class="mb-1"
              @click="insertTool(t)"
            >
              <v-list-item-title class="font-mono text-caption">{{ t.name }}</v-list-item-title>
            </v-list-item>
            <v-divider class="my-1" />
          </template>

          <!-- 3. Target Agents Switcher -->
          <template v-if="agentItems.length > 1">
            <v-list-subheader class="text-uppercase text-caption font-weight-bold text-medium-emphasis px-2">
              🤖 Switch Target Agent
            </v-list-subheader>
            <v-list-item
              v-for="ag in agentItems"
              :key="ag.name"
              prepend-icon="mdi-robot"
              :active="selectedAgentName === ag.name"
              rounded="md"
              class="mb-1"
              @click="switchAgent(ag.name)"
            >
              <v-list-item-title>{{ ag.name }}</v-list-item-title>
            </v-list-item>
            <v-divider class="my-1" />
          </template>

          <!-- 4. REPL & Harness Verbs -->
          <v-list-subheader class="text-uppercase text-caption font-weight-bold text-medium-emphasis px-2">
            💻 REPL Verbs &amp; Actions
          </v-list-subheader>
          <v-list-item
            title="/status - Inspect Engine & DB"
            prepend-icon="mdi-information-outline"
            @click="runCmd('/status')"
          />
          <v-list-item
            :title="paused ? '/resume - Resume Engine' : '/pause - Pause Engine'"
            :prepend-icon="paused ? 'mdi-play' : 'mdi-pause'"
            @click="runCmd('/pause')"
          />
          <v-list-item
            title="/workflow - CoffeeScript Studio"
            prepend-icon="mdi-coffee"
            @click="runCmd('/workflow')"
          />
          <v-list-item
            title="/export - Export SQLite DB"
            prepend-icon="mdi-download"
            @click="runCmd('/export')"
          />
          <v-list-item
            title="/clear - Clear Prompt & Turn Output"
            prepend-icon="mdi-eraser"
            @click="runCmd('/clear')"
          />
        </v-list>
      </v-card>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useHarnessContext } from '../../context';
import type { ChoiceItem } from './HarnessChoices.vue';

interface Props {
  modelValue?: boolean;
  anchorX?: number;
  anchorY?: number;
  choices?: ChoiceItem[];
  activeChoiceValue?: any;
  tools?: any[];
  agents?: any[];
  selectedAgent?: string;
  isPaused?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  anchorX: undefined,
  anchorY: undefined,
  choices: undefined,
  activeChoiceValue: undefined,
  tools: undefined,
  agents: undefined,
  selectedAgent: undefined,
  isPaused: undefined,
});

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'selectChoice', choiceValue: string): void;
  (e: 'insertTool', tool: any): void;
  (e: 'switchAgent', agentName: string): void;
  (e: 'command', cmd: string): void;
}>();

const harness = useHarnessContext();

const isVisible = computed({
  get: () => props.modelValue ?? harness?.contextMenuVisible.value ?? false,
  set: (val) => {
    if (harness) harness.contextMenuVisible.value = val;
    emit('update:modelValue', val);
  },
});

const x = computed(() => props.anchorX ?? harness?.contextMenuX.value ?? 0);
const y = computed(() => props.anchorY ?? harness?.contextMenuY.value ?? 0);
const choiceItems = computed(() => props.choices ?? harness?.availableChoices.value ?? []);
const activeChoice = computed(() => props.activeChoiceValue ?? harness?.activeChoiceValue.value ?? null);
const toolItems = computed(() => props.tools ?? harness?.tools.value ?? []);
const agentItems = computed(() => props.agents ?? harness?.agents.value ?? []);
const selectedAgentName = computed(() => props.selectedAgent ?? harness?.selectedAgent.value ?? '');
const paused = computed(() => props.isPaused ?? harness?.isPaused.value ?? false);

const anchorRef = ref<HTMLElement | null>(null);

const anchorStyle = computed(() => ({
  position: 'fixed' as const,
  left: `${x.value}px`,
  top: `${y.value}px`,
  width: '1px',
  height: '1px',
  pointerEvents: 'none' as const,
  zIndex: 9999,
}));

function selectChoice(val: string) {
  if (harness?.selectChoiceFromMenu) harness.selectChoiceFromMenu(val);
  emit('selectChoice', val);
  isVisible.value = false;
}

function switchAgent(name: string) {
  if (harness?.switchAgentFromMenu) harness.switchAgentFromMenu(name);
  emit('switchAgent', name);
  isVisible.value = false;
}

function insertTool(tool: any) {
  if (harness?.insertToolCommand) harness.insertToolCommand(tool);
  emit('insertTool', tool);
  isVisible.value = false;
}

function runCmd(cmd: string) {
  if (harness?.executeCommand) harness.executeCommand(cmd);
  emit('command', cmd);
  isVisible.value = false;
}
</script>
