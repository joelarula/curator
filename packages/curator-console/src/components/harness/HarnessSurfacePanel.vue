<template>
  <div class="harness-surface-panel d-flex flex-column">
    <!-- Surfaces of this session: pick an earlier one, or close the panel -->
    <div v-if="entries.length > 0" class="d-flex align-center ga-2 mb-2">
      <v-select
        :model-value="activeId"
        :items="entryItems"
        item-title="title"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        placeholder="Open a result"
        prepend-inner-icon="mdi-dock-right"
        class="flex-grow-1"
        @update:model-value="(id) => id && surfaces?.open(id)"
      />
      <v-btn v-if="surface" size="small" variant="text" icon="mdi-close" title="Close" @click="surfaces?.close()" />
    </div>

    <div class="flex-grow-1">
      <HarnessResourceDetail v-if="activeDetail || surface?.component === 'resource-detail'" :item="activeDetail || surface?.item || null" />
      <component :is="renderer" v-else-if="surface && renderer" :surface="surface" v-bind="surface.props || {}" />
      <HarnessResourceCollection v-else-if="surface && surface.component === 'resource-collection'" :surface="surface" />
      <!-- Unknown component without a registered renderer: show its data -->
      <component :is="builtinSurfaceComponents.json" v-else-if="surface" :surface="{ component: 'json', title: surface.title, data: surface }" />
      <slot v-else name="empty">
        <div class="text-center text-caption text-medium-emphasis py-8">No result open.</div>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { describeSurface } from '@curator/host/contracts';
import { useHarnessContext } from '../../context';
import { builtinSurfaceComponents } from '../surfaces';
import HarnessResourceCollection from './HarnessResourceCollection.vue';
import HarnessResourceDetail from './HarnessResourceDetail.vue';

/** The one surface panel: used by the 2-column worktable and by the output's UI Surface tab. */
const harness = useHarnessContext();
const surfaces = harness?.surfaces ?? null;

const entries = computed(() => surfaces?.entries.value ?? []);
const activeId = computed(() => surfaces?.activeId.value ?? null);
const surface = computed(() => surfaces?.active.value ?? harness?.uiSurface.value ?? null);
const activeDetail = computed(() => harness?.activeResourceDetail.value ?? null);
const entryItems = computed(() =>
  entries.value.map((e) => ({ value: e.id, title: `${describeSurface(e.surface as any)}${e.requestId ? ` · #${e.requestId}` : ''}` }))
);

/** Client-registered component first (a miniapp can override built-ins), then the built-in renderer. */
const renderer = computed(() => {
  const name = surface.value?.component;
  if (!name) return null;
  return harness?.customComponents?.[name] ?? builtinSurfaceComponents[name] ?? null;
});
</script>
