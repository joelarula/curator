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
    <div class="mb-8 animate-fade-in">
      <div class="d-flex align-center mb-4">
        <div class="text-overline opacity-40 tracking-widest d-flex align-center ga-2">
          <v-icon size="14">mdi-rhombus-split</v-icon> Relational Logic (AND)
        </div>
        <v-spacer></v-spacer>
        <v-btn 
          variant="text" 
          size="x-small" 
          prepend-icon="mdi-plus" 
          color="primary" 
          class="font-weight-black opacity-60 hover-opacity-100"
          @click="addRelationFilter"
        >
          Extend Intersection
        </v-btn>
      </div>
      
      <div class="d-flex flex-column ga-2">
        <div v-for="(rel, index) in filters.relations" :key="index" class="d-flex align-center ga-3 animate-fade-in pa-2 rounded-lg border border-white border-opacity-5 bg-black bg-opacity-40 transition-all hover-bg-opacity-50">
          <v-autocomplete
            v-model="rel.predicateUri"
            v-model:search="predicateSearch"
            :items="predicateResults"
            item-title="uri"
            item-value="uri"
            label="Predicate URI"
            placeholder="Search..."
            variant="plain"
            density="compact"
            hide-details
            class="flex-grow-1 px-3"
            @update:model-value="(val: any) => { fetchPredicateOptions(val); fetchResources(true); }"
            @update:search="searchPredicates"
          >

            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
            </template>
          </v-autocomplete>

          <v-btn
            icon
            size="small"
            variant="text"
            color="primary"
            class="mx-1"
            :title="rel.isInverted ? 'Search for Objects (Inbound)' : 'Search for Subjects (Outbound)'"
            @click="toggleRelationInversion(index)"
          >
            <v-icon>{{ rel.isInverted ? 'mdi-swap-horizontal-bold' : 'mdi-arrow-right-bold' }}</v-icon>
          </v-btn>


          <!-- Dynamic Object Field: Select for Enums, Autocomplete for Graph -->
          <v-select
            v-if="shouldUsePredicateOptions(rel)"
            :model-value="getRelationTargetUri(rel)"
            :items="getRelationTargetItems(rel)"
            item-title="uri"
            item-value="uri"
            :label="rel.isInverted ? 'Subject Value' : 'Object Value'"
            placeholder="Select option..."
            variant="plain"
            density="compact"
            hide-details
            class="flex-grow-1 px-3"
            clearable
            @update:model-value="(val: any) => { setRelationTargetUri(rel, val); fetchResources(true); }"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
            </template>
          </v-select>

          <v-autocomplete
            v-else
            :model-value="getRelationTargetUri(rel)"
            v-model:search="uriSearch"
            :items="uriResults"
            item-title="uri"
            item-value="uri"
            :label="rel.isInverted ? 'Subject URI' : 'Object URI'"
            placeholder="Search..."
            variant="plain"
            density="compact"
            hide-details
            class="flex-grow-1 px-3"
            @update:model-value="(val: any) => { setRelationTargetUri(rel, val); fetchResources(true); }"
            @update:search="searchObjects"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
            </template>
          </v-autocomplete>



          <v-btn icon="mdi-close" size="x-small" variant="text" color="error" class="opacity-40" @click="removeRelationFilter(index)"></v-btn>
        </div>
      </div>
    </div>


    <!-- Resource Explorer -->
    <div v-if="viewModeReady && resources.length > 0">
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
    <div v-else-if="!loading" class="text-center py-16 opacity-30">
      <v-icon size="120" class="mb-4">mdi-database-search-outline</v-icon>
      <div class="text-h5 font-weight-light">No resources found matching your trajectory.</div>
    </div>

    <!-- Loading State (initial empty load only) -->
    <v-row v-if="loading && resources.length === 0">
      <v-col v-for="i in 6" :key="i" cols="12" md="6" lg="4">
        <v-skeleton-loader type="article" class="rounded-xl"></v-skeleton-loader>
      </v-col>
    </v-row>

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

function hydrateViewMode() {
  const stored = localStorage.getItem('resources_view_mode')
  viewMode.value = stored === 'table' ? 'table' : 'cards'
  viewModeReady.value = true
}

