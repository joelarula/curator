<template>
  <v-card elevation="2" rounded="lg" class="mb-6 border" color="surface">
    <!-- Top & Right Toolbar: Title, Layout Switcher, Program Commands & Execution Mode -->
    <div class="px-4 py-2 border-b d-flex align-center justify-space-between flex-wrap ga-2 bg-surface-variant">
      <div class="d-flex align-center ga-2">
        <span class="text-h6">⚡</span>
        <span class="text-subtitle-2 font-weight-bold">
          {{ layout === 'stack' ? 'Top-Down Feedback & OpPrompt Stack' : 'Two-Column Prompt & Worktable Scene' }}
        </span>
      </div>

      <!-- Right-Aligned Menus & Toolbars -->
      <div class="d-flex align-center ga-2 flex-wrap">
        <!-- Layout Switcher: Top-Down Stack vs 2-Column Workbench -->
        <v-btn-toggle
          :model-value="layout"
          mandatory
          density="compact"
          color="primary"
          variant="outlined"
          rounded="lg"
          @update:model-value="setLayout"
        >
          <v-btn value="stack" size="x-small" title="Top-Down Stack: Feedback & Grid/List Above Prompt">
            <v-icon size="15" class="me-1">mdi-view-sequential-outline</v-icon>
            Top-Down Stack
          </v-btn>
          <v-btn value="workbench" size="x-small" title="2-Column Split: Prompt+Feedback Left, Scene/Worktable Right">
            <v-icon size="15" class="me-1">mdi-view-split-vertical</v-icon>
            2-Col Worktable
          </v-btn>
        </v-btn-toggle>

        <!-- Mode Selector -->
        <v-btn-toggle
          :model-value="mode"
          mandatory
          density="compact"
          color="primary"
          variant="outlined"
          rounded="lg"
          @update:model-value="setMode"
        >
          <v-btn value="agent" size="x-small">
            <span class="me-1">🤖</span> Agent
          </v-btn>
          <v-btn value="tool" size="x-small">
            <span class="me-1">🛠️</span> Tool
          </v-btn>
          <v-btn value="workflow" size="x-small">
            <span class="me-1">☕</span> AST
          </v-btn>
        </v-btn-toggle>

        <!-- Program Commands Context Menu Activator -->
        <v-btn
          size="small"
          variant="tonal"
          color="secondary"
          prepend-icon="mdi-console-line"
          append-icon="mdi-menu-down"
          class="text-caption font-weight-bold"
          title="Open Program Commands &amp; Actions Menu"
          @click="openMenu($event)"
        >
          Commands
        </v-btn>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- LAYOUT 1: TOP-DOWN VERTICAL STACK (Feedback ABOVE OpPrompt)          -->
    <!-- =================================================================== -->
    <v-card-text v-if="layout === 'stack'" class="pa-4">
      <div class="d-flex flex-column ga-4">
        <!-- 1. Feedback & Dynamic UI Surface Pane (ABOVE Prompt) -->
        <slot name="output">
          <HarnessOutput />
        </slot>

        <!-- 2. Operator Prompt (OpPrompt) & Upload Below Feedback -->
        <slot name="prompt">
          <HarnessOpPrompt />
        </slot>
      </div>
    </v-card-text>

    <!-- =================================================================== -->
    <!-- LAYOUT 2: TWO-COLUMN WORKBENCH (Left: Prompt+Feedback, Right: Scene) -->
    <!-- =================================================================== -->
    <v-card-text v-else class="pa-4">
      <v-row>
        <!-- Left Column: Feedback + Prompt Stack -->
        <v-col cols="12" md="5" class="d-flex flex-column ga-4">
          <slot name="output">
            <HarnessOutput />
          </slot>
          <slot name="prompt">
            <HarnessOpPrompt />
          </slot>
        </v-col>

        <!-- Right Column: Interactive Scene / Worktable -->
        <v-col cols="12" md="7" class="d-flex flex-column">
          <slot name="worktable">
            <HarnessWorktable />
          </slot>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useHarnessContext } from '../../context';
import type { HarnessLayoutMode } from '../../types';
import HarnessOpPrompt from './HarnessOpPrompt.vue';
import HarnessOutput from './HarnessOutput.vue';
import HarnessWorktable from './HarnessWorktable.vue';

const props = defineProps<{
  execMode?: 'agent' | 'tool' | 'workflow';
  layoutMode?: HarnessLayoutMode;
}>();

const emit = defineEmits<{
  (e: 'update:execMode', mode: 'agent' | 'tool' | 'workflow'): void;
  (e: 'update:layoutMode', layout: HarnessLayoutMode): void;
  (e: 'openContextMenu', event: MouseEvent): void;
}>();

const harness = useHarnessContext();

const mode = computed(() => {
  if (props.execMode !== undefined) return props.execMode;
  return harness?.execMode.value ?? 'agent';
});

const layout = computed<HarnessLayoutMode>(() => {
  if (props.layoutMode !== undefined) return props.layoutMode;
  return harness?.layoutMode.value ?? 'stack';
});

function setMode(newMode: 'agent' | 'tool' | 'workflow') {
  if (harness) {
    harness.execMode.value = newMode;
  }
  emit('update:execMode', newMode);
}

function setLayout(newLayout: HarnessLayoutMode) {
  if (harness) {
    harness.layoutMode.value = newLayout;
  }
  emit('update:layoutMode', newLayout);
}

function openMenu(e: MouseEvent) {
  if (harness?.openContextMenu) {
    harness.openContextMenu(e);
  }
  emit('openContextMenu', e);
}
</script>
