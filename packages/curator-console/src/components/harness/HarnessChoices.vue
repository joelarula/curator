<template>
  <v-card
    v-if="choices.length > 0"
    :variant="variant"
    :color="color"
    density="compact"
    rounded="lg"
    class="pa-2 border choices-container"
  >
    <!-- Header Row -->
    <div class="d-flex align-center justify-space-between mb-1 flex-wrap ga-1">
      <div class="d-flex align-center ga-2">
        <span class="text-caption font-weight-bold text-high-emphasis">
          🎯 {{ prompt || 'Workflow Choices' }}
        </span>
        <v-chip
          v-if="hasSelection"
          size="x-small"
          color="primary"
          variant="flat"
        >
          Selected: {{ selectionSummary }}
        </v-chip>
        <v-chip
          v-if="waitingRequestId"
          size="x-small"
          variant="outlined"
          color="warning"
        >
          Task #{{ waitingRequestId }} Waiting
        </v-chip>
      </div>

      <div class="d-flex align-center ga-1">
        <!-- Display Format Toggle -->
        <v-btn-toggle
          v-if="showModeToggle"
          :model-value="displayMode"
          density="compact"
          variant="text"
          color="primary"
          mandatory
          @update:model-value="$emit('update:displayMode', $event)"
        >
          <v-btn value="radio" size="x-small" title="Single Choice (Radio)">
            Radio
          </v-btn>
          <v-btn value="checkbox" size="x-small" title="Multiple Choices (Checkboxes)">
            Check
          </v-btn>
          <v-btn value="chips" size="x-small" title="Action Chips">
            Chips
          </v-btn>
        </v-btn-toggle>

        <!-- Clear Selection Button -->
        <v-btn
          v-if="hasSelection"
          size="x-small"
          variant="text"
          color="error"
          icon="mdi-close"
          title="Clear Choice"
          @click="$emit('clear')"
        />
      </div>
    </div>

    <!-- 1. Single-Choice Radios -->
    <div v-if="displayMode === 'radio'" class="d-flex align-center flex-wrap ga-2 pt-1">
      <v-radio-group
        :model-value="selectedRadio"
        inline
        density="compact"
        hide-details
        class="choice-radios"
        @update:model-value="$emit('update:selectedRadio', $event)"
      >
        <v-radio
          v-for="c in choices"
          :key="c.value"
          :value="c.value"
          :label="c.label"
          :color="c.color || 'primary'"
          density="compact"
          class="me-3"
        />
      </v-radio-group>
    </div>

    <!-- 2. Multi-Choice Checkboxes -->
    <div v-else-if="displayMode === 'checkbox'" class="d-flex align-center flex-wrap ga-3 pt-1">
      <v-checkbox
        v-for="c in choices"
        :key="c.value"
        :model-value="selectedCheckboxes"
        :value="c.value"
        :label="c.label"
        :color="c.color || 'primary'"
        density="compact"
        hide-details
        @update:model-value="onCheckboxUpdate(c.value, $event)"
      />
    </div>

    <!-- 3. Action Chips / Buttons -->
    <div v-else class="d-flex align-center flex-wrap ga-1 pt-1">
      <v-chip
        v-for="c in choices"
        :key="c.value"
        :color="selectedChip === c.value ? (c.color || 'primary') : 'default'"
        :variant="selectedChip === c.value ? 'flat' : 'outlined'"
        size="small"
        class="font-weight-medium cursor-pointer"
        @click="toggleChip(c.value)"
      >
        {{ c.label }}
      </v-chip>
    </div>

    <!-- Optional Footer Action Strip (for after-results view) -->
    <div v-if="showFooterSubmit" class="d-flex align-center justify-space-between mt-3 pt-2 border-t">
      <div class="text-caption text-medium-emphasis">
        Selected: <strong class="text-primary">{{ selectionSummary || 'None' }}</strong>
      </div>
      <div class="d-flex align-center ga-2">
        <v-btn
          size="x-small"
          variant="text"
          prepend-icon="mdi-format-quote-close"
          @click="$emit('focusPrompt')"
        >
          Add Prompt Speech
        </v-btn>
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          prepend-icon="mdi-send"
          :loading="loading"
          @click="$emit('submit')"
        >
          Submit Turn Choice
        </v-btn>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface ChoiceItem {
  label: string;
  value: string;
  color?: string;
  action?: string;
  tool?: string;
  args?: any;
}

interface Props {
  choices: ChoiceItem[];
  prompt?: string;
  waitingRequestId?: string | null;
  displayMode?: 'radio' | 'checkbox' | 'chips';
  showModeToggle?: boolean;
  showFooterSubmit?: boolean;
  variant?: 'outlined' | 'tonal' | 'flat' | 'elevated' | 'plain';
  color?: string;
  selectedRadio?: string | null;
  selectedCheckboxes?: string[];
  selectedChip?: string | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  prompt: 'Workflow Turn Choices',
  waitingRequestId: null,
  displayMode: 'radio',
  showModeToggle: true,
  showFooterSubmit: false,
  variant: 'outlined',
  color: undefined,
  selectedRadio: null,
  selectedCheckboxes: () => [],
  selectedChip: null,
  loading: false,
});

const emit = defineEmits<{
  (e: 'update:selectedRadio', val: string | null): void;
  (e: 'update:selectedCheckboxes', val: string[]): void;
  (e: 'update:selectedChip', val: string | null): void;
  (e: 'update:displayMode', mode: 'radio' | 'checkbox' | 'chips'): void;
  (e: 'clear'): void;
  (e: 'submit'): void;
  (e: 'focusPrompt'): void;
}>();

const hasSelection = computed(() => {
  if (props.displayMode === 'checkbox') {
    return props.selectedCheckboxes.length > 0;
  }
  if (props.displayMode === 'radio') {
    return Boolean(props.selectedRadio);
  }
  return Boolean(props.selectedChip);
});

const selectionSummary = computed(() => {
  if (props.displayMode === 'checkbox') {
    return props.selectedCheckboxes.join(', ');
  }
  if (props.displayMode === 'radio') {
    return props.selectedRadio || '';
  }
  return props.selectedChip || '';
});

function toggleChip(val: string) {
  if (props.selectedChip === val) {
    emit('update:selectedChip', null);
  } else {
    emit('update:selectedChip', val);
  }
}

function onCheckboxUpdate(val: string, checked: boolean | any) {
  const current = [...props.selectedCheckboxes];
  const isIncluded = current.includes(val);
  if (checked && !isIncluded) {
    current.push(val);
  } else if (!checked && isIncluded) {
    const idx = current.indexOf(val);
    current.splice(idx, 1);
  }
  emit('update:selectedCheckboxes', current);
}
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>

