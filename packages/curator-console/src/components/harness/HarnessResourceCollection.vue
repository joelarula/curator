<template>
  <div
    class="harness-resource-collection"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="onDropFiles"
  >
    <!-- Top & Right Toolbar -->
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3 pb-2 border-b">
      <!-- Left: Search & Filters -->
      <div class="d-flex align-center flex-wrap ga-2 flex-grow-1">
        <v-text-field
          v-model="searchQuery"
          density="compact"
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
          placeholder="Filter resources by title, key, author..."
          hide-details
          clearable
          style="min-width: 200px; max-width: 280px;"
          @keydown.enter="applyFilters"
          @click:clear="applyFilters"
        />

        <v-select
          v-if="categoryItems.length > 1"
          v-model="categoryFilter"
          :items="categoryItems"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 180px;"
          @update:model-value="applyFilters"
        />

        <v-select
          v-if="authorItems.length > 1"
          v-model="authorFilter"
          :items="authorItems"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 170px;"
          @update:model-value="applyFilters"
        />

        <v-btn-toggle
          v-model="publishedFilter"
          mandatory
          density="compact"
          variant="outlined"
          color="primary"
          @update:model-value="applyFilters"
        >
          <v-btn value="all" size="x-small">All ({{ totalCount }})</v-btn>
          <v-btn value="published" size="x-small">Published</v-btn>
          <v-btn value="draft" size="x-small">Drafts</v-btn>
        </v-btn-toggle>
      </div>

      <!-- Right: Upload Action, Refresh & Grid | List View Switcher -->
      <div class="d-flex align-center ga-2">
        <v-btn
          size="small"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-cloud-upload-outline"
          :loading="isUploading"
          @click="triggerUploadInput"
        >
          Upload Media
        </v-btn>
        <input
          ref="uploadInputRef"
          type="file"
          multiple
          accept="image/*"
          style="display: none"
          @change="onUploadSelected"
        />

        <v-btn
          size="small"
          variant="text"
          icon="mdi-refresh"
          title="Refresh Resources"
          @click="applyFilters"
        />

        <v-btn-toggle
          v-model="viewMode"
          mandatory
          density="compact"
          color="primary"
          variant="outlined"
        >
          <v-btn value="grid" size="small" title="Grid View">
            <v-icon size="18">mdi-view-grid-outline</v-icon>
            <span class="ms-1 d-none d-sm-inline text-caption">Grid</span>
          </v-btn>
          <v-btn value="list" size="small" title="List View">
            <v-icon size="18">mdi-format-list-bulleted</v-icon>
            <span class="ms-1 d-none d-sm-inline text-caption">List</span>
          </v-btn>
        </v-btn-toggle>
      </div>
    </div>

    <!-- Dropzone Banner when Dragging Files -->
    <v-alert
      v-if="isDragging"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-3 text-center"
    >
      Drop image files here to upload to VM storage and ingest into Gallery
    </v-alert>

    <!-- Bulk Selection Bar -->
    <div
      v-if="selectedKeys.length > 0"
      class="d-flex align-center justify-space-between px-3 py-2 mb-3 rounded bg-surface-variant border"
    >
      <div class="d-flex align-center ga-2">
        <v-chip size="small" color="primary" variant="flat" class="font-weight-bold">
          {{ selectedKeys.length }} selected
        </v-chip>
        <v-btn size="x-small" variant="text" @click="selectedKeys = []">Clear</v-btn>
      </div>
      <div class="d-flex align-center ga-2">
        <v-btn
          size="x-small"
          color="success"
          variant="tonal"
          prepend-icon="mdi-publish"
          @click="runBulk('publish')"
        >
          Publish Selected
        </v-btn>
        <v-btn
          size="x-small"
          color="warning"
          variant="tonal"
          prepend-icon="mdi-eye-off-outline"
          @click="runBulk('unpublish')"
        >
          Unpublish
        </v-btn>
        <v-btn
          size="x-small"
          color="error"
          variant="tonal"
          prepend-icon="mdi-delete-outline"
          @click="runBulk('delete')"
        >
          Delete
        </v-btn>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="filteredItems.length === 0" class="text-center py-8 text-medium-emphasis">
      <v-icon size="40" class="mb-2 opacity-40">mdi-image-multiple-outline</v-icon>
      <div class="text-body-2">No resources match the current filter.</div>
      <div class="text-caption mt-1">
        Drag and drop images here or click "Upload Media" to add items.
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- 1. GRID VIEW                                                        -->
    <!-- =================================================================== -->
    <v-row v-else-if="viewMode === 'grid'" dense>
      <v-col
        v-for="item in filteredItems"
        :key="item.key"
        cols="6"
        sm="4"
        md="3"
        lg="2"
      >
        <v-card
          variant="outlined"
          rounded="lg"
          hover
          class="resource-grid-card fill-height d-flex flex-column border position-relative"
          :class="{ 'border-primary': selectedKeys.includes(item.key) }"
          @click="inspectItem(item)"
          @contextmenu.prevent="openItemMenu($event, item)"
        >
          <!-- Thumbnail Area -->
          <div class="position-relative bg-surface-variant" style="height: 135px; overflow: hidden;">
            <v-img
              v-if="item.thumbnailUrl || item.photoUrl"
              :src="item.thumbnailUrl || item.photoUrl"
              height="135"
              cover
            />
            <div v-else class="d-flex align-center justify-center fill-height">
              <v-icon size="32" class="opacity-40">mdi-image-outline</v-icon>
            </div>

            <!-- Top-Left Selection Checkbox -->
            <div
              class="position-absolute"
              style="top: 4px; left: 4px; z-index: 2;"
              @click.stop
            >
              <v-checkbox-btn
                :model-value="selectedKeys.includes(item.key)"
                density="compact"
                color="primary"
                @update:model-value="toggleSelect(item.key)"
              />
            </div>

            <!-- Top-Right Status Badge & Contextual Menu Trigger Close by Resource -->
            <div
              class="position-absolute d-flex align-center ga-1"
              style="top: 6px; right: 6px; z-index: 2;"
              @click.stop
            >
              <v-chip
                size="x-small"
                :color="item.published ? 'success' : 'warning'"
                variant="flat"
                class="font-weight-bold px-1"
              >
                {{ item.published ? 'PUB' : 'DRAFT' }}
              </v-chip>
              <v-btn
                size="x-small"
                variant="flat"
                color="surface"
                icon="mdi-dots-vertical"
                density="comfortable"
                title="Resource Contextual Menu"
                @click.stop="openItemMenu($event, item)"
              />
            </div>
          </div>

          <!-- Card Details -->
          <div class="pa-2 d-flex flex-column flex-grow-1 justify-space-between">
            <div>
              <div class="text-caption font-weight-bold text-high-emphasis text-truncate" :title="item.title || item.name">
                {{ item.title || item.name || item.key }}
              </div>
              <div class="text-caption text-medium-emphasis text-truncate" style="font-size: 0.72rem;">
                {{ item.authorName || item.authorKey || '—' }}
              </div>
            </div>

            <div v-if="item.categories?.length || item.categoryKeys?.length" class="d-flex flex-wrap ga-1 mt-1">
              <v-chip
                v-for="cat in (item.categories || (item.categoryKeys || []).map((k) => ({ key: k, name: k }))).slice(0, 2)"
                :key="cat.key"
                size="x-small"
                variant="tonal"
                color="primary"
                style="font-size: 0.65rem; height: 18px;"
              >
                {{ cat.name || cat.key }}
              </v-chip>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- =================================================================== -->
    <!-- 2. LIST VIEW                                                        -->
    <!-- =================================================================== -->
    <v-table v-else density="compact" hover class="border rounded-lg bg-surface">
      <thead>
        <tr>
          <th style="width: 36px;">
            <v-checkbox-btn
              :model-value="allSelected"
              density="compact"
              @update:model-value="toggleSelectAll"
            />
          </th>
          <th style="width: 52px;">Media</th>
          <th>Title / Slug</th>
          <th>Author</th>
          <th>Categories</th>
          <th style="width: 90px;">Status</th>
          <th class="text-right" style="width: 90px;">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in filteredItems"
          :key="item.key"
          class="cursor-pointer"
          @click="inspectItem(item)"
          @contextmenu.prevent="openItemMenu($event, item)"
        >
          <td @click.stop>
            <v-checkbox-btn
              :model-value="selectedKeys.includes(item.key)"
              density="compact"
              color="primary"
              @update:model-value="toggleSelect(item.key)"
            />
          </td>
          <td>
            <v-avatar size="36" rounded="sm" class="my-1 bg-surface-variant">
              <v-img
                v-if="item.thumbnailUrl || item.photoUrl"
                :src="item.thumbnailUrl || item.photoUrl"
                cover
              />
              <v-icon v-else size="18">mdi-image-outline</v-icon>
            </v-avatar>
          </td>
          <td>
            <div class="text-body-2 font-weight-medium text-high-emphasis">
              {{ item.title || item.name || item.key }}
            </div>
            <div class="text-caption font-monospace text-medium-emphasis">
              {{ item.link || item.slug || item.key }}
            </div>
          </td>
          <td class="text-caption">
            {{ item.authorName || item.authorKey || '—' }}
          </td>
          <td>
            <div class="d-flex flex-wrap ga-1">
              <v-chip
                v-for="cat in (item.categories || (item.categoryKeys || []).map((k) => ({ key: k, name: k })))"
                :key="cat.key"
                size="x-small"
                variant="tonal"
                color="primary"
              >
                {{ cat.name || cat.key }}
              </v-chip>
            </div>
          </td>
          <td @click.stop>
            <v-chip
              size="x-small"
              :color="item.published ? 'success' : 'warning'"
              variant="flat"
              class="font-weight-bold cursor-pointer"
              @click="togglePublishQuick(item)"
            >
              {{ item.published ? 'Published' : 'Draft' }}
            </v-chip>
          </td>
          <td class="text-right" @click.stop>
            <v-btn
              size="x-small"
              variant="text"
              icon="mdi-pencil-outline"
              title="Edit Resource"
              @click="inspectItem(item)"
            />
            <v-btn
              size="x-small"
              variant="text"
              icon="mdi-dots-vertical"
              title="Contextual Menu"
              @click="openItemMenu($event, item)"
            />
          </td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useHarnessContext } from '../../context';
