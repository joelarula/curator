<template>
  <v-card variant="tonal" :color="mode === 'approval' ? 'warning' : 'primary'" density="compact" class="pa-3 harness-interrupt-card">
    <div class="d-flex align-center ga-2 mb-2">
      <v-icon size="16">{{ icon }}</v-icon>
      <span class="text-body-2 font-weight-bold">{{ title }}</span>
      <v-chip size="x-small" variant="outlined" class="ms-auto font-monospace">#{{ interrupt.requestId }}</v-chip>
    </div>

    <!-- Tool approval: what would run, then the answers -->
    <template v-if="mode === 'approval'">
      <div class="text-caption mb-1">
        Tool <strong class="font-monospace">{{ interrupt.payload?.tool }}</strong>
        <template v-if="interrupt.payload?.agentName"> requested by <strong>{{ interrupt.payload.agentName }}</strong></template>
      </div>
      <div v-if="interrupt.payload?.reason" class="text-caption text-medium-emphasis mb-1">{{ interrupt.payload.reason }}</div>
      <pre v-if="argsText" class="text-caption font-monospace pa-2 rounded bg-surface overflow-auto mb-2" style="max-height: 160px;">{{ argsText }}</pre>
      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-for="(opt, i) in options"
          :key="i"
          size="small"
          :variant="i === 0 ? 'flat' : 'outlined'"
          :color="isDeny(opt.value) ? 'error' : 'success'"
          :loading="busy"
          :disabled="busy"
          @click="emit('resume', opt.value)"
        >
          {{ opt.label }}
        </v-btn>
      </div>
    </template>

    <!-- Free text answer -->
    <form v-else-if="mode === 'text'" class="d-flex ga-2 align-center" @submit.prevent="submitText">
      <v-text-field v-model="text" density="compact" hide-details variant="outlined" placeholder="Your answer" autofocus />
      <v-btn type="submit" size="small" color="primary" :loading="busy" :disabled="busy || !text.trim()">Send</v-btn>
    </form>

    <!-- Structured answer (resumeSchema is not a string); a generated form comes with plugin config schemas -->
    <form v-else-if="mode === 'json'" @submit.prevent="submitJson">
      <v-textarea v-model="text" density="compact" variant="outlined" rows="3" auto-grow hide-details placeholder="{ }" class="font-monospace" />
      <div v-if="jsonError" class="text-caption text-error mt-1">{{ jsonError }}</div>
      <div class="d-flex justify-end mt-2">
        <v-btn type="submit" size="small" color="primary" :loading="busy" :disabled="busy || !text.trim()">Send</v-btn>
      </div>
    </form>

    <!-- Event wait: nothing to answer here -->
    <div v-else class="text-caption text-medium-emphasis">
      The run continues when {{ eventNames || 'the event' }} arrives.
    </div>

    <div v-if="deadlineText" class="text-caption text-medium-emphasis mt-2">Expires {{ deadlineText }}</div>
    <div v-if="error" class="text-caption text-error mt-1">{{ error }}</div>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  interruptInputMode,
  interruptOptions,
  interruptTitle,
  type CuratorInterrupt,
} from '@curator/host/contracts';

const props = defineProps<{ interrupt: CuratorInterrupt; busy?: boolean; error?: string | null }>();
const emit = defineEmits<{ (e: 'resume', value: unknown): void }>();

const text = ref('');
const jsonError = ref<string | null>(null);

const mode = computed(() => interruptInputMode(props.interrupt));
const title = computed(() => interruptTitle(props.interrupt));
const options = computed(() => interruptOptions(props.interrupt));
const icon = computed(() => (mode.value === 'approval' ? 'mdi-shield-alert-outline' : mode.value === 'event' ? 'mdi-timer-sand' : 'mdi-message-question-outline'));
const argsText = computed(() => {
  const args = props.interrupt.payload?.args;
  return args && Object.keys(args).length ? JSON.stringify(args, null, 2) : '';
});
const eventNames = computed(() => (props.interrupt.payload?.eventNames ?? []).join(', '));
const deadlineText = computed(() => {
  const d = props.interrupt.deadline ? new Date(props.interrupt.deadline) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleString() : '';
});

function isDeny(value: unknown): boolean {
  return !!value && typeof value === 'object' && (value as any).approved === false;
}

function submitText() {
  if (text.value.trim()) emit('resume', text.value.trim());
}

function submitJson() {
  try {
    jsonError.value = null;
    emit('resume', JSON.parse(text.value));
  } catch (err: any) {
    jsonError.value = `Not valid JSON: ${err?.message ?? err}`;
  }
}
</script>
