<template>
  <div class="surface-mermaid">
    <div v-if="svg" class="overflow-auto" style="max-height: 560px;" v-html="svg" />
    <template v-else>
      <v-alert v-if="error" type="warning" variant="tonal" density="compact" class="mb-2">Diagram error: {{ error }}</v-alert>
      <div v-else-if="unavailable" class="text-caption text-medium-emphasis mb-2">Diagram renderer not available; showing the source.</div>
      <pre class="font-monospace text-caption pa-3 rounded bg-surface-variant overflow-auto">{{ code }}</pre>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { surfaceText, type CuratorSurface } from '@curator/host/contracts';
import { renderMermaid } from '../../composables/richText';

const props = defineProps<{ surface: CuratorSurface }>();
const code = computed(() => surfaceText(props.surface));
const svg = ref<string | null>(null);
const error = ref<string | null>(null);
const unavailable = ref(false);

watch(
  code,
  async (c) => {
    svg.value = null;
    error.value = null;
    // Mermaid in strict mode sanitizes labels and disables scripts/clicks in the SVG
    const out = await renderMermaid(c);
    if (!out) unavailable.value = true;
    else if ('svg' in out) svg.value = out.svg;
    else error.value = out.error;
  },
  { immediate: true }
);
</script>