import type { HarnessResourceItem, HarnessUiSurface } from '../../types';

const props = defineProps<{
  surface?: HarnessUiSurface | null;
}>();

const harness = useHarnessContext();
const isDragging = ref(false);
const uploadInputRef = ref<HTMLInputElement | null>(null);

const activeSurface = computed(() => props.surface ?? harness?.uiSurface.value ?? null);
const items = computed<HarnessResourceItem[]>(() => activeSurface.value?.items || []);
const totalCount = computed(() => activeSurface.value?.total ?? items.value.length);

const viewMode = computed({
  get: () => harness?.resourceViewMode.value ?? activeSurface.value?.viewMode ?? 'grid',
  set: (val) => {
    if (harness) harness.resourceViewMode.value = val;
  },
});

const searchQuery = computed({
  get: () => harness?.resourceSearchQuery.value ?? '',
  set: (val) => {
    if (harness) harness.resourceSearchQuery.value = val || '';
  },
});

const categoryFilter = computed({
  get: () => harness?.resourceCategoryFilter.value ?? '',
  set: (val) => {
    if (harness) harness.resourceCategoryFilter.value = val || '';
  },
});

const authorFilter = computed({
  get: () => harness?.resourceAuthorFilter.value ?? '',
  set: (val) => {
    if (harness) harness.resourceAuthorFilter.value = val || '';
  },
});

