<template>
  <v-card v-if="item" variant="outlined" rounded="lg" class="border bg-surface pa-3">
    <!-- Top Header & Back / Actions Bar -->
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 pb-2 mb-3 border-b">
      <div class="d-flex align-center ga-2">
        <v-btn
          size="x-small"
          variant="tonal"
          prepend-icon="mdi-arrow-left"
          @click="backToCollection"
        >
          Back to Grid/List
        </v-btn>
        <span class="text-subtitle-2 font-weight-bold text-high-emphasis">
          {{ item.title || item.name || item.key }}
        </span>
        <v-chip
          size="x-small"
          :color="item.published ? 'success' : 'warning'"
          variant="flat"
        >
          {{ item.published ? 'Published' : 'Draft' }}
        </v-chip>
      </div>

      <div class="d-flex align-center ga-1">
        <v-btn
          size="x-small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-content-save-outline"
          :loading="saving"
          @click="saveChanges"
        >
          Save Metadata
        </v-btn>
        <v-btn
          size="x-small"
          variant="text"
          icon="mdi-dots-vertical"
          title="Resource Actions"
          @click="openMenu($event)"
        />
      </div>
    </div>

    <v-row dense>
      <!-- Image Preview Column -->
      <v-col cols="12" md="5">
        <v-card variant="tonal" rounded="lg" class="pa-2 d-flex flex-column align-center justify-center">
          <v-img
            v-if="item.photoUrl || item.thumbnailUrl"
            :src="item.photoUrl || item.thumbnailUrl"
            max-height="260"
            width="100%"
            contain
            class="rounded"
          />
          <div v-else class="py-12 text-center text-caption text-medium-emphasis">
            <v-icon size="40" class="mb-2 opacity-50">mdi-image-off-outline</v-icon>
            <div>No image file attached</div>
          </div>

          <div class="d-flex align-center justify-space-between w-100 mt-2 px-1 text-caption text-medium-emphasis">
            <span class="text-truncate">{{ item.photo || item.slug || item.key }}</span>
            <v-btn
              size="x-small"
              variant="outlined"
              prepend-icon="mdi-upload"
              @click="triggerReplaceFile"
            >
              Replace Image
            </v-btn>
            <input
              ref="replaceInputRef"
              type="file"
              accept="image/*"
              style="display: none"
              @change="onReplaceFileSelected"
            />
          </div>
        </v-card>
      </v-col>

      <!-- Metadata Editor Column -->
      <v-col cols="12" md="7">
        <div class="d-flex flex-column ga-2">
          <v-text-field
            v-model="editForm.name"
            label="Title / Name"
            density="compact"
            variant="outlined"
            hide-details
          />
          <div class="d-flex ga-2">
            <v-text-field
              v-model="editForm.link"
              label="Slug / Link"
              density="compact"
              variant="outlined"
              hide-details
              class="flex-grow-1"
            />
            <v-text-field
              v-model="editForm.authorKey"
              label="Author Key"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 150px;"
            />
          </div>
          <v-text-field
            v-model="editForm.categoryKeysText"
            label="Categories (comma-separated keys, e.g. ABSTRACT, FLOWERS)"
            density="compact"
            variant="outlined"
            hide-details
          />
          <v-textarea
            v-model="editForm.description"
            label="Description / Notes"
            rows="3"
            density="compact"
            variant="outlined"
            hide-details
          />
          <div class="d-flex align-center justify-space-between pt-1">
            <v-switch
              v-model="editForm.published"
              color="success"
              density="compact"
              hide-details
              label="Published in public gallery"
            />
            <span class="text-caption font-monospace text-medium-emphasis">
              Key: {{ item.key }}
            </span>
          </div>
        </div>
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { useHarnessContext } from '../../context';
import type { HarnessResourceItem } from '../../types';

const props = defineProps<{
  item: HarnessResourceItem | null;
}>();

const harness = useHarnessContext();
const saving = ref(false);
const replaceInputRef = ref<HTMLInputElement | null>(null);

const editForm = reactive({
  name: '',
  link: '',
  authorKey: '',
  categoryKeysText: '',
  description: '',
  published: true,
});

watch(
  () => props.item,
  (val) => {
    if (!val) return;
    editForm.name = val.title || val.name || '';
    editForm.link = val.link || val.slug || '';
    editForm.authorKey = val.authorKey || '';
    const cats = val.categoryKeys || (val.categories || []).map((c) => c.key);
    editForm.categoryKeysText = cats.join(', ');
    editForm.description = val.description || '';
    editForm.published = Boolean(val.published);
  },
  { immediate: true }
);

function backToCollection() {
  if (!harness) return;
  harness.activeResourceDetail.value = null;
  harness.showResourcesSurface();
}

function openMenu(e: MouseEvent) {
  if (props.item && harness) {
    harness.openResourceContextMenu(e, props.item);
  }
}

async function saveChanges() {
  if (!props.item || !harness) return;
  saving.value = true;
  try {
    const categoryKeys = editForm.categoryKeysText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await harness.handleResourceAction('save-metadata', props.item, {
      key: props.item.key,
      name: editForm.name,
      link: editForm.link,
      authorKey: editForm.authorKey,
      categoryKeys,
      description: editForm.description,
      published: editForm.published,
    });
  } finally {
    saving.value = false;
  }
}

function triggerReplaceFile() {
  replaceInputRef.value?.click();
}

async function onReplaceFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length || !props.item || !harness) return;
  const uploaded = await harness.uploadFilesToStorage(input.files, 'photos');
  if (uploaded.length > 0) {
    await harness.handleResourceAction('attach-file', props.item, uploaded[0]);
  }
  input.value = '';
}
</script>

