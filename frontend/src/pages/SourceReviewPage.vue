<script setup lang="ts">
/**
 * SourceReviewPage.vue  (/review)
 *
 * Source Inbox — a triage queue for newly discovered feed articles.
 *
 * Shows all Sources with status "NEW" (from feeds belonging to the current user)
 * in a sortable data-table. Each row shows the title, origin feed name, and
 * discovery date.
 *
 * Per-row actions:
 *   - Discard — marks the source as DISCARDED via `batchDiscardSources`.
 *   - Process  — calls `initializeTextFromSource`, which:
 *       1. Scrapes the full article content
 *       2. Runs AI summary + author extraction (AIService)
 *       3. Creates a Text record with an AI Summary
 *       4. Triggers embedding chunking (ChunkingService)
 *       5. Sets source status to PROCESSED
 *
 * Batch actions:
 *   - Select multiple rows and click "Discard Selected" to bulk-discard.
 *
 * Pagination: 20 items per page, server-side via skip/take.
 */
import { ref, onMounted, computed } from 'vue'
import { graphql } from '../composables/useGraphql'
import { useRouter } from 'vue-router'
const router = useRouter()

const sources = ref<any[]>([])
const selected = ref<string[]>([])
const loading = ref(false)
const totalCount = ref(0)
const itemsPerPage = 20
const currentPage = ref(1)

const headers = [
  { title: 'Source Title', key: 'title', sortable: false },
  { title: 'Feed Name', key: 'feed.name', sortable: false },
  { title: 'Date Found', key: 'createdAt', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, align: 'end' as const },
]

async function fetchSources() {
  loading.value = true
  const data = await graphql(`
    query($skip: Int, $take: Int) {
      sourcesReview(status: "NEW", skip: $skip, take: $take) {
        items {
          id
          title
          url
          description
          createdAt
          feed {
            id
            name
          }
        }
        totalCount
      }
    }
  `, { 
    skip: (currentPage.value - 1) * itemsPerPage, 
    take: itemsPerPage 
  })
  
  if (data?.sourcesReview) {
    sources.value = data.sourcesReview.items
    totalCount.value = data.sourcesReview.totalCount
  }
  loading.value = false
}

async function initializeText(sourceId: string) {
  loading.value = true
  const data = await graphql(`
    mutation($id: ID!) {
      initializeTextFromSource(id: $id) {
        id
      }
    }
  `, { id: sourceId })
  
  if (data?.initializeTextFromSource) {
    // Navigate to the new text or stay here and refresh
    await fetchSources()
  }
  loading.value = false
}

async function discardSource(id: string) {
  loading.value = true
  await graphql(`
    mutation($ids: [ID!]!) {
      batchDiscardSources(ids: $ids)
    }
  `, { ids: [id] })
  await fetchSources()
  loading.value = false
}

async function batchDiscard() {
  if (!selected.value.length) return
  loading.value = true
  await graphql(`
    mutation($ids: [ID!]!) {
      batchDiscardSources(ids: $ids)
    }
  `, { ids: selected.value })
  selected.value = []
  await fetchSources()
  loading.value = false
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(parseInt(dateStr)).toLocaleDateString()
}

onMounted(fetchSources)
</script>

<template>
  <v-container fluid class="pa-8">
    <div class="d-flex align-center mb-6">
      <div>
        <h2 class="text-h4 font-weight-bold">Source Inbox</h2>
        <div class="text-subtitle-1 text-medium-emphasis">Review discovered articles before processing</div>
      </div>
      <v-spacer></v-spacer>
      <v-fade-transition>
        <v-btn
          v-if="selected.length"
          color="error"
          variant="tonal"
          rounded="pill"
          prepend-icon="mdi-trash-can-outline"
          @click="batchDiscard"
          class="me-3"
        >
          Discard Selected ({{ selected.length }})
        </v-btn>
      </v-fade-transition>
      <v-btn
        variant="outlined"
        rounded="pill"
        icon="mdi-refresh"
        @click="fetchSources"
        :loading="loading"
      ></v-btn>
    </div>

    <v-card class="glass-card overflow-hidden" rounded="xl">
      <v-data-table
        v-model="selected"
        :headers="headers"
        :items="sources"
        item-value="id"
        show-select
        class="bg-transparent"
        :loading="loading"
      >
        <template v-slot:item.title="{ item }">
          <div class="d-flex flex-column py-3">
            <div class="text-subtitle-2 font-weight-bold truncate-title">
              {{ item.title }}
            </div>
            <div class="text-caption text-medium-emphasis text-truncate opacity-60" style="max-width: 400px">
              {{ item.url }}
            </div>
          </div>
        </template>

        <template v-slot:item.createdAt="{ item }">
          {{ formatDate(item.createdAt) }}
        </template>

        <template v-slot:item.actions="{ item }">
          <div class="d-flex justify-end ga-2">
            <v-btn
              size="small"
              variant="text"
              color="error"
              icon="mdi-close-circle-outline"
              @click="discardSource(item.id)"
            ></v-btn>
            <v-btn
              size="small"
              variant="tonal"
              color="primary"
              prepend-icon="mdi-auto-fix"
              rounded="pill"
              class="px-4"
              @click="initializeText(item.id)"
              :loading="loading"
            >
              Process
            </v-btn>
          </div>
        </template>

        <template v-slot:bottom>
          <div class="pa-4 d-flex align-center justify-end">
            <v-pagination
              v-model="currentPage"
              :length="Math.ceil(totalCount / itemsPerPage)"
              density="comfortable"
              @update:model-value="fetchSources"
            ></v-pagination>
          </div>
        </template>
      </v-data-table>
    </v-card>
  </v-container>
</template>

<style scoped>
.glass-card {
  background: rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.truncate-title {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:deep(thead) {
  background: rgba(var(--v-theme-primary), 0.05);
}
</style>
