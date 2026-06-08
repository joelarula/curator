<template>
  <v-container fluid class="pa-8 bg-space">
    <!-- Header -->
    <div class="d-flex align-center mb-6">
      <v-spacer></v-spacer>
      
      <v-btn-toggle
        v-model="viewMode"
        mandatory
        variant="tonal"
        color="primary"
        class="me-4 rounded-pill"
        density="compact"
        @update:model-value="persistViewMode"
      >
        <v-btn value="cards" icon="mdi-view-grid-outline"></v-btn>
        <v-btn value="table" icon="mdi-table-large"></v-btn>
      </v-btn-toggle>

      <v-btn
        icon="mdi-plus"
        color="primary"
        variant="flat"
        size="small"
        rounded="circle"
        title="New Resource"
        @click="openEstablishResourceUI"
      ></v-btn>
    </div>

    <!-- Search & Filter Bar -->
    <v-row class="mb-6">
      <v-col cols="12" md="8">
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          label="Search by URI or Title..."
          variant="solo-filled"
          density="comfortable"
          clearable
          hide-details
          class="search-bar"
          @keyup.enter="fetchResources(true)"
        ></v-text-field>
      </v-col>
      <v-col cols="12" md="4" class="d-flex ga-2">
        <v-btn
          :color="showFilters ? 'primary' : 'default'"
          variant="tonal"
          size="x-large"
          class="flex-grow-1 rounded-lg"
          prepend-icon="mdi-filter-variant"
          @click="showFilters = !showFilters"
        >
          Filters
        </v-btn>
        <v-btn
          icon="mdi-refresh"
          variant="text"
          size="x-large"
          :loading="loading"
          @click="fetchResources(true)"
        ></v-btn>
      </v-col>
    </v-row>

    <!-- Advanced Filters Drawer (Timeline & State) -->
    <v-expand-transition>
      <div v-if="showFilters" class="mb-6">
        <v-card variant="outlined" class="pa-6 glass-card border-dashed rounded-xl">
            <!-- Global Toggles -->
            <v-row class="d-flex align-center">
               <v-col cols="12" md="6" class="d-flex align-center ga-4">
                 <div class="text-overline opacity-50">Timeline</div>
                 <v-text-field
                    v-model="filters.startDate"
                    label="From"
                    type="date"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="glass-input"
                    @change="fetchResources(true)"
                  ></v-text-field>
                  <v-text-field
                    v-model="filters.endDate"
                    label="To"
                    type="date"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="glass-input"
                    @change="fetchResources(true)"
                  ></v-text-field>
               </v-col>

               <v-spacer></v-spacer>

               <v-col cols="12" md="3" class="text-right">
                 <v-checkbox
                    v-model="filters.isPublished"
                    label="Published Only"
                    density="compact"
                    hide-details
                    color="primary"
                    inline
                    @change="fetchResources(true)"
                  ></v-checkbox>
               </v-col>
            </v-row>
        </v-card>
      </div>
    </v-expand-transition>

    <!-- Permanent Relational Criteria (Always Open) -->
    <RelationLogicFilters v-model="filters.relations" @change="fetchResources(true)" />


    <!-- Resource Explorer -->
    <div v-if="viewModeReady && initialResourcesReady && resources.length > 0">
      <!-- Card View -->
      <v-row v-if="viewMode === 'cards'">
        <v-col v-for="resource in resources" :key="resource.id" cols="12" md="6" lg="4">
          <v-card 
            class="resource-card h-100 rounded-xl" 
            elevation="0" 
            border
            hover
            @click="navigateToDetail(resource.id)"
          >
            <v-card-text class="pa-6 d-flex flex-column h-100">
              <div class="d-flex align-center mb-4 ga-3">
                <v-avatar color="primary" variant="tonal" rounded="lg" size="40">
                  <v-icon size="20">mdi-rhombus-outline</v-icon>
                </v-avatar>
                <div class="flex-grow-1 overflow-hidden">
                  <div v-if="!isEditingResource(resource.id)">
                    <div class="text-caption font-weight-black opacity-30 tracking-widest truncate">{{ resource.uri }}</div>
                    <div class="text-h6 font-weight-black truncate">{{ resource.title || 'Untitled Resource' }}</div>
                  </div>
                  <div v-else class="d-flex flex-column ga-2" @click.stop>
                    <v-text-field
                      v-model="editDraft.uri"
                      label="URI"
                      density="compact"
                      variant="outlined"
                      hide-details
                      autofocus
                    ></v-text-field>
                    <v-text-field
                      v-model="editDraft.title"
                      label="Title"
                      density="compact"
                      variant="outlined"
                      hide-details
                    ></v-text-field>
                  </div>
                </div>
              </div>

              <p class="text-body-2 opacity-60 mb-6 line-clamp-3 flex-grow-1">
                {{ resource.description || 'No description provided for this resource.' }}
              </p>

              <div class="d-flex align-center ga-2 mt-auto pt-4 border-t border-white border-opacity-5">
                <v-chip size="x-small" :color="resource.isPublished ? 'success' : 'warning'" variant="flat">
                  {{ resource.isPublished ? 'PUBLISHED' : 'DRAFT' }}
                </v-chip>
                <v-spacer></v-spacer>
                <div class="text-caption opacity-20 font-weight-bold uppercase">
                  {{ formatDate(resource.createdAt) }}
                </div>
              </div>
            </v-card-text>

            <!-- Hover Overlay Actions -->
            <div class="card-actions">
              <v-btn
                v-if="!isEditingResource(resource.id)"
                icon="mdi-pencil-outline"
                variant="flat"
                color="secondary"
                @click.stop="startEditingResource(resource)"
              ></v-btn>
              <v-btn
                v-else
                icon="mdi-check"
                variant="flat"
                color="success"
                @click.stop="saveInlineResource(resource)"
              ></v-btn>
              <v-btn
                v-if="isEditingResource(resource.id)"
                icon="mdi-close"
                variant="flat"
                color="error"
                @click.stop="cancelEditingResource"
              ></v-btn>
              <v-btn icon="mdi-eye-outline" variant="flat" color="white" class="text-black" @click.stop="navigateToDetail(resource.id)"></v-btn>
              <v-btn icon="mdi-creation" variant="flat" color="primary" @click.stop="triggerAgent(resource)"></v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Table View -->
      <v-card v-else variant="outlined" rounded="xl" class="glass-card border-white border-opacity-5 overflow-hidden">
        <v-data-table
          :headers="tableHeaders"
          :items="resources"
          density="comfortable"
          hover
          class="bg-transparent"
          hide-default-footer
          @click:row="(_e: any, { item }: any) => navigateToDetail(item.id)"

        >
          <template v-slot:item.uri="{ item }">
             <div v-if="!isEditingResource(item.id)" class="text-caption font-weight-bold opacity-40 truncate" style="max-width: 200px;">{{ item.uri }}</div>
             <v-text-field
              v-else
              v-model="editDraft.uri"
              density="compact"
              variant="outlined"
              hide-details
              style="min-width: 240px;"
              @click.stop
             ></v-text-field>
          </template>
          <template v-slot:item.title="{ item }">
             <div v-if="!isEditingResource(item.id)" class="font-weight-black">{{ item.title || 'Untitled Resource' }}</div>
             <v-text-field
              v-else
              v-model="editDraft.title"
              density="compact"
              variant="outlined"
              hide-details
              style="min-width: 220px;"
              @click.stop
             ></v-text-field>
          </template>
          <template v-slot:item.isPublished="{ item }">
            <v-chip size="x-small" :color="item.isPublished ? 'success' : 'warning'" variant="tonal" class="font-weight-black">
              {{ item.isPublished ? 'PUBLISHED' : 'DRAFT' }}
            </v-chip>
          </template>
          <template v-slot:item.createdAt="{ item }">
             <div class="text-caption opacity-40">{{ formatDate(item.createdAt) }}</div>
          </template>
          <template v-slot:item.actions="{ item }">
             <v-btn
               v-if="!isEditingResource(item.id)"
               icon="mdi-pencil-outline"
               size="x-small"
               variant="text"
               @click.stop="startEditingResource(item)"
             ></v-btn>
             <v-btn
               v-else
               icon="mdi-check"
               size="x-small"
               variant="text"
               color="success"
               @click.stop="saveInlineResource(item)"
             ></v-btn>
             <v-btn
               v-if="isEditingResource(item.id)"
               icon="mdi-close"
               size="x-small"
               variant="text"
               color="error"
               @click.stop="cancelEditingResource"
             ></v-btn>
             <v-btn icon="mdi-open-in-new" size="x-small" variant="text" @click.stop="navigateToDetail(item.id)"></v-btn>
          </template>
        </v-data-table>
      </v-card>
    </div>


    <!-- Empty State -->
    <div v-else-if="initialResourcesReady && !loading" class="text-center py-16 opacity-30">
      <v-icon size="120" class="mb-4">mdi-database-search-outline</v-icon>
      <div class="text-h5 font-weight-light">No resources found matching your trajectory.</div>
    </div>

    <!-- Loading State (initial empty load only) -->
    <div v-if="!initialResourcesReady || (loading && resources.length === 0)" class="resource-loader-shell d-flex align-center justify-center">
      <v-card rounded="xl" variant="outlined" class="resource-loader-card pa-8 text-center">
        <v-progress-circular indeterminate color="primary" size="52" width="4" class="mb-4"></v-progress-circular>
        <div class="text-h6 font-weight-black mb-2">Loading resources</div>
        <div class="text-body-2 opacity-60">Preparing your current project and shared system rows…</div>
        <div class="d-flex justify-center mt-6 ga-2">
          <v-skeleton-loader type="chip" width="90"></v-skeleton-loader>
          <v-skeleton-loader type="chip" width="120"></v-skeleton-loader>
          <v-skeleton-loader type="chip" width="84"></v-skeleton-loader>
        </div>
      </v-card>
    </div>

    <!-- Pagination -->
    <div v-if="totalCount > itemsPerPage" class="d-flex flex-column align-center mt-12 ga-3">
      <v-pagination
        v-model="currentPage"
        :length="pageCount"
        :total-visible="7"
        rounded="circle"
        density="comfortable"
      ></v-pagination>
      <div class="text-caption opacity-60">
        Page {{ currentPage }} of {{ pageCount }}
      </div>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { graphql, showError, showSuccess } from '../composables/useGraphql'
