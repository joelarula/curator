<template>
  <div class="harness-schema-field">
    <v-switch
      v-if="field.kind === 'boolean'"
      :model-value="!!modelValue"
      :label="field.label"
      :hint="field.description"
      :persistent-hint="!!field.description"
      density="compact"
      color="primary"
      :disabled="disabled"
      @update:model-value="emitInput"
    />
    <v-select
      v-else-if="field.kind === 'enum'"
      :model-value="modelValue"
      :items="field.options"
      :label="field.label"
      :hint="field.description"
      :persistent-hint="!!field.description"
      density="compact"
      variant="outlined"
      :disabled="disabled"
      @update:model-value="emitInput"
    />
    <v-textarea
      v-else-if="field.kind === 'json' || field.kind === 'text'"
      :model-value="text"
      :label="field.label"
      :hint="field.description"
      :persistent-hint="!!field.description"
      :error-messages="error ? [error] : []"
      :class="{ 'font-monospace': field.kind === 'json' }"
      rows="2"
      auto-grow
      density="compact"
      variant="outlined"
      :disabled="disabled"
      @update:model-value="onText"
    />
    <v-text-field
      v-else
      :model-value="text"
      :label="field.label"
      :hint="field.kind === 'secret' ? 'A secret reference, e.g. secret://MY_KEY (never the secret itself)' : field.description"
      :persistent-hint="field.kind === 'secret' || !!field.description"
      :placeholder="field.kind === 'secret' ? 'secret://NAME' : undefined"
      :type="field.kind === 'integer' || field.kind === 'number' ? 'number' : 'text'"
      :prepend-inner-icon="field.kind === 'secret' ? 'mdi-key-outline' : undefined"
      :error-messages="error ? [error] : []"
      density="compact"
      variant="outlined"
      :disabled="disabled"
      @update:model-value="onText"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatFieldValue, parseFieldInput, type SchemaField } from '../../composables/useSchemaForm';

const props = defineProps<{ field: SchemaField; modelValue: unknown; disabled?: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void;
  /** Parse error (null when the input is valid). */
  (e: 'error', message: string | null): void;
}>();

const text = ref(formatFieldValue(props.field, props.modelValue));
const error = ref<string | null>(null);

watch(
  () => props.modelValue,
  (v) => {
    // Don't overwrite what is being typed when the parent echoes the parsed value back
    const parsed = parseFieldInput(props.field, text.value);
    if (parsed.error || JSON.stringify(parsed.value) !== JSON.stringify(v)) text.value = formatFieldValue(props.field, v);
  }
);

function emitInput(value: unknown) {
  error.value = null;
  emit('error', null);
  emit('update:modelValue', value);
}

function onText(input: string) {
  text.value = input;
  const parsed = parseFieldInput(props.field, input);
  error.value = parsed.error ?? null;
  emit('error', error.value);
  if (!parsed.error) emit('update:modelValue', parsed.value);
}
</script>
