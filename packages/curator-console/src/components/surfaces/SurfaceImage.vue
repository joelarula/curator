<template>
  <div class="surface-image text-center">
    <img v-if="allowed" :src="src" :alt="alt" style="max-width: 100%; max-height: 560px;" />
    <div v-else class="text-caption text-medium-emphasis">
      Image not shown: only data URLs and images from this site are loaded.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CuratorSurface } from '@curator/host/contracts';
import { isAllowedImageSource } from '../../composables/richText';

const props = defineProps<{ surface: CuratorSurface }>();
const src = computed(() => {
  const d: any = props.surface.data;
  return typeof d === 'string' ? d : d?.src;
});
const alt = computed(() => String((props.surface.data as any)?.alt ?? props.surface.title ?? ''));
const allowed = computed(() => isAllowedImageSource(src.value));
</script>
