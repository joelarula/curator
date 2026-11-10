<template>
  <div class="surface-table">
    <div class="d-flex align-center ga-2 mb-2">
      <v-text-field v-model="search" density="compact" variant="outlined" hide-details placeholder="Filter" prepend-inner-icon="mdi-magnify" style="max-width: 260px;" />
      <span class="text-caption text-medium-emphasis">
        {{ table.rows.length }} rows<template v-if="surface.total && surface.total > table.rows.length"> of {{ surface.total }}</template>
      </span>
    </div>
    <v-data-table-virtual :headers="headers" :items="table.rows" :search="search" height="420" density="compact" fixed-header class="border rounded">
      <template v-for="h in headers" #[`item.${h.key}`]="{ value }" :key="h.key">
        <span class="text-caption">{{ show(value) }}</span>
      </template>
    </v-data-table-virtual>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { surfaceTable, type CuratorSurface } from '@curator/host/contracts';

const props = defineProps<{ surface: CuratorSurface }>();
const search = ref('');
const table = computed(() => surfaceTable(props.surface));
const headers = computed(() => table.value.columns.map((c) => ({ title: c.title, key: c.key, sortable: true })));
const show = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
</script>