import { openEstablishResource } from '../composables/useGlobalActions'
import { isExtensionContext } from '../composables/useEnv'
import { resourcesPageStateVar } from '../composables/useResourcesPageState'
import RelationLogicFilters from '../components/RelationLogicFilters.vue'

declare const chrome: any

const router = useRouter()

const resources = ref<any[]>([])
const loading = ref(false)
const totalCount = ref(0)
const itemsPerPage = 21
const currentPage = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / itemsPerPage)))
const search = ref('')
const showFilters = ref(false)
const viewMode = ref<'cards' | 'table'>('cards')
const viewModeReady = ref(false)
const initialResourcesReady = ref(false)

function hydrateViewMode() {
  const state = resourcesPageStateVar()
  viewMode.value = state.viewMode
  search.value = state.search
  showFilters.value = state.showFilters
  currentPage.value = state.currentPage
  filters.value = {
    ...state.filters,
    relations: state.filters.relations.map((rel) => ({ ...rel })),
  }
  viewModeReady.value = true
}

function persistViewMode(value: string) {
  const normalized: 'cards' | 'table' = value === 'table' ? 'table' : 'cards'
  viewMode.value = normalized
  resourcesPageStateVar({
    ...resourcesPageStateVar(),
    viewMode: normalized,
  })
}



