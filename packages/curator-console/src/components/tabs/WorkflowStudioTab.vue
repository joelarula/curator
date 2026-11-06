<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold">CoffeeScript Natural Verbs AST Studio</h3>
        <div class="text-caption text-medium-emphasis">
          Write declarative workflows and compile them via <code>mutation CompileCoffee { compileCoffeeScript(code: $code) }</code>
        </div>
      </div>

      <div class="d-flex align-center ga-2 flex-wrap">
        <v-select
          v-model="selectedPreset"
          :items="presetItems"
          label="Workflow Templates"
          density="compact"
          variant="outlined"
          hide-details
          style="min-width: 220px;"
          @update:model-value="onPresetSelected"
        />
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          prepend-icon="mdi-code-braces"
          :loading="isCompiling"
          @click="compileWorkflow"
        >
          Compile to AST
        </v-btn>
        <v-btn
          variant="tonal"
          size="small"
          prepend-icon="mdi-arrow-up-bold"
          @click="sendToOpPrompt"
        >
          Send to OpPrompt
        </v-btn>
      </div>
    </div>

    <v-row>
      <v-col cols="12" md="6">
        <v-textarea
          :model-value="currentCode"
          label="CoffeeScript Verbs DSL"
          rows="14"
          variant="outlined"
          class="code-input mb-3"
          hide-details
          @update:model-value="onCodeInput"
        />
        <div class="d-flex ga-2">
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-code-braces"
            :loading="isCompiling"
            @click="compileWorkflow"
          >
            Compile to AST
          </v-btn>
          <v-btn
            variant="tonal"
            prepend-icon="mdi-arrow-up-bold"
            @click="sendToOpPrompt"
          >
            Send to OpPrompt
          </v-btn>
        </div>
      </v-col>

      <v-col cols="12" md="6">
        <v-card variant="tonal" rounded="lg" class="pa-3 fill-height d-flex flex-column border" color="surface">
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-caption font-weight-bold text-medium-emphasis">COMPILED EXECUTION AST</span>
            <v-btn
              v-if="effectiveAst"
              size="x-small"
              variant="text"
              icon="mdi-content-copy"
              @click="copyToClipboard(JSON.stringify(effectiveAst, null, 2))"
            />
          </div>
          <v-alert
            v-if="compileError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-2 text-caption"
          >
            {{ compileError }}
          </v-alert>
          <pre
            class="font-monospace text-caption pa-2 flex-grow-1 rounded bg-surface-variant text-cyan-accent-2 overflow-auto"
            style="max-height: 380px;"
          >{{ effectiveAst ? JSON.stringify(effectiveAst, null, 2) : (compileError ? '// Compilation failed' : '// Compiled AST will appear here...') }}</pre>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CuratorConsoleAdapter } from '../../types';
import { COMPILE_COFFEESCRIPT_MUTATION } from '../../graphqlOperations';

export interface WorkflowStudioTabProps {
  adapter?: CuratorConsoleAdapter;
  modelValue?: string;
  ast?: any | null;
  compiling?: boolean;
}

const props = withDefaults(defineProps<WorkflowStudioTabProps>(), {
  adapter: undefined,
  modelValue: undefined,
  ast: undefined,
  compiling: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
  (e: 'compile'): void;
  (e: 'sendToPrompt'): void;
  (e: 'load-workflow', code: string): void;
  (e: 'loadWorkflow', code: string): void;
}>();

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
  tool "calculate_metric", baseValue: 25, multiplier: 4
  emit_event "metric:computed", value: 100
]`,
  state: `# Stateful Counter Loop
while_loop "$context.count < 3",
  seq [
    set_state count: "$context.count + 1"
    emit_event "counter:tick", current: "$context.count"
  ]`,
};

const presetItems = [
  { title: 'Ping-Pong Event Loop', value: 'pingpong' },
  { title: 'Sequential Tool Execution', value: 'seq' },
  { title: 'Stateful Accumulator', value: 'state' },
];

const selectedPreset = ref('pingpong');
const internalCode = ref(workflowPresets.pingpong);
const internalAst = ref<any | null>(null);
const internalCompiling = ref(false);
const compileError = ref<string | null>(null);

const currentCode = computed({
  get: () => (props.modelValue !== undefined ? props.modelValue : internalCode.value),
  set: (val: string) => {
    internalCode.value = val;
    emit('update:modelValue', val);
  },
});

const effectiveAst = computed(() => (props.ast !== undefined ? props.ast : internalAst.value));
const isCompiling = computed(() => props.compiling || internalCompiling.value);

function onCodeInput(val: string) {
  currentCode.value = val;
}

function onPresetSelected(val: string) {
  if (workflowPresets[val]) {
    currentCode.value = workflowPresets[val];
  }
}

async function compileWorkflow() {
  emit('compile');

  internalCompiling.value = true;
  compileError.value = null;

  try {
    let result: any;
    if (props.adapter?.executeGraphql) {
      result = await props.adapter.executeGraphql(COMPILE_COFFEESCRIPT_MUTATION, {
        code: currentCode.value,
      });
    } else {
      const res = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: COMPILE_COFFEESCRIPT_MUTATION,
          variables: { code: currentCode.value },
        }),
      });
      result = (await res.json()).data;
    }

    const compRes = result?.compileCoffeeScript;
    if (compRes?.success) {
      internalAst.value = compRes.ast;
      compileError.value = null;
    } else {
      compileError.value = compRes?.error || 'Workflow compilation failed';
      internalAst.value = null;
    }
  } catch (err: any) {
    compileError.value = err.message || 'Workflow compilation error';
    internalAst.value = null;
  } finally {
    internalCompiling.value = false;
  }
}

function sendToOpPrompt() {
  emit('sendToPrompt');
  emit('load-workflow', currentCode.value);
  emit('loadWorkflow', currentCode.value);
}

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text);
}
</script>

<style scoped>
.code-input :deep(textarea) {
  font-family: 'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace !important;
  font-size: 0.88rem !important;
  line-height: 1.45 !important;
}
</style>
