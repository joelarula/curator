<template>
  <v-container fluid class="pa-4 pa-md-6" style="max-width: 1240px">
    <div class="d-flex flex-wrap align-center justify-space-between mb-4 ga-3">
      <div class="d-flex align-center ga-2">
        <v-btn
          variant="text"
          color="primary"
          prepend-icon="mdi-arrow-left"
          @click="goBackToGallery"
        >
          Tagasi galeriisse
        </v-btn>
        <v-chip
          v-if="step?.activeCategory"
          size="small"
          color="secondary"
          variant="tonal"
          prepend-icon="mdi-folder-outline"
        >
          Kategooria: {{ step.activeCategory.name || step.activeCategory.key }}
        </v-chip>
        <v-chip
          v-if="step?.activeAuthor"
          size="small"
          color="secondary"
          variant="tonal"
          prepend-icon="mdi-account-outline"
        >
          Autor: {{ step.activeAuthor.name || step.activeAuthor.key }}
        </v-chip>
      </div>

      <!-- Stepping Bar (Previous / Position / Next) -->
      <div v-if="step" class="d-flex align-center ga-2">
        <v-btn
          variant="outlined"
          size="small"
          color="primary"
          prepend-icon="mdi-chevron-left"
          :disabled="!step.hasPrevious || !step.previousItem"
          @click="stepToItem(step.previousItem)"
        >
          Eelmine
        </v-btn>

        <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold px-3">
          {{ step.position }} / {{ step.totalInSequence }}
        </v-chip>

        <v-btn
          variant="outlined"
          size="small"
          color="primary"
          append-icon="mdi-chevron-right"
          :disabled="!step.hasNext || !step.nextItem"
          @click="stepToItem(step.nextItem)"
        >
          Järgmine
        </v-btn>
      </div>
    </div>

    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" size="48" />
    </div>

    <v-card v-else-if="!item" elevation="0" rounded="lg" class="border pa-8 text-center">
      <div class="text-h6 mb-2">Maali ei leitud</div>
      <v-btn color="primary" to="/">Tagasi avalehele</v-btn>
    </v-card>

    <template v-else>
      <v-card elevation="1" rounded="lg" class="border overflow-hidden bg-surface">
        <v-row no-gutters>
          <!-- Full Resolution Artwork Display with Left/Right Overlay Steppers -->
          <v-col
            cols="12"
            md="8"
            class="bg-grey-lighten-4 d-flex align-center justify-center pa-4 position-relative"
            style="min-height: 460px"
          >
            <v-btn
              v-if="step?.previousItem"
              icon="mdi-chevron-left"
              variant="elevated"
              color="surface"
              size="small"
              class="position-absolute"
              style="left: 12px; z-index: 2; opacity: 0.88"
              :title="`Eelmine: ${step.previousItem.name}`"
              @click="stepToItem(step.previousItem)"
            />

            <img
              :src="item.photoUrl || item.thumbnailUrl"
              :alt="item.name"
              style="max-width: 100%; max-height: 76vh; object-fit: contain; border-radius: 6px"
            />

            <v-btn
              v-if="step?.nextItem"
              icon="mdi-chevron-right"
              variant="elevated"
              color="surface"
              size="small"
              class="position-absolute"
              style="right: 12px; z-index: 2; opacity: 0.88"
              :title="`Järgmine: ${step.nextItem.name}`"
              @click="stepToItem(step.nextItem)"
            />
          </v-col>

          <!-- Artwork Metadata & Inquiry Panel -->
          <v-col cols="12" md="4" class="pa-6 d-flex flex-column justify-space-between border-s-md">
            <div>
              <div class="d-flex align-center justify-space-between mb-2">
                <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold">
                  Kood: {{ item.name }}
                </v-chip>
                <v-chip
                  size="x-small"
                  :color="item.published ? 'success' : 'warning'"
                  variant="flat"
                >
                  {{ item.published ? 'Avaldatud' : 'Mustand' }}
                </v-chip>
              </div>

              <h1 class="text-h4 font-weight-bold mb-2">
                {{ item.name }}
              </h1>

              <div class="text-subtitle-1 text-medium-emphasis mb-4">
                Autor: <strong class="text-high-emphasis">{{ item.authorName }}</strong>
              </div>

              <v-divider class="my-4" />

              <div class="text-caption text-uppercase font-weight-bold text-medium-emphasis mb-2">
                Kategooriad
              </div>
              <div class="d-flex flex-wrap ga-2 mb-4">
                <v-chip
                  v-for="cat in item.categories"
                  :key="cat.key"
                  size="small"
                  variant="outlined"
                  color="primary"
                  :to="`/category/${cat.link}`"
                >
                  {{ cat.name }}
                </v-chip>
              </div>

              <div v-if="item.description" class="text-body-2 mb-4">
                {{ item.description }}
              </div>

              <div v-if="item.width && item.height" class="text-caption text-medium-emphasis mb-2">
                Pildi mõõdud: {{ item.width }} × {{ item.height }} px
              </div>

              <div v-if="item.photoSlug" class="text-caption text-medium-emphasis mb-4">
                SEO link: <code>{{ item.photoSlug }}</code>
              </div>
            </div>

            <v-card variant="tonal" color="primary" rounded="lg" class="pa-4 mt-4">
              <div class="text-subtitle-2 font-weight-bold mb-1">
                Soovid seda maali tellida?
              </div>
              <div class="text-caption mb-3">
                Viita tellimisel maali koodile <strong>{{ item.name }}</strong>.
              </div>
              <v-btn
                block
                color="primary"
                variant="flat"
                prepend-icon="mdi-email-outline"
                :href="`mailto:${galleryInfo?.email || 'mailbox@artmoments.ee'}?subject=Maali päring: ${item.name}`"
              >
                Saada päring ({{ galleryInfo?.email || 'mailbox@artmoments.ee' }})
              </v-btn>
            </v-card>
          </v-col>
        </v-row>
      </v-card>

      <!-- Filmstrip / Surrounding Photos Stepper -->
      <v-card
        v-if="step?.surroundingItems && step.surroundingItems.length > 1"
        elevation="0"
        rounded="lg"
        class="border mt-4 pa-3 bg-surface"
      >
        <div class="d-flex align-center justify-space-between mb-2 px-1">
          <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
            Sirvi järjest ({{ step.position }} / {{ step.totalInSequence }})
          </span>
          <span class="text-caption text-medium-emphasis">
            Nooltega ← / → saad liikuda eelmise ja järgmise maali juurde
          </span>
        </div>
        <div class="d-flex align-center ga-2 overflow-x-auto py-1">
          <v-card
            v-for="thumb in step.surroundingItems"
            :key="thumb.key"
            elevation="0"
            rounded="md"
            class="cursor-pointer flex-shrink-0 overflow-hidden"
            :style="{
              width: '84px',
              height: '68px',
              border: thumb.key === item.key ? '2px solid rgb(var(--v-theme-primary))' : '1px solid rgba(0,0,0,0.12)',
              opacity: thumb.key === item.key ? 1 : 0.72,
            }"
            @click="stepToItem(thumb)"
          >
            <img
              :src="thumb.thumbnailUrl || thumb.photoUrl"
              :alt="thumb.name"
              style="width: 100%; height: 100%; object-fit: cover"
            />
          </v-card>
        </div>
      </v-card>
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { requestGraphql } from '../graphql-client';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const step = ref<any>(null);
const item = ref<any>(null);
const galleryInfo = ref<any>(null);

