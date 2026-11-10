<template>
  <div class="surface-code">
    <div class="d-flex align-center ga-2 mb-1">
      <v-chip size="x-small" variant="outlined">{{ language }}</v-chip>
      <v-btn size="x-small" variant="text" icon="mdi-content-copy" title="Copy" class="ms-auto" @click="copy" />
    </div>
    <pre class="font-monospace text-caption pa-3 rounded bg-surface-variant overflow-auto" style="max-height: 520px;">{{ text }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { surfaceText, type CuratorSurface } from '@curator/host/contracts';

const props = defineProps<{ surface: CuratorSurface }>();
const language = computed(() => (props.surface.component === 'json' ? 'json' : String((props.surface.data as any)?.language ?? 'text')));
const text = computed(() =>
  props.surface.component === 'json' || (props.surface.component !== 'code' && typeof props.surface.data !== 'string')
    ? JSON.stringify(props.surface.data ?? props.surface, null, 2)
    : surfaceText(props.surface)
);
function copy() {
  navigator.clipboard?.writeText(text.value).catch(() => {});
}
</script>
