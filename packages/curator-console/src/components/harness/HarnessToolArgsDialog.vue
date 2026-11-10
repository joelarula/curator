<template>
  <v-dialog :model-value="!!tool" max-width="520" @update:model-value="(open) => !open && cancel()">
    <v-card v-if="tool" rounded="lg">
      <v-card-title class="d-flex align-center ga-2 text-subtitle-1">
        <v-icon size="18">mdi-wrench-outline</v-icon>
        <span class="font-monospace">/{{ tool.name }}</span>
      </v-card-title>
      <v-card-subtitle v-if="tool.description" class="text-wrap">{{ tool.description }}</v-card-subtitle>
      <v-card-text>
        <form id="harness-tool-args" @submit.prevent="submit">
          <HarnessSchemaForm
            v-if="isForm"
            :model-value="args"
            :schema="tool.parameters"
            @update:model-value="(v) => harness && (harness.toolFormArgs.value = v)"
            @update:valid="(v) => (valid = v)"
          />
          <div v-else class="text-caption text-medium-emphasis">This tool takes no form-friendly arguments; it runs with what you typed.</div>
        </form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="cancel">Cancel</v-btn>
        <v-btn color="primary" type="submit" form="harness-tool-args" :disabled="isForm && !valid">Run</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isFormSchema } from '../../composables/useSchemaForm';
import { useHarnessContext } from '../../context';
import HarnessSchemaForm from './HarnessSchemaForm.vue';

/** Asks for a composer tool's missing required arguments with a form generated from its JSON Schema. */
const harness = useHarnessContext();
const tool = computed(() => harness?.toolFormTarget.value ?? null);
const args = computed(() => harness?.toolFormArgs.value ?? {});
const isForm = computed(() => isFormSchema(tool.value?.parameters));
const valid = ref(false);

watch(tool, () => {
  // Valid only once the form reports it (required fields filled)
  valid.value = false;
});

function submit() {
  harness?.submitToolForm();
}

function cancel() {
  if (harness) harness.toolFormTarget.value = null;
}
</script>
