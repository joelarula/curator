<template>
  <v-container fluid class="pa-4 pa-md-6" style="max-width: 1440px">
    <!-- Hero / Gallery Info Banner -->
    <v-card elevation="0" rounded="lg" class="border mb-6 pa-5 bg-surface">
      <div class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
        <div class="d-flex align-center ga-4">
          <img
            v-if="galleryInfo?.logoLightUrl"
            :src="galleryInfo.logoLightUrl"
            alt="Gallery Logo"
            style="height: 54px; width: auto"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <div>
            <h1 class="text-h5 font-weight-bold text-primary mb-1">
              {{ galleryInfo?.title || 'ARTMOMENTS' }}
            </h1>
            <div class="text-body-2 text-medium-emphasis">
              {{ galleryInfo?.subtitle || 'Akrüülmaalid lõuendil — dekoratiivmaalide valmistamine ja müük' }}
            </div>
          </div>
        </div>

        <div class="d-flex align-center flex-wrap ga-2">
          <v-btn
            variant="outlined"
            size="small"
            color="primary"
            prepend-icon="mdi-information-outline"
            @click="aboutDialog = true"
          >
            Meist / About
          </v-btn>
          <v-btn
            variant="outlined"
            size="small"
            color="primary"
            prepend-icon="mdi-cart-outline"
            @click="orderingDialog = true"
          >
            Tellimine / Ordering
          </v-btn>
          <v-chip
            v-if="galleryInfo?.phone"
            size="small"
            variant="tonal"
            color="secondary"
            prepend-icon="mdi-phone-outline"
          >
            {{ galleryInfo.phone }}
          </v-chip>
          <v-chip
            v-if="galleryInfo?.email"
            size="small"
            variant="tonal"
            color="secondary"
            prepend-icon="mdi-email-outline"
            :href="`mailto:${galleryInfo.email}`"
          >
            {{ galleryInfo.email }}
          </v-chip>
        </div>
      </div>
    </v-card>

    <!-- Search & Filter Bar -->
    <v-card elevation="0" rounded="lg" class="border mb-5 pa-4 bg-surface">
      <div class="d-flex flex-wrap align-center ga-3">
        <v-text-field
          v-model="searchQuery"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          placeholder="Otsi maali nime, koodi või autori järgi..."
          style="min-width: 260px; max-width: 400px"
          @keyup.enter="loadItems"
          @click:clear="searchQuery = ''; loadItems()"
        />

        <!-- Author Selector -->
        <v-select
          v-model="selectedAuthorKey"
          :items="authorOptions"
          item-title="label"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          label="Autor"
          style="min-width: 200px; max-width: 240px"
          @update:model-value="onAuthorChange"
        />

        <v-spacer />

        <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold">
          {{ totalItems }} maali
        </v-chip>

        <v-btn-toggle v-model="viewMode" mandatory density="compact" color="primary" variant="outlined">
          <v-btn value="grid" size="small" icon="mdi-view-grid-outline" title="Grid View" />
          <v-btn value="list" size="small" icon="mdi-format-list-bulleted" title="List View" />
        </v-btn-toggle>
      </div>

      <!-- Category Chips Navigation -->
      <div class="d-flex flex-wrap ga-2 mt-4">
        <v-chip
          :color="!selectedCategoryLink ? 'primary' : undefined"
          :variant="!selectedCategoryLink ? 'flat' : 'outlined'"
          size="small"
          class="cursor-pointer font-weight-medium"
          @click="selectCategory('')"
        >
          Kõik kategooriad
        </v-chip>
        <v-chip
          v-for="cat in categories"
          :key="cat.key"
          :color="selectedCategoryLink === cat.link || selectedCategoryLink === cat.key ? 'primary' : undefined"
          :variant="selectedCategoryLink === cat.link || selectedCategoryLink === cat.key ? 'flat' : 'outlined'"
          size="small"
          class="cursor-pointer font-weight-medium"
          @click="selectCategory(cat.link)"
        >
          {{ cat.name }}
          <span class="ms-1 text-caption opacity-70">({{ cat.paintingCount }})</span>
        </v-chip>
      </div>
    </v-card>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" size="48" />
    </div>

    <!-- Empty State -->
    <v-card
      v-else-if="items.length === 0"
      elevation="0"
      rounded="lg"
      class="border pa-10 text-center bg-surface"
    >
      <v-icon size="56" color="medium-emphasis" class="mb-3">mdi-image-Search-outline</v-icon>
      <div class="text-h6 mb-1">Maale ei leitud</div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        Proovi muuta otsingusõna või vali teine kategooria.
      </div>
      <v-btn color="primary" variant="tonal" @click="resetFilters">
        Näita kõiki maale
      </v-btn>
    </v-card>

    <!-- GRID VIEW -->
    <v-row v-else-if="viewMode === 'grid'" dense>
      <v-col
        v-for="item in items"
        :key="item.key"
        cols="12"
        sm="6"
        md="4"
        lg="3"
        xl="2"
      >
        <v-card
          elevation="1"
          rounded="lg"
          class="border h-100 d-flex flex-column gallery-masonry-card cursor-pointer"
          @click="goToPainting(item)"
        >
          <div
            class="bg-grey-lighten-4 d-flex align-center justify-center overflow-hidden"
            style="height: 220px"
          >
            <img
              v-if="item.thumbnailUrl || item.photoUrl"
              :src="item.thumbnailUrl || item.photoUrl"
              :alt="item.name"
              loading="lazy"
              style="width: 100%; height: 100%; object-fit: cover"
            />
            <v-icon v-else size="48" color="grey">mdi-image-outline</v-icon>
          </div>

          <v-card-text class="pa-3 flex-grow-1 d-flex flex-column justify-space-between">
            <div>
              <div class="text-subtitle-2 font-weight-bold text-truncate">
                {{ item.name }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ item.authorName }}
              </div>
            </div>

            <div class="d-flex flex-wrap ga-1 mt-2">
              <v-chip
                v-for="cat in (item.categories || []).slice(0, 2)"
                :key="cat.key"
                size="x-small"
                variant="tonal"
                color="secondary"
              >
                {{ cat.name }}
              </v-chip>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- LIST VIEW -->
    <v-card v-else elevation="1" rounded="lg" class="border overflow-hidden">
      <v-table density="comfortable" hover>
        <thead>
          <tr>
            <th style="width: 80px">Pilt</th>
            <th>Nimi / Kood</th>
            <th>Autor</th>
            <th>Kategooriad</th>
            <th class="text-right">Tegevus</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.key"
            class="cursor-pointer"
            @click="goToPainting(item)"
          >
            <td class="py-2">
              <v-avatar rounded="md" size="56" color="grey-lighten-4">
                <v-img
                  v-if="item.thumbnailUrl || item.photoUrl"
                  :src="item.thumbnailUrl || item.photoUrl"
                  :alt="item.name"
                  cover
                />
              </v-avatar>
            </td>
            <td class="font-weight-bold">{{ item.name }}</td>
            <td>{{ item.authorName }}</td>
            <td>
              <div class="d-flex flex-wrap ga-1">
                <v-chip
                  v-for="cat in item.categories"
                  :key="cat.key"
                  size="x-small"
                  variant="tonal"
                  color="secondary"
                >
                  {{ cat.name }}
                </v-chip>
              </div>
            </td>
            <td class="text-right">
              <v-btn size="small" variant="text" color="primary" append-icon="mdi-arrow-right">
                Vaata
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- About Modal -->
    <v-dialog v-model="aboutDialog" max-width="680">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center justify-space-between border-b px-5 py-3">
          <span class="text-subtitle-1 font-weight-bold">Meist — {{ galleryInfo?.title || 'Artmoments' }}</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="aboutDialog = false" />
        </v-card-title>
        <v-card-text class="pa-5">
          <div style="white-space: pre-line" class="text-body-1">
            {{ galleryInfo?.aboutMarkdown }}
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Ordering Modal -->
    <v-dialog v-model="orderingDialog" max-width="680">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center justify-space-between border-b px-5 py-3">
          <span class="text-subtitle-1 font-weight-bold">Tellimine — {{ galleryInfo?.title || 'Artmoments' }}</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="orderingDialog = false" />
        </v-card-title>
        <v-card-text class="pa-5">
          <div style="white-space: pre-line" class="text-body-1 mb-4">
            {{ galleryInfo?.orderingMarkdown }}
          </div>
          <v-alert type="info" variant="tonal" density="compact">
            Kontakt: <strong>{{ galleryInfo?.phone }}</strong> | E-post: <strong>{{ galleryInfo?.email }}</strong>
          </v-alert>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { requestGraphql } from '../graphql-client';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const viewMode = ref<'grid' | 'list'>('grid');
