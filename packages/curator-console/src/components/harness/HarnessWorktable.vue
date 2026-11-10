<template>
  <v-card variant="outlined" rounded="lg" class="fill-height d-flex flex-column pa-0 border bg-surface">
    <!-- Scene / Worktable Top & Right Header Bar -->
    <div class="d-flex align-center justify-space-between px-3 py-2 border-b bg-surface-variant flex-wrap ga-2">
      <div class="d-flex align-center ga-2">
        <v-icon size="18" color="primary">mdi-table-furniture</v-icon>
        <span class="text-caption font-weight-bold text-high-emphasis">
          {{ surface?.title || 'SCENE / WORKTABLE' }}
        </span>
        <v-chip v-if="surface?.total !== undefined" size="x-small" color="primary" variant="tonal">
          {{ surface.total }} items
        </v-chip>
      </div>

      <!-- Right-Side Scene Controls -->
      <div class="d-flex align-center ga-1">
        <v-btn
          size="x-small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-folder-multiple-image"
          @click="loadResources"
        >
          App Resources
        </v-btn>
        <v-btn
          v-if="activeDetail"
          size="x-small"
          variant="text"
          prepend-icon="mdi-view-grid-outline"
          @click="closeDetail"
        >
          Collection
        </v-btn>
      </div>
    </div>

    <!-- Worktable Body -->
    <div class="pa-3 flex-grow-1 overflow-y-auto">
      <!-- The shared surface panel (same as the output's UI Surface tab) -->
      <HarnessSurfacePanel>
        <template #empty>
      <!-- 4. Empty Scene Placeholder -->
      <div class="d-flex flex-column align-center justify-center py-12 text-center">
        <v-icon size="44" class="mb-2 opacity-30" color="primary">mdi-view-dashboard-outline</v-icon>
        <div class="text-subtitle-2 text-medium-emphasis">Scene / Worktable Ready</div>
        <div class="text-caption text-disabled mt-1 mb-3">
          Prompt <code>"show app resources"</code> or click below to load the interactive Grid | List explorer.
        </div>
        <v-btn
          size="small"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-view-grid-plus-outline"
          @click="loadResources"
        >
          Show App Resources
        </v-btn>
      </div>
        </template>
      </HarnessSurfacePanel>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useHarnessContext } from '../../context';
import HarnessSurfacePanel from './HarnessSurfacePanel.vue';

const harness = useHarnessContext();

const surface = computed(() => harness?.worktableSurface.value ?? harness?.uiSurface.value ?? null);
const activeDetail = computed(() => harness?.activeResourceDetail.value ?? null);


function loadResources() {
  harness?.showResourcesSurface();
}

function closeDetail() {
  if (harness) {
    harness.activeResourceDetail.value = null;
  }
}
</script>