const filters = ref({
  startDate: '',
  endDate: '',
  relations: [
    { predicateUri: '', objectUri: '', subjectUri: '', isInverted: false }
  ] as Array<{ predicateUri: string, objectUri: string, subjectUri: string, isInverted: boolean }>,
  isPublished: false
})



const tableHeaders = [
  { title: 'URI', key: 'uri', align: 'start', sortable: true },
  { title: 'TITLE', key: 'title', align: 'start', sortable: true },
  { title: 'STATUS', key: 'isPublished', align: 'center', sortable: true },
  { title: 'CREATED', key: 'createdAt', align: 'end', sortable: true },
  { title: 'ACTIONS', key: 'actions', align: 'end', sortable: false },
] as const

const editingResourceId = ref<number | null>(null)
const editDraft = ref({ uri: '', title: '' })

function getRelationPayloadTargetUri(rel: { predicateUri: string; subjectUri: string; objectUri: string; isInverted: boolean }) {
  return rel.isInverted
    ? (rel.subjectUri || rel.objectUri || undefined)
    : (rel.objectUri || rel.subjectUri || undefined)
}

onMounted(() => {
  hydrateViewMode()
  fetchResources()

  if (isExtensionContext()) {
    // Listen for background events (e.g. context menu adds a resource)
    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg.type === 'RESOURCE_ADDED') {
        fetchResources(true)
      }
    })
  }
})

watch([search, showFilters, currentPage, viewMode, filters], () => {
  resourcesPageStateVar({
    search: search.value,
    showFilters: showFilters.value,
    viewMode: viewMode.value,
    currentPage: currentPage.value,
    filters: {
      ...filters.value,
      relations: filters.value.relations.map((rel) => ({ ...rel })),
    },
  })
}, { deep: true })