const searchQuery = ref('');
const selectedCategoryLink = ref('');
const selectedAuthorKey = ref('');

const galleryInfo = ref<any>(null);
const categories = ref<any[]>([]);
const authors = ref<any[]>([]);
const items = ref<any[]>([]);
const totalItems = ref(0);

const aboutDialog = ref(false);
const orderingDialog = ref(false);

const authorOptions = computed(() => [
  { label: 'Kõik autorid', value: '' },
  ...authors.value.map((a: any) => ({
    label: `${a.name} (${a.paintingCount})`,
    value: a.key,
  })),
]);

async function loadMeta() {
  const data = await requestGraphql(`
    query GetGalleryBootstrap {
      galleryInfo {
        projectId title subtitle aboutMarkdown orderingMarkdown phone email logoLightUrl logoDarkUrl
      }
      galleryCategories(includeUnpublished: false) {
        key name nameEn link published paintingCount
      }
      galleryAuthors {
        key name link paintingCount
      }
    }
  `);
  galleryInfo.value = data.galleryInfo;
  categories.value = data.galleryCategories || [];
  authors.value = data.galleryAuthors || [];
}

async function loadItems() {
  loading.value = true;
  try {
    const vars = {
      search: searchQuery.value.trim() || undefined,
      categoryLink: selectedCategoryLink.value || undefined,
      authorKey: selectedAuthorKey.value || undefined,
      publishedOnly: true,
      limit: 300,
      offset: 0,
    };

    const data = await requestGraphql(
      `query SearchGallery(
        $search: String
        $categoryLink: String
        $authorKey: String
        $publishedOnly: Boolean
        $limit: Int
        $offset: Int
      ) {
        galleryItems(
          search: $search
          categoryLink: $categoryLink
          authorKey: $authorKey
          publishedOnly: $publishedOnly
          limit: $limit
          offset: $offset
        ) {
          id key name title link photo photoUrl thumbnailUrl authorKey authorName published
          categories { key name link }
        }
        galleryItemsCount(
          search: $search
          categoryLink: $categoryLink
          authorKey: $authorKey
          publishedOnly: $publishedOnly
        )
      }`,
      vars
    );

    items.value = data.galleryItems || [];
    totalItems.value = data.galleryItemsCount ?? items.value.length;
  } finally {
    loading.value = false;
  }
}

