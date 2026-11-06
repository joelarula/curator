<template>
  <v-card elevation="2" rounded="lg" class="mb-6 border" color="surface">
    <!-- Header: Title, Commands Menu Activator & Mode Selector -->
    <div class="px-4 py-3 border-b d-flex align-center justify-space-between flex-wrap ga-2">
      <div class="d-flex align-center ga-2">
        <span class="text-h6">⚡</span>
        <span class="text-subtitle-1 font-weight-bold">Operator Prompt (OpPrompt) &amp; Execution</span>
      </div>

      <div class="d-flex align-center ga-2 flex-wrap">
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
          Program Commands
        </v-btn>

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
          <v-btn value="agent" size="small">
            <span class="me-1">🤖</span> Agent Turn
          </v-btn>
          <v-btn value="tool" size="small">
            <span class="me-1">🛠️</span> Direct Tool
          </v-btn>
          <v-btn value="workflow" size="small">
            <span class="me-1">☕</span> CoffeeScript AST
          </v-btn>
        </v-btn-toggle>
      </div>
    </div>

    <!-- Main Deck Content: Left OpPrompt & Right Output -->
    <v-card-text class="pa-4">
      <v-row>
        <slot name="prompt">
          <HarnessOpPrompt />
        </slot>
        <slot name="output">
          <HarnessOutput />
        </slot>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useHarnessContext } from '../../context';
import HarnessOpPrompt from './HarnessOpPrompt.vue';
import HarnessOutput from './HarnessOutput.vue';

const props = defineProps<{
  execMode?: 'agent' | 'tool' | 'workflow';
}>();

const emit = defineEmits<{
  (e: 'update:execMode', mode: 'agent' | 'tool' | 'workflow'): void;
  (e: 'openContextMenu', event: MouseEvent): void;
}>();

const harness = useHarnessContext();

const mode = computed(() => {
  if (props.execMode !== undefined) return props.execMode;
  return harness?.execMode.value ?? 'agent';
});

function setMode(newMode: 'agent' | 'tool' | 'workflow') {
  if (harness) {
    harness.execMode.value = newMode;
  }
  emit('update:execMode', newMode);
}

function openMenu(e: MouseEvent) {
  if (harness?.openContextMenu) {
    harness.openContextMenu(e);
  }
  emit('openContextMenu', e);
}
</script>

