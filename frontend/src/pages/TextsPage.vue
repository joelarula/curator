<template>
  <v-container fluid class="pa-8">
    <div class="d-flex align-center mb-8">
      <div>
        <h2 class="text-h4 font-weight-black tracking-tighter uppercase mb-1">Sources Hub</h2>
        <div class="text-caption text-grey font-weight-medium">MANAGING {{ totalCount }} KNOWLEDGE SOURCES</div>
      </div>
      <v-spacer></v-spacer>
      <v-btn color="primary" variant="flat" rounded="pill" prepend-icon="mdi-plus" size="large" class="px-6" @click="openEstablishSource">
        New Source
      </v-btn>
    </div>

    <!-- Search / Filter -->
    <div class="d-flex align-center mb-6 ga-4">
      <v-text-field
        v-model="search"
        prepend-inner-icon="mdi-magnify"
        label="Search sources..."
        variant="solo-filled"
        density="compact"
        clearable
        hide-details
      ></v-text-field>
      <v-btn
        :color="showFilters ? 'primary' : 'default'"
        variant="tonal"
        icon="mdi-filter-variant"
        @click="showFilters = !showFilters"
      ></v-btn>
    </div>

    <!-- Advanced Filters -->
    <v-expand-transition>
      <div v-if="showFilters" class="mb-6">
        <v-card variant="outlined" class="pa-4 glass-card border-dashed">
          <v-row density="compact">
            <v-col cols="12" md="4">
              <v-text-field
                v-model="filters.startDate"
                label="Start Date"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="filters.endDate"
                label="End Date"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="3">
              <TagManager v-model="filters.tags" :all-tags="allTags" label="Filter by Tags" density="compact" />
            </v-col>
            <v-col cols="12" md="3" class="d-flex align-center">
              <v-checkbox
                v-model="filters.isPublished"
                label="Published Only"
                density="compact"
                hide-details
                color="primary"
              ></v-checkbox>
            </v-col>
          </v-row>
        </v-card>
      </div>
    </v-expand-transition>

    <!-- Texts List -->
    <v-row>
      <v-col v-for="source in sources" :key="source.id" cols="12">
        <v-card class="glass-card mb-2 rounded-xl border-opacity-10" elevation="2" hover @click="navigateToWiki(source)">
          <v-card-text class="pa-6">
            <div class="d-flex align-start ga-6">
              <v-avatar :color="source.type === 'WIKI_PAGE' ? 'primary' : 'secondary'" variant="tonal" rounded="lg" size="48">
                <v-icon>{{ source.type === 'WIKI_PAGE' ? 'mdi-book-open-page-variant' : 'mdi-web' }}</v-icon>
              </v-avatar>
              
              <div class="flex-grow-1">
                <div class="text-caption font-weight-black opacity-30 mb-1 uppercase tracking-widest d-flex align-center ga-2">
                  <v-icon size="14">mdi-identifier</v-icon> {{ source.path || source.id }}
                  <span v-if="source.materializedPath" class="opacity-20">/ {{ source.materializedPath }}</span>
                </div>
                <div class="text-h6 font-weight-bold mb-2">
                  {{ source.title || 'Untitled Source' }}
                </div>
                
                <div v-if="source.texts?.[0]" class="text-body-2 opacity-50 mb-4 reading-typography line-clamp-2" style="font-size: 0.95rem; line-height: 1.6;">
                  {{ source.texts[0].content.slice(0, 300) }}...
                </div>
                <div v-else class="text-body-2 opacity-20 italic mb-4">
                  No content associated with this source.
                </div>

                <div class="d-flex align-center ga-3 flex-wrap">
                  <v-chip v-for="tag in source.tags" :key="tag.id" size="x-small" variant="tonal" color="primary">
                    {{ tag.name }}: {{ tag.value }}
                  </v-chip>
                  <v-chip size="x-small" :color="source.isPublished ? 'success' : 'warning'" variant="tonal">
                     {{ source.isPublished ? 'PUBLISHED' : 'DRAFT' }}
                  </v-chip>
                  <v-chip size="x-small" variant="outlined" class="opacity-30">{{ source.type }}</v-chip>
                  <span class="text-caption opacity-30 ms-auto">Updated {{ formatDate(source.updatedAt) }}</span>
                </div>
              </div>

              <div class="d-flex flex-column ga-2">
                <v-btn icon="mdi-open-in-new" variant="text" color="primary" @click.stop="navigateToWiki(source)"></v-btn>
                <v-btn icon="mdi-delete-outline" variant="text" color="error" size="small" @click.stop="confirmDelete(source)"></v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    
    <!-- Paging -->
    <div v-if="sources.length < totalCount" class="text-center mt-8">
      <v-btn
        variant="tonal"
        rounded="pill"
        prepend-icon="mdi-chevron-down"
        :loading="loading"
        @click="loadMore"
      >
        Load More ({{ sources.length }} of {{ totalCount }})
      </v-btn>
    </div>

    <div v-if="sources.length === 0 && !loading" class="text-center text-grey py-16">
      <v-icon size="100" color="primary" class="mb-6 opacity-20">mdi-database-plus-outline</v-icon>
      <div class="text-h4 font-weight-black text-white mb-2 uppercase tracking-tighter">Your Graph is Empty</div>
      <div class="text-body-1 text-grey mb-8">Establish a new knowledge source to begin your structural research.</div>
      <v-btn color="primary" variant="flat" rounded="pill" size="large" class="px-10" prepend-icon="mdi-plus" @click="openEstablishSource">
        Establish Source
      </v-btn>
    </div>

    <!-- Add Delete Confirmation Dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card rounded="xl" class="pa-4 text-center">
        <v-icon size="64" color="error" class="mb-4">mdi-alert-circle-outline</v-icon>
        <div class="text-h5 font-weight-black mb-2 uppercase tracking-tighter">Confirm Deletion</div>
        <div class="text-body-2 text-grey mb-6">Remove this source and all its content? This action cannot be undone.</div>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" rounded="pill" class="px-6" @click="showDeleteDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" rounded="pill" class="px-8" @click="deleteText">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
