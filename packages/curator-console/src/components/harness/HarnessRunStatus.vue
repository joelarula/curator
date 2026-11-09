<template>
  <div v-if="run" class="harness-run-status text-caption">
    <div
      class="d-flex align-center ga-2 cursor-pointer user-select-none"
      role="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <v-progress-circular v-if="run.active && !isDone" indeterminate size="12" width="2" color="primary" />
      <v-icon v-else size="14" :color="stateColor(run.status)">{{ stateIcon(run.status) }}</v-icon>
      <span class="text-high-emphasis">{{ summary }}</span>
      <v-icon size="14" class="text-medium-emphasis">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
    </div>

    <v-expand-transition>
      <div v-show="expanded" class="mt-1 ps-5">
        <div v-if="run.steps.length === 0" class="text-disabled">No steps reported yet.</div>
        <template v-for="step in run.steps" :key="step.requestId">
          <div class="d-flex align-center ga-2 py-0">
            <v-icon size="12" :color="stateColor(step.state)">{{ stateIcon(step.state) }}</v-icon>
            <span class="font-weight-medium">{{ step.label }}</span>
            <span class="text-disabled font-monospace">#{{ step.requestId }}</span>
            <v-chip v-if="step.replayed" size="x-small" variant="tonal" color="secondary">replayed</v-chip>
            <span v-if="step.attempt > 1" class="text-warning">attempt {{ step.attempt }}</span>
            <span v-if="step.detail" class="text-medium-emphasis text-truncate" :title="step.detail">{{ step.detail }}</span>
            <span v-if="step.durationMs != null" class="ms-auto text-medium-emphasis">{{ formatProgressDuration(step.durationMs) }}</span>
          </div>
          <!-- Tool calls made inside the step (agent steps) -->
          <div v-for="call in step.calls" :key="`${step.requestId}-${call.callId}`" class="d-flex align-center ga-2 py-0 ps-5">
            <v-progress-circular v-if="call.state === 'running'" indeterminate size="10" width="1" color="primary" />
            <v-icon v-else size="11" :color="stateColor(call.state)">{{ stateIcon(call.state) }}</v-icon>
            <span>{{ call.label }}</span>
            <span v-if="call.durationMs != null" class="ms-auto text-medium-emphasis">{{ formatProgressDuration(call.durationMs) }}</span>
          </div>
        </template>
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatProgressDuration, isRunDone, summarizeRun } from '@curator/host/contracts';
import type { RunStepState, RunTimeline } from '../../composables/useRunTimeline';

const props = withDefaults(defineProps<{ run: RunTimeline | null; defaultExpanded?: boolean }>(), {
  defaultExpanded: false,
});

const expanded = ref(props.defaultExpanded);

const isDone = computed(() => !!props.run && isRunDone(props.run));

// Re-evaluated on each run change; while running, the duration ticks with the next event.
const summary = computed(() => (props.run ? summarizeRun(props.run) : ''));

function stateIcon(state: RunStepState | RunTimeline['status']): string {
  switch (state) {
    case 'COMPLETED': return 'mdi-check-circle-outline';
    case 'FAILED': return 'mdi-alert-circle-outline';
    case 'CANCELLED': return 'mdi-cancel';
    case 'SKIPPED': return 'mdi-debug-step-over';
    case 'retrying': return 'mdi-refresh';
    case 'waiting': return 'mdi-pause-circle-outline';
    default: return 'mdi-progress-clock';
  }
}

function stateColor(state: RunStepState | RunTimeline['status']): string {
  switch (state) {
    case 'COMPLETED': return 'success';
    case 'FAILED': return 'error';
    case 'retrying':
    case 'waiting': return 'warning';
    case 'CANCELLED':
    case 'SKIPPED': return 'grey';
    default: return 'primary';
  }
}
</script>