async function loadPhotoStep() {
  loading.value = true;
  try {
    const itemLink = String(route.params.itemLink || '');
    const category = typeof route.query.category === 'string' ? route.query.category : undefined;
    const author = typeof route.query.author === 'string' ? route.query.author : undefined;
    const search = typeof route.query.search === 'string' ? route.query.search : undefined;

    const data = await requestGraphql(
      `query GetPublicGalleryPhoto(
        $slug: String
        $category: String
        $author: String
        $search: String
      ) {
        publicGalleryPhoto(
          slug: $slug
          category: $category
          author: $author
          search: $search
          windowSize: 3
        ) {
          position
          totalInSequence
          hasPrevious
          hasNext
          activeCategory { key name link }
          activeAuthor { key name link }
          item {
            id key name title link photo photoSlug photoUrl thumbnailSlug thumbnailUrl authorKey authorName published description width height
            categories { key name link }
          }
          previousItem {
            id key name title link photoSlug thumbnailUrl photoUrl
          }
          nextItem {
            id key name title link photoSlug thumbnailUrl photoUrl
          }
          surroundingItems {
            id key name title link photoSlug thumbnailUrl photoUrl
          }
        }
        galleryInfo {
          title phone email
        }
      }`,
      {
        slug: itemLink,
        category,
        author,
        search,
      }
    );

    step.value = data.publicGalleryPhoto;
    item.value = data.publicGalleryPhoto?.item || null;
    galleryInfo.value = data.galleryInfo;
  } finally {
    loading.value = false;
  }
}

function stepToItem(target: any) {
  if (!target) return;
  router.push({
    name: 'painting-detail',
    params: { itemLink: target.link || target.photoSlug || target.key },
    query: route.query,
  });
}

function goBackToGallery() {
  if (typeof route.query.category === 'string' && route.query.category) {
    router.push({ name: 'category', params: { categoryLink: route.query.category } });
  } else {
    router.push({ name: 'home' });
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' && step.value?.previousItem) {
    stepToItem(step.value.previousItem);
  } else if (e.key === 'ArrowRight' && step.value?.nextItem) {
    stepToItem(step.value.nextItem);
  }
}

watch(
  () => [route.params.itemLink, route.query.category, route.query.author, route.query.search],
  () => {
    loadPhotoStep();
  }
);

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  loadPhotoStep();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

