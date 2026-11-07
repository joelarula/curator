<template>
  <div>
    <div ref="anchorRef" :style="anchorStyle" />

    <v-menu
      v-model="isVisible"
      :target="anchorRef"
      :close-on-content-click="false"
      location="bottom start"
      transition="scale-transition"
      min-width="240"
      max-width="320"
    >
      <v-card v-if="targetItem" elevation="8" rounded="lg" class="pa-1 border" color="surface">
        <!-- Resource Header -->
        <div class="px-3 py-2 border-b d-flex align-center ga-2 bg-surface-variant rounded-t">
          <v-avatar v-if="targetItem.thumbnailUrl || targetItem.photoUrl" size="28" rounded="sm">
            <v-img :src="targetItem.thumbnailUrl || targetItem.photoUrl" cover />
          </v-avatar>
          <v-icon v-else size="20" color="primary">mdi-image-outline</v-icon>
          <div class="text-truncate flex-grow-1">
            <div class="text-caption font-weight-bold text-high-emphasis text-truncate">
              {{ targetItem.title || targetItem.name || targetItem.key }}
            </div>
            <div class="text-caption text-medium-emphasis font-monospace text-truncate" style="font-size: 0.68rem;">
              {{ targetItem.uri || targetItem.key }}
            </div>
          </div>
          <v-chip
            size="x-small"
            :color="targetItem.published ? 'success' : 'warning'"
            variant="flat"
          >
            {{ targetItem.published ? 'PUB' : 'DRAFT' }}
          </v-chip>
        </div>

        <v-list density="compact" nav class="py-1">
          <v-list-item
            prepend-icon="mdi-eye-outline"
            title="Inspect in Scene / Worktable"
            rounded="md"
            @click="trigger('inspect')"
          />
          <v-list-item
            prepend-icon="mdi-pencil-outline"
            title="Edit Metadata & Categories"
            rounded="md"
            @click="trigger('edit')"
          />
          <v-list-item
            :prepend-icon="targetItem.published ? 'mdi-eye-off-outline' : 'mdi-publish'"
            :title="targetItem.published ? 'Unpublish (Move to Draft)' : 'Publish Resource'"
            rounded="md"
            @click="trigger('toggle-publish')"
          />
          <v-list-item
            prepend-icon="mdi-image-refresh-outline"
            title="Regenerate Thumbnail"
            rounded="md"
            @click="trigger('regenerate-thumbnail')"
          />
          <v-list-item
            prepend-icon="mdi-at"
            title="Insert Reference in OpPrompt"
            rounded="md"
            @click="trigger('reference-prompt')"
          />
          <v-divider class="my-1" />
          <v-list-item
            prepend-icon="mdi-delete-outline"
            title="Delete Resource"
            class="text-error"
            rounded="md"
            @click="trigger('delete')"
          />
        </v-list>
      </v-card>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useHarnessContext } from '../../context';
import type { HarnessResourceItem } from '../../types';

const harness = useHarnessContext();
const anchorRef = ref<HTMLElement | null>(null);

const isVisible = computed({
  get: () => harness?.resourceContextMenuVisible.value ?? false,
  set: (val) => {
    if (harness) harness.resourceContextMenuVisible.value = val;
  },
});

const x = computed(() => harness?.resourceContextMenuX.value ?? 0);
const y = computed(() => harness?.resourceContextMenuY.value ?? 0);
const targetItem = computed<HarnessResourceItem | null>(() => harness?.resourceContextMenuTarget.value ?? null);

const anchorStyle = computed(() => ({
  position: 'fixed' as const,
  left: `${x.value}px`,
  top: `${y.value}px`,
  width: '1px',
  height: '1px',
  pointerEvents: 'none' as const,
  zIndex: 9999,
}));

async function trigger(action: string) {
  const item = targetItem.value;
  isVisible.value = false;
  if (!item || !harness) return;
  await harness.handleResourceAction(action, item);
}
</script>