function selectCategory(catLink: string) {
  selectedCategoryLink.value = catLink;
  if (catLink) {
    router.push({ name: 'category', params: { categoryLink: catLink } });
  } else {
    router.push({ name: 'home' });
  }
}

function onAuthorChange(authorKey: string) {
  selectedAuthorKey.value = authorKey;
  loadItems();
}

function resetFilters() {
  searchQuery.value = '';
  selectedCategoryLink.value = '';
  selectedAuthorKey.value = '';
  router.push({ name: 'home' });
  loadItems();
}

function goToPainting(item: any) {
  router.push({
    name: 'painting-detail',
    params: { itemLink: item.link || item.key },
  });
}

watch(
  () => route.params,
  (params) => {
    if (typeof params.categoryLink === 'string') {
      selectedCategoryLink.value = params.categoryLink;
    } else if (route.name === 'home') {
      selectedCategoryLink.value = '';
    }
    if (typeof params.authorKey === 'string') {
      selectedAuthorKey.value = params.authorKey;
    }
    loadItems();
  }
);

onMounted(async () => {
  if (typeof route.params.categoryLink === 'string') {
    selectedCategoryLink.value = route.params.categoryLink;
  }
  if (typeof route.params.authorKey === 'string') {
    selectedAuthorKey.value = route.params.authorKey;
  }
  await Promise.all([loadMeta(), loadItems()]);
});
</script>

