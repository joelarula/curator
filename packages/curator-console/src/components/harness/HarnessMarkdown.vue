<template>
  <div class="harness-markdown">
    <!-- Sanitized HTML (raw HTML in the text is dropped); plain text until or unless the renderer loads -->
    <div v-if="html !== null" class="harness-markdown-body text-body-2" v-html="html" />
    <pre v-else class="font-monospace text-caption pa-3 rounded bg-surface-variant overflow-auto text-wrap">{{ text }}</pre>

    <div v-if="panelBlocks && blocks.length > 0" class="d-flex flex-wrap ga-1 mt-2">
      <v-chip
        v-for="(b, i) in blocks"
        :key="i"
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-dock-right"
        class="cursor-pointer"
        @click="emit('open', b.surface)"
      >
        {{ b.label }}
      </v-chip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { textPanelBlocks, type CuratorSurface } from '@curator/host/contracts';
import { renderMarkdown } from '../../composables/richText';

const props = withDefaults(defineProps<{ text: string; panelBlocks?: boolean }>(), { panelBlocks: false });
const emit = defineEmits<{ (e: 'open', surface: CuratorSurface): void }>();

const html = ref<string | null>(null);
const blocks = computed(() => textPanelBlocks(props.text || ''));

let renderSeq = 0;
watch(
  () => props.text,
  async (text) => {
    const mine = ++renderSeq;
    const out = await renderMarkdown(text || '');
    if (mine === renderSeq) html.value = out;
  },
  { immediate: true }
);
</script>

<style scoped>
.harness-markdown-body :deep(p) { margin: 0 0 0.6em; }
.harness-markdown-body :deep(pre) { background: rgba(var(--v-theme-on-surface), 0.06); padding: 8px; border-radius: 6px; overflow: auto; }
.harness-markdown-body :deep(code) { font-family: monospace; font-size: 0.9em; }
.harness-markdown-body :deep(table) { border-collapse: collapse; margin: 0.5em 0; }
.harness-markdown-body :deep(th),
.harness-markdown-body :deep(td) { border: 1px solid rgba(var(--v-theme-on-surface), 0.15); padding: 2px 8px; }
.harness-markdown-body :deep(ul),
.harness-markdown-body :deep(ol) { padding-left: 1.4em; margin: 0 0 0.6em; }
</style>
