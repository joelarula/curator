<template>
  <v-container fluid class="pa-4 pa-md-6" style="max-width: 1240px">
    <div class="mb-4">
      <v-btn
        variant="text"
        color="primary"
        prepend-icon="mdi-arrow-left"
        @click="router.back()"
      >
        Tagasi galeriisse
      </v-btn>
    </div>

    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" size="48" />
    </div>

    <v-card v-else-if="!item" elevation="0" rounded="lg" class="border pa-8 text-center">
      <div class="text-h6 mb-2">Maali ei leitud</div>
      <v-btn color="primary" to="/">Tagasi avalehele</v-btn>
    </v-card>

    <v-card v-else elevation="1" rounded="lg" class="border overflow-hidden bg-surface">
      <v-row no-gutters>
        <!-- Full Resolution Artwork Display -->
        <v-col cols="12" md="8" class="bg-grey-lighten-4 d-flex align-center justify-center pa-4" style="min-height: 460px">
          <img
            :src="item.photoUrl || item.thumbnailUrl"
            :alt="item.name"
            style="max-width: 100%; max-height: 76vh; object-fit: contain; border-radius: 6px"
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

            <div v-if="item.width && item.height" class="text-caption text-medium-emphasis mb-4">
              Pildi mõõdud: {{ item.width }} × {{ item.height }} px
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
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { requestGraphql } from '../graphql-client';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const item = ref<any>(null);
const galleryInfo = ref<any>(null);

onMounted(async () => {
  loading.value = true;
  try {
    const itemLink = String(route.params.itemLink || '');
    const data = await requestGraphql(
      `query GetPaintingDetail($link: String!) {
        galleryItem(link: $link) {
          id key name title link photo photoUrl thumbnailUrl authorKey authorName published description width height
          categories { key name link }
        }
        galleryInfo {
          title phone email
        }
      }`,
      { link: itemLink }
    );
    item.value = data.galleryItem;
    galleryInfo.value = data.galleryInfo;
  } finally {
    loading.value = false;
  }
});
</script>

