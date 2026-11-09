<template>
  <div class="harness-schema-form d-flex flex-column ga-2">
    <HarnessSchemaField
      v-for="field in fields"
      :key="field.key"
      :field="field"
      :model-value="modelValue?.[field.key]"
      :disabled="disabled"
      @update:model-value="(v) => update(field.key, v)"
      @error="(m) => setError(field.key, m)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { schemaFields } from '../../composables/useSchemaForm';
import HarnessSchemaField from './HarnessSchemaField.vue';

/** Form for an object JSON Schema; `valid` is false while a field has unparsable input or a required field is empty. */
const props = defineProps<{ schema: Record<string, any>; modelValue: Record<string, unknown> | null | undefined; disabled?: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, unknown>): void;
  (e: 'update:valid', valid: boolean): void;
}>();

const fields = computed(() => schemaFields(props.schema));
const errors = ref<Record<string, string>>({});

function isValid(value: Record<string, unknown>): boolean {
  return Object.keys(errors.value).length === 0 && fields.value.every((f) => !f.required || value[f.key] !== undefined);
}

function update(key: string, value: unknown) {
  const next = { ...(props.modelValue ?? {}) };
  if (value === undefined) delete next[key];
  else next[key] = value;
  emit('update:modelValue', next);
  emit('update:valid', isValid(next));
}

function setError(key: string, message: string | null) {
  const next = { ...errors.value };
  if (message) next[key] = message;
  else delete next[key];
  errors.value = next;
  emit('update:valid', isValid(props.modelValue ?? {}));
}
</script>
