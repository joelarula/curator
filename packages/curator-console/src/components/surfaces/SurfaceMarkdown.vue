<template>
  <HarnessMarkdown :text="text" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { surfaceText, type CuratorSurface } from '@curator/host/contracts';
import HarnessMarkdown from '../harness/HarnessMarkdown.vue';

const props = defineProps<{ surface: CuratorSurface }>();
const text = computed(() => surfaceText(props.surface));
</script>
