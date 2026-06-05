<template>
  <div class="h-100 d-flex flex-column w-100">
    <MarkdownToolbar v-if="mode === 'edit'" @apply="applyTextFormat" class="mb-4">
      <template #append>
        <v-btn
          v-if="mode === 'edit'"
          color="success"
          variant="flat"
          rounded="pill"
          size="small"
          class="px-5 me-2"
          prepend-icon="mdi-content-save-outline"
          :loading="saving"
          @click="$emit('save')"
        >
          Save
        </v-btn>

        <v-btn
          v-if="mode === 'edit'"
          color="default"
          variant="tonal"
          rounded="pill"
          size="small"
          class="px-5"
          prepend-icon="mdi-close"
          @click="$emit('cancel')"
        >
          Cancel
        </v-btn>

        <v-btn
          v-if="canDelete"
          color="error"
          variant="tonal"
          rounded="pill"
          size="small"
          class="px-5"
          prepend-icon="mdi-delete-outline"
          @click="$emit('delete')"
        >
          Delete
        </v-btn>
      </template>
    </MarkdownToolbar>

    <div v-if="mode === 'read'" class="reading-typography read-pane animate-fade-in mb-16">
      <div class="content-renderer" v-html="renderedHtml"></div>
    </div>

    <v-textarea
      v-else
      ref="textEditorRef"
      :model-value="draft"
      @update:model-value="onDraftUpdate"
      variant="plain"
      class="reading-typography text-editor animate-fade-in flex-grow-1 w-100"
      placeholder="Compose high-fidelity content..."
      rows="12"
    ></v-textarea>
  </div>
</template>

<style scoped>
.text-editor {
  width: 100% !important;
  max-width: none !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  align-self: stretch;
}

.read-pane {
  margin-left: 24px;
  margin-right: 24px;
}

.text-editor :deep(.v-input__control) {
  min-height: 100%;
  width: 100%;
  max-width: none !important;
}

.text-editor :deep(textarea) {
  min-height: 100%;
  width: 100%;
  max-width: none !important;
  padding-inline: 8px;
}

.text-editor :deep(.v-input__wrapper) {
  width: 100%;
  max-width: none !important;
}

.text-editor :deep(.v-field) {
  width: 100%;
  max-width: none !important;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.text-editor :deep(.v-field__input) {
  width: 100%;
  max-width: none !important;
  padding-inline: 8px;
}

.text-editor :deep(.v-field__field) {
  width: 100%;
  max-width: none !important;
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import MarkdownToolbar from './MarkdownToolbar.vue'
import { useMarkdownEditor } from '../composables/useMarkdownEditor'

const props = defineProps<{
  mode: 'read' | 'edit'
  draft: string
  renderedHtml: string
  saving?: boolean
  canDelete?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:draft', value: string): void
  (e: 'save'): void
  (e: 'cancel'): void
  (e: 'delete'): void
}>()

const textEditorRef = ref<any>(null)

const draftProxy = {
  get value() {
    return props.draft || ''
  },
  set value(v: string) {
    emit('update:draft', v)
  }
}

const { applyFormat } = useMarkdownEditor(draftProxy, textEditorRef)

function onDraftUpdate(val: string | null) {
  emit('update:draft', val || '')
}

function applyTextFormat(type: string) {
  applyFormat(type)
}
</script>