/**
 * TextsPage.vue  (/sources  or  /texts)
 *
 * Sources Hub — the main knowledge graph browser.
 *
 * Displays all Source nodes (WIKI_PAGE, WEB, etc.) owned by the current user
 * as a scrollable list. Each card shows:
 *   - Type avatar (wiki-page icon vs. web icon)
 *   - Identity path (path / materializedPath)
 *   - Title and first 300 chars of the latest Text
 *   - Tags, published state, type chip, and last-updated date
 *
 * Clicking a card navigates to `/wiki/<materializedPath>` (WikiPage).
 *
 * Filtering:
 *   - Full-text search on title, path, and materializedPath.
 *   - Date range (createdAt)
 *   - Tag filter (key+value pairs via TagManager)
 *   - Published-only toggle
 *   All filters are reactive — changing any filter resets to page 1.
 *
 * Pagination: infinite scroll via "Load More" button (20 items / page).
 *
 * Deletion: `deleteWikiPage` mutation (hard-delete). Confirmed via dialog.
 */
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { graphql, showSuccess } from '../composables/useGraphql'
import { openEstablishSource } from '../composables/useGlobalActions'
import TagManager from '../components/TagManager.vue'

const router = useRouter()

const sources = ref<any[]>([])
const loading = ref(false)
const showDeleteDialog = ref(false)
const textToDelete = ref<any>(null)
const allTags = ref<any[]>([])
const totalCount = ref(0)
const itemsPerPage = 20
const currentPage = ref(1)
const search = ref('')
const showFilters = ref(false)

const filters = ref({
  startDate: '',
  endDate: '',
  tags: [] as any[],
  isPublished: false
})

function formatDate(dateVal: string | number) {
  if (!dateVal) return 'No date'
  
  // Handle numeric strings (milliseconds)
  const timestamp = typeof dateVal === 'string' && /^\d+$/.test(dateVal) 
    ? parseInt(dateVal, 10) 
    : dateVal;
    
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return dateVal.toString()
  return date.toLocaleDateString()
}

onMounted(() => {
  fetchSources()
  fetchTags()
})

async function fetchSources(reset = false) {
  if (reset) {
    currentPage.value = 1
    sources.value = []
  }
  
  loading.value = true
  
  const variables: any = {
    skip: (currentPage.value - 1) * itemsPerPage,
    take: itemsPerPage,
    filter: {
      search: search.value || undefined,
      startDate: filters.value.startDate || undefined,
      endDate: filters.value.endDate || undefined,
      tags: filters.value.tags.length > 0 ? filters.value.tags : undefined
    }
  }

  const data = await graphql(`
    query($filter: WikiFilterInput, $skip: Int, $take: Int) {
      sources(filter: $filter, skip: $skip, take: $take) {
        items {
          id path materializedPath title type isPublished updatedAt
          tags { id name value }
          texts(take: 1) { id content createdAt }
        }
        totalCount
      }
    }
  `, variables)
  
  if (data?.sources) {
    if (reset) {
      sources.value = data.sources.items
    } else {
      sources.value.push(...data.sources.items)
    }
    totalCount.value = data.sources.totalCount
  }
  loading.value = false
}

async function loadMore() {
  if (sources.value.length < totalCount.value) {
    currentPage.value++
    await fetchSources()
  }
}

watch(search, () => {
  fetchSources(true)
})

watch(filters, () => {
  fetchSources(true)
}, { deep: true })

async function fetchTags() {
  const data = await graphql(`
    query {
      tags { id name value }
    }
  `)
  if (data?.tags) allTags.value = data.tags
}

function confirmDelete(source: any) {
  textToDelete.value = source
  showDeleteDialog.value = true
}

async function deleteText() {
  if (!textToDelete.value) return
  loading.value = true
  const data = await graphql(`mutation($id: ID!) { deleteWikiPage(id: $id) }`, { id: textToDelete.value.id })
  if (data?.deleteWikiPage) {
    sources.value = sources.value.filter((s: any) => s.id !== textToDelete.value.id)
    totalCount.value = Math.max(0, totalCount.value - 1)
    showDeleteDialog.value = false
    showSuccess('Source and content removed from Knowledge Graph')
  }
  loading.value = false
}

function navigateToWiki(source: any) {
  const path = source.materializedPath || source.path
  if (path) {
    router.push('/wiki/' + path)
  }
}
</script>

<style scoped>
.glass-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(255, 255, 255, 0.02) !important;
}
.glass-card:hover {
  background: rgba(255, 255, 255, 0.05) !important;
  transform: translateY(-2px);
  border-color: rgba(187, 134, 252, 0.3);
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