function persistViewMode(value: string) {
  const normalized: 'cards' | 'table' = value === 'table' ? 'table' : 'cards'
  viewMode.value = normalized
  localStorage.setItem('resources_view_mode', normalized)
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

const uriSearch = ref('')
const predicateSearch = ref('')
const uriResults = ref<any[]>([])
const predicateResults = ref<any[]>([])
const defaultUriResults = ref<any[]>([])
const defaultPredicateResults = ref<any[]>([])
const predicateOptions = ref<Record<string, any[]>>({})
const predicateRelationRows = ref<Record<string, any[]>>({})
const editingResourceId = ref<number | null>(null)
const editDraft = ref({ uri: '', title: '' })

async function fetchPredicateOptions(predicateUri: string) {
  if (!predicateUri || predicateRelationRows.value[predicateUri]) return
  
  const predicateResource = await graphql(`
    query($uri: String!) {
      resourceByUri(uri: $uri) {
        id
      }
    }
  `, { uri: predicateUri })

  const predicateId = predicateResource?.resourceByUri?.id
  if (!predicateId) {
    predicateRelationRows.value[predicateUri] = []
    return
  }

  const data = await graphql(`
    query($predicateId: Int!) {
      relations(predicateId: $predicateId, take: 200) {
        subject { uri title }
        object { uri title }
      }
    }
  `, { predicateId })
  
  if (data?.relations) {
    predicateRelationRows.value[predicateUri] = data.relations
  }
}

async function searchObjects(val: string) {
  if (!val || val.length < 2) {
    uriResults.value = defaultUriResults.value
    return
  }
  const data = await graphql(`
    query($search: String) {
      queryResources(filter: { search: $search }, take: 10) {
        items { uri title }
      }
    }
  `, { search: val })
  uriResults.value = data?.queryResources?.items || []
}

async function searchPredicates(val: string) {
  if (!val || val.length < 2) {
    predicateResults.value = defaultPredicateResults.value
    return
  }
  const data = await graphql(`
    query($search: String) {
      queryResources(filter: { search: $search, isPredicate: true }, take: 10) {
        items { uri title }
      }
    }
  `, { search: val })
  predicateResults.value = data?.queryResources?.items || []
}

async function preloadRelationFilterData() {
  const [defaultUris, defaultPredicates] = await Promise.all([
    graphql(`
      query {
        queryResources(take: 20) {
          items { uri title }
        }
      }
    `),
    graphql(`
      query {
        queryResources(filter: { isPredicate: true }, take: 20) {
          items { uri title }
        }
      }
    `),
  ])

  defaultUriResults.value = defaultUris?.queryResources?.items || []
  defaultPredicateResults.value = defaultPredicates?.queryResources?.items || []

  // Keep initial relation filters populated before typing.
  uriResults.value = defaultUriResults.value
  predicateResults.value = defaultPredicateResults.value
}

watch(uriSearch, (val) => {
  searchObjects(val)
})

watch(predicateSearch, (val) => {
  searchPredicates(val)
})

function addRelationFilter() {
  filters.value.relations.push({ predicateUri: '', objectUri: '', subjectUri: '', isInverted: false })
}

function isObjectSidePredicate(predicateUri: string) {
  return ['schema:about', 'rdf:type', 'prop:status', 'prop:allows_value', 'prop:inLanguage'].includes(predicateUri)
}

function removeRelationFilter(index: number) {
  filters.value.relations.splice(index, 1)
  fetchResources(true)
}

function toggleRelationInversion(index: number) {
  const rel = filters.value.relations[index]
  if (isObjectSidePredicate(rel.predicateUri)) {
    rel.isInverted = false
    return
  }
  rel.isInverted = !rel.isInverted
  // Swap values if needed or just clear to be safe
  if (rel.isInverted) {
    rel.subjectUri = rel.objectUri
    rel.objectUri = ''
  } else {
    rel.objectUri = rel.subjectUri
    rel.subjectUri = ''
  }
  fetchResources(true)
}

function getRelationTargetUri(rel: { objectUri: string; subjectUri: string; isInverted: boolean }) {
  return rel.isInverted ? rel.subjectUri : rel.objectUri
}

function setRelationTargetUri(rel: { objectUri: string; subjectUri: string; isInverted: boolean }, value: string) {
  if (rel.isInverted) {
    rel.subjectUri = value || ''
  } else {
    rel.objectUri = value || ''
  }
}

function getRelationTargetItems(rel: { predicateUri: string; isInverted: boolean }) {
  const rows = predicateRelationRows.value[rel.predicateUri] || []
  const items = rows.map((relation: any) => rel.isInverted ? relation.subject : relation.object).filter(Boolean)
  const seen = new Set<string>()
  return items.filter((item: any) => {
    if (!item?.uri || item.uri === 'type:predicate') return false
    if (seen.has(item.uri)) return false
    seen.add(item.uri)
    return true
  })
}

function hasUsefulPredicateOptions(predicateUri: string) {
  return (predicateRelationRows.value[predicateUri] || []).length > 0
}

function shouldUsePredicateOptions(rel: { predicateUri: string; isInverted: boolean }) {
  return hasUsefulPredicateOptions(rel.predicateUri)
}

function getRelationPayloadTargetUri(rel: { predicateUri: string; subjectUri: string; objectUri: string; isInverted: boolean }) {
  return rel.isInverted
    ? (rel.subjectUri || rel.objectUri || undefined)
    : (rel.objectUri || rel.subjectUri || undefined)
}


onMounted(() => {
  hydrateViewMode()
  preloadRelationFilterData()
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
</script>

<style scoped>
.bg-space {
  background-color: #050505;
  min-height: 100vh;
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