async function fetchResources(reset = false) {
  if (reset && currentPage.value !== 1) {
    currentPage.value = 1
    return
  }
  
  loading.value = true
  
  try {
    const data = await graphql(`
      query($filter: ResourceFilterInput, $skip: Int, $take: Int) {
        queryResources(filter: $filter, skip: $skip, take: $take) {
          items {
            id uri title description isPublished createdAt
          }
          totalCount
        }
      }
    `, {
      skip: (currentPage.value - 1) * itemsPerPage,
      take: itemsPerPage,
      filter: {
        search: search.value || undefined,
        createdAtStart: filters.value.startDate || undefined,
        createdAtEnd: filters.value.endDate || undefined,
        relations: filters.value.relations.length > 0 
          ? filters.value.relations
              .filter(r => {
                const targetUri = r.isInverted
                  ? (r.subjectUri || r.objectUri)
                  : (r.objectUri || r.subjectUri)
                return Boolean(r.predicateUri || targetUri)
              })
              .map(r => ({ 
                predicateUri: r.predicateUri || undefined, 
                objectUri: r.isInverted ? undefined : (getRelationPayloadTargetUri(r) || undefined),
                subjectUri: r.isInverted ? (getRelationPayloadTargetUri(r) || undefined) : undefined,
              })) 
          : undefined,
        isPublished: filters.value.isPublished || undefined
      }

    })


    if (data?.queryResources) {
      resources.value = data.queryResources.items
      totalCount.value = data.queryResources.totalCount
    }
  } finally {
    initialResourcesReady.value = true
    loading.value = false
  }
}

function formatDate(val: string) {
  if (!val) return '—'
  const date = !isNaN(Number(val)) ? new Date(Number(val)) : new Date(val)
  return date.toLocaleDateString('et-EE', { day: '2-digit', month: 'short' })
}

function navigateToDetail(id: number) {
  if (isEditingResource(id)) return
  router.push(`/resource/${id}`)
}

function openEstablishResourceUI() {
  openEstablishResource()
}

function triggerAgent(resource: any) {
  router.push(`/resource/${resource.id}?analyze=true`)
}

function isEditingResource(id: number) {
  return editingResourceId.value === id
}

function startEditingResource(resource: any) {
  editingResourceId.value = resource.id
  editDraft.value = {
    uri: resource.uri || '',
    title: resource.title || '',
  }
}

function cancelEditingResource() {
  editingResourceId.value = null
  editDraft.value = { uri: '', title: '' }
}

async function saveInlineResource(resource: any) {
  const uri = editDraft.value.uri.trim()
  const title = editDraft.value.title.trim()

  if (!uri) {
    showError('URI is required')
    return
  }

  const data = await graphql(`
    mutation($id: Int!, $input: ResourceInput!) {
      updateResource(id: $id, input: $input) {
        id
        uri
        title
      }
    }
  `, {
    id: resource.id,
    input: {
      uri,
      title: title || null,
    }
  })

  const updated = data?.updateResource
  if (!updated) return

  resource.uri = updated.uri
  resource.title = updated.title
  showSuccess('Resource updated')
  cancelEditingResource()
}


watch(filters, () => fetchResources(true), { deep: true })
watch(currentPage, () => fetchResources(false))
watch(search, () => fetchResources(true))
</script>

<style scoped>
.bg-space {
  background-color: #050505;
  min-height: 100vh;
}

.resource-loader-shell {
  min-height: 38vh;
}

.resource-loader-card {
  min-width: min(520px, 100%);
  background: rgba(255, 255, 255, 0.025) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  backdrop-filter: blur(12px);
}

.search-bar :deep(.v-field) {
  border-radius: 16px !important;
  background: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.3s ease;
}

.search-bar :deep(.v-field--focused) {
  border-color: var(--v-theme-primary);
  background: rgba(255, 255, 255, 0.05) !important;
}

.glass-card {
  background: rgba(255, 255, 255, 0.02) !important;
  border: 1px solid rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
}

.resource-card {
  position: relative;
  background: #0a0a0a !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
  overflow: hidden;
}

.resource-card:hover {
  transform: translateY(-4px) scale(1.01);
  border-color: rgba(var(--v-theme-primary), 0.4) !important;
  background: #0e0e0e !important;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}

.card-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transform: translateX(10px);
  transition: all 0.3s ease;
}

.resource-card:hover .card-actions {
  opacity: 1;
  transform: translateX(0);
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;

  overflow: hidden;
}

.border-dashed {
  border-style: dashed !important;
}
</style>