const publishedFilter = computed({
  get: () => harness?.resourcePublishedFilter.value ?? 'all',
  set: (val) => {
    if (harness) harness.resourcePublishedFilter.value = val;
  },
});

const selectedKeys = computed({
  get: () => harness?.selectedResourceKeys.value ?? [],
  set: (val) => {
    if (harness) harness.selectedResourceKeys.value = val;
  },
});

const isUploading = computed(() => harness?.uploadingFiles.value ?? false);

const categoryItems = computed(() => {
  const cats = activeSurface.value?.categories || [];
  return [
    { title: 'All Categories', value: '' },
    ...cats.map((c: any) => ({
      title: `${c.name}${c.paintingCount !== undefined ? ` (${c.paintingCount})` : ''}`,
      value: c.key,
    })),
  ];
});

const authorItems = computed(() => {
  const authors = activeSurface.value?.authors || [];
  return [
    { title: 'All Authors', value: '' },
    ...authors.map((a: any) => ({
      title: `${a.name}${a.paintingCount !== undefined ? ` (${a.paintingCount})` : ''}`,
      value: a.key,
    })),
  ];
});

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  const auth = authorFilter.value;
  const pub = publishedFilter.value;

  return items.value.filter((item) => {
    if (pub === 'published' && !item.published) return false;
    if (pub === 'draft' && item.published) return false;
    if (auth && item.authorKey !== auth) return false;
    if (cat) {
      const itemCats = item.categoryKeys || (item.categories || []).map((c) => c.key);
      if (!itemCats.includes(cat)) return false;
    }
    if (q) {
      const hay = `${item.title || ''} ${item.name || ''} ${item.key || ''} ${item.link || ''} ${item.authorName || ''} ${item.authorKey || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

const allSelected = computed(() => {
  return (
    filteredItems.value.length > 0 &&
    filteredItems.value.every((i) => selectedKeys.value.includes(i.key))
  );
});

function toggleSelect(key: string) {
  const list = [...selectedKeys.value];
  const idx = list.indexOf(key);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(key);
  selectedKeys.value = list;
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedKeys.value = [];
  } else {
    selectedKeys.value = filteredItems.value.map((i) => i.key);
  }
}

function applyFilters() {
  harness?.showResourcesSurface({
    search: searchQuery.value,
    categoryKey: categoryFilter.value || undefined,
    authorKey: authorFilter.value || undefined,
    publishedOnly: publishedFilter.value === 'published' ? true : undefined,
  });
}

function inspectItem(item: HarnessResourceItem) {
  harness?.openResourceDetail(item);
}

function openItemMenu(e: MouseEvent, item: HarnessResourceItem) {
  harness?.openResourceContextMenu(e, item);
}

async function togglePublishQuick(item: HarnessResourceItem) {
  await harness?.handleResourceAction('toggle-publish', item);
}

async function runBulk(action: string) {
  if (!harness || selectedKeys.value.length === 0) return;
  await harness.handleBulkResourceAction(action, [...selectedKeys.value]);
  selectedKeys.value = [];
}

function triggerUploadInput() {
  uploadInputRef.value?.click();
}

async function onUploadSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length || !harness) return;
  await harness.uploadFilesToStorage(input.files, 'photos');
  input.value = '';
}

async function onDropFiles(e: DragEvent) {
  isDragging.value = false;
  if (!e.dataTransfer?.files?.length || !harness) return;
  await harness.uploadFilesToStorage(e.dataTransfer.files, 'photos');
}
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
.resource-grid-card {
  transition: transform 0.14s ease, border-color 0.14s ease;
}
.resource-grid-card:hover {
  transform: translateY(-2px);
}
</style>

