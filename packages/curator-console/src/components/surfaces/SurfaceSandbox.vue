<template>
  <!-- Untrusted model output: sandboxed without allow-same-origin, CSP blocks all network access -->
  <iframe
    class="surface-sandbox w-100 border rounded bg-white"
    sandbox="allow-scripts"
    referrerpolicy="no-referrer"
    :srcdoc="doc"
    :title="surface.title || 'Sandboxed content'"
    style="height: 460px; resize: vertical;"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { surfaceText, type CuratorSurface } from '@curator/host/contracts';
import { sandboxDocument } from '../../composables/richText';

const props = defineProps<{ surface: CuratorSurface }>();
const doc = computed(() => sandboxDocument(surfaceText(props.surface)));
</script>
