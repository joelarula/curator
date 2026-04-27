<script setup lang="ts">
/**
 * FeedsPage.vue  (/feeds)
 *
 * Feed management dashboard — the control panel for automated RSS/Atom ingestion.
 *
 * Displays all registered feeds as cards. Each card shows the feed name, URL,
 * polling interval, and last-polled timestamp.
 *
 * Actions:
 *   - Add Feed      — opens an inline dialog to register a new RSS/Atom URL with
 *                     a name and polling period (slider, 15min – 24h).
 *   - Poll Now      — manually triggers `pollFeed` for a single feed.
 *   - Poll All      — calls `pollAllFeeds` to check every active enabled feed.
 *   - Delete Feed   — soft-deletes the feed (sets existent: false).
 *
 * Note: This page does NOT show per-feed settings (AI prompt, default tags, enabled
 * toggle). Those are managed on the SourceReviewPage or via direct feed editing.
 */
import { ref, onMounted } from 'vue'
import { graphql } from '../composables/useGraphql'

const feeds = ref<any[]>([])
const loading = ref(false)
const showCreateDialog = ref(false)

const newFeed = ref({
  name: '',
  url: '',
  pollingPeriod: 60
})

async function fetchFeeds() {
  loading.value = true
  const data = await graphql(`
    query {
      feeds {
        id
        name
        url
        pollingPeriod
        lastPolledAt
      }
    }
  `)
  if (data?.feeds) feeds.value = data.feeds
  loading.value = false
}

async function createFeed() {
  if (!newFeed.value.name || !newFeed.value.url) return
  
  loading.value = true
  const data = await graphql(`
    mutation($name: String!, $url: String!, $pollingPeriod: Int) {
      createFeed(name: $name, url: $url, pollingPeriod: $pollingPeriod) {
        id
        name
      }
    }
  `, newFeed.value)
  
  if (data?.createFeed) {
    showCreateDialog.value = false
    newFeed.value = { name: '', url: '', pollingPeriod: 60 }
    await fetchFeeds()
  }
  loading.value = false
}

async function pollFeed(id: string) {
  loading.value = true
  await graphql(`
    mutation($id: ID!) {
      pollFeed(id: $id)
    }
  `, { id })
  await fetchFeeds()
  loading.value = false
}

async function pollAll() {
  loading.value = true
  await graphql(`
    mutation {
      pollAllFeeds {
        feedId
        name
        newItems
        error
      }
    }
  `)
  await fetchFeeds()
  loading.value = false
}

async function deleteFeed(id: string) {
  if (!confirm('Are you sure you want to delete this feed?')) return
  loading.value = true
  await graphql(`
    mutation($id: ID!) {
      deleteFeed(id: $id)
    }
  `, { id })
  await fetchFeeds()
  loading.value = false
}

function formatDate(dateStr: string) {
  if (!dateStr) return 'Never'
  return new Date(parseInt(dateStr)).toLocaleString()
}

onMounted(fetchFeeds)
</script>

<template>
  <v-container fluid class="pa-8">
    <div class="d-flex align-center mb-6">
      <h2 class="text-h4 font-weight-bold">Automated Feeds</h2>
      <v-chip class="ms-3" size="small">{{ feeds.length }}</v-chip>
      <v-spacer></v-spacer>
      <v-btn color="secondary" variant="tonal" rounded="pill" prepend-icon="mdi-refresh" class="me-3" @click="pollAll" :loading="loading">
        Poll All
      </v-btn>
      <v-btn color="primary" variant="flat" rounded="pill" prepend-icon="mdi-plus" @click="showCreateDialog = true">
        Add Feed
      </v-btn>
    </div>

    <v-row v-if="feeds.length">
      <v-col v-for="feed in feeds" :key="feed.id" cols="12" md="6" lg="4">
        <v-card class="glass-card" rounded="xl" elevation="2">
          <v-card-item>
            <template v-slot:prepend>
              <v-avatar color="primary-lighten-4" size="48">
                <v-icon color="primary">mdi-rss</v-icon>
              </v-avatar>
            </template>
            <v-card-title class="font-weight-bold">{{ feed.name }}</v-card-title>
            <v-card-subtitle>{{ feed.url }}</v-card-subtitle>
          </v-card-item>

          <v-card-text class="pt-2">
            <div class="d-flex flex-column ga-2">
              <div class="d-flex justify-space-between align-center text-body-2">
                <span class="text-medium-emphasis">Polling Period:</span>
                <v-chip size="x-small" variant="tonal">{{ feed.pollingPeriod }} min</v-chip>
              </div>
              <div class="d-flex justify-space-between align-center text-body-2">
                <span class="text-medium-emphasis">Last Polled:</span>
                <span class="font-weight-medium">{{ formatDate(feed.lastPolledAt) }}</span>
              </div>
            </div>
          </v-card-text>

          <v-divider class="mx-4 opacity-10"></v-divider>

          <v-card-actions class="pa-4">
            <v-btn size="small" variant="text" color="error" icon="mdi-delete-outline" @click="deleteFeed(feed.id)"></v-btn>
            <v-spacer></v-spacer>
            <v-btn size="small" variant="tonal" color="primary" rounded="pill" prepend-icon="mdi-sync" @click="pollFeed(feed.id)" :loading="loading">
              Poll Now
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <div v-else-if="!loading" class="d-flex flex-column align-center justify-center py-16 opacity-40">
      <v-icon size="64">mdi-rss-off</v-icon>
      <div class="text-h6 mt-4">No feeds registered yet</div>
      <div class="text-body-2">Add your first RSS/Atom URL to start discovery</div>
    </div>

    <!-- Create Dialog -->
    <v-dialog v-model="showCreateDialog" max-width="500">
      <v-card rounded="xl" class="glass-card pa-4">
        <v-card-title class="text-h5 font-weight-bold">Register New Feed</v-card-title>
        <v-card-text class="pt-4">
          <v-text-field v-model="newFeed.name" label="Feed Name" variant="outlined" placeholder="e.g. ERR News AI Section" class="mb-4"></v-text-field>
          <v-text-field v-model="newFeed.url" label="RSS/Atom URL" variant="outlined" placeholder="https://news.google.com/rss/..." class="mb-4"></v-text-field>
          <v-slider v-model="newFeed.pollingPeriod" label="Polling Period (min)" min="15" max="1440" step="15" thumb-label color="primary"></v-slider>
          <div class="text-caption text-medium-emphasis text-center">Interval for automatic discovery checks</div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer></v-spacer>
          <v-btn variant="text" rounded="pill" @click="showCreateDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" rounded="pill" class="px-6" @click="createFeed" :loading="loading">Save Feed</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.glass-card {
  background: rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
