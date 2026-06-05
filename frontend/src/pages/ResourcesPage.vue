<template>
  <v-container fluid class="pa-8 bg-space">
    <!-- Header -->
    <div class="d-flex align-center mb-6">

      <div>
        <h2 class="text-h5 font-weight-black tracking-tighter uppercase mb-1">Resources</h2>


        <div class="text-caption text-grey font-weight-medium">NAVIGATING {{ totalCount }} RESOURCES</div>
      </div>
      <v-spacer></v-spacer>
      
      <v-btn-toggle
        v-model="viewMode"
        mandatory
        variant="tonal"
        color="primary"
        class="me-4 rounded-pill"
        density="compact"
      >
        <v-btn value="cards" icon="mdi-view-grid-outline"></v-btn>
        <v-btn value="table" icon="mdi-table-large"></v-btn>
      </v-btn-toggle>

      <v-btn color="primary" variant="flat" rounded="pill" prepend-icon="mdi-plus" size="large" class="px-6" @click="openEstablishResourceUI">

        New Resource
      </v-btn>
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
            v-if="predicateOptions[rel.predicateUri] && predicateOptions[rel.predicateUri].length > 0"
            v-model="rel.objectUri"
            :items="predicateOptions[rel.predicateUri]"
            item-title="uri"
            item-value="uri"
            label="Value"
            placeholder="Select option..."
            variant="plain"
            density="compact"
            hide-details
            class="flex-grow-1 px-3"
            clearable
            @update:model-value="fetchResources(true)"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
            </template>
          </v-select>

          <v-autocomplete
            v-else
            v-model="rel.objectUri"
            v-model:search="uriSearch"
            :items="uriResults"
            item-title="uri"
            item-value="uri"
            label="Object URI"
            placeholder="Search..."
            variant="plain"
            density="compact"
            hide-details
            class="flex-grow-1 px-3"
            @update:model-value="fetchResources(true)"
            @update:search="searchObjects"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
            </template>
          </v-autocomplete>



          <v-btn v-if="filters.relations.length > 2" icon="mdi-close" size="x-small" variant="text" color="error" class="opacity-40" @click="removeRelationFilter(index)"></v-btn>
          <div v-else style="width: 32px"></div>
        </div>
      </div>
    </div>


    <!-- Resource Explorer -->
    <div v-if="resources.length > 0">
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
                  <div class="text-caption font-weight-black opacity-30 tracking-widest truncate">{{ resource.uri }}</div>
                  <div class="text-h6 font-weight-black truncate">{{ resource.title || 'Untitled Resource' }}</div>
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
             <div class="text-caption font-weight-bold opacity-40 truncate" style="max-width: 200px;">{{ item.uri }}</div>
          </template>
          <template v-slot:item.title="{ item }">
             <div class="font-weight-black">{{ item.title || 'Untitled Resource' }}</div>
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

    <!-- Loading State -->
    <v-row v-if="loading">
      <v-col v-for="i in 6" :key="i" cols="12" md="6" lg="4">
        <v-skeleton-loader type="article" class="rounded-xl"></v-skeleton-loader>
      </v-col>
    </v-row>

    <!-- Pagination -->
    <div v-if="resources.length < totalCount" class="d-flex justify-center mt-12">
      <v-btn
        variant="outlined"
        rounded="pill"
        size="large"
        class="px-12"
        :loading="loading"
        @click="loadMore"
      >
        Expand View ({{ resources.length }} / {{ totalCount }})
      </v-btn>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { graphql } from '../composables/useGraphql'
import { openEstablishResource } from '../composables/useGlobalActions'
import { isExtensionContext } from '../composables/useEnv'

const router = useRouter()

const resources = ref<any[]>([])
const loading = ref(false)
const totalCount = ref(0)
const itemsPerPage = 21
const currentPage = ref(1)
const search = ref('')
const showFilters = ref(false)
const viewMode = ref<'cards' | 'table'>((localStorage.getItem('resources_view_mode') as any) || 'cards')

watch(viewMode, (val) => {
  localStorage.setItem('resources_view_mode', val)
})



const filters = ref({
  startDate: '',
  endDate: '',
  relations: [
    { predicateUri: '', objectUri: '', subjectUri: '', isInverted: false },
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
const predicateOptions = ref<Record<string, any[]>>({})

async function fetchPredicateOptions(predicateUri: string) {
  if (!predicateUri || predicateOptions.value[predicateUri]) return
  
  const data = await graphql(`
    query($predicate: String!) {
      queryResources(filter: { 
        relations: [
          { subjectUri: $predicate, predicateUri: "prop:allows_value" }
        ] 
      }, take: 50) {
        items { uri title }
      }
    }
  `, { predicate: predicateUri })
  
  if (data?.queryResources?.items) {
    predicateOptions.value[predicateUri] = data.queryResources.items
  }
}

async function searchObjects(val: string) {

  if (!val || val.length < 2) return
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
  if (!val || val.length < 2) return
  const data = await graphql(`
    query($search: String) {
      queryResources(filter: { search: $search, isPredicate: true }, take: 10) {
        items { uri title }
      }
    }
  `, { search: val })
  predicateResults.value = data?.queryResources?.items || []
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

function removeRelationFilter(index: number) {
  filters.value.relations.splice(index, 1)
  fetchResources(true)
}

function toggleRelationInversion(index: number) {
  const rel = filters.value.relations[index]
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


onMounted(() => {
  fetchResources()

  if (isExtensionContext()) {
    // Listen for background events (e.g. context menu adds a resource)
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'RESOURCE_ADDED') {
        fetchResources(true)
      }
    })
  }
})

async function fetchResources(reset = false) {
  if (reset) {
    currentPage.value = 1
    resources.value = []
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
              .filter(r => r.predicateUri || r.objectUri || r.subjectUri)
              .map(r => ({ 
                predicateUri: r.predicateUri || undefined, 
                objectUri: r.objectUri || undefined,
                subjectUri: r.subjectUri || undefined
              })) 
          : undefined,
        isPublished: filters.value.isPublished || undefined
      }

    })


    if (data?.queryResources) {
      if (reset) {
        resources.value = data.queryResources.items
      } else {
        resources.value.push(...data.queryResources.items)
      }
      totalCount.value = data.queryResources.totalCount
    }
  } finally {
    loading.value = false
  }
}

function loadMore() {
  currentPage.value++
  fetchResources()
}

function formatDate(val: string) {
  if (!val) return '—'
  const date = !isNaN(Number(val)) ? new Date(Number(val)) : new Date(val)
  return date.toLocaleDateString('et-EE', { day: '2-digit', month: 'short' })
}

function navigateToDetail(id: number) {
  router.push(`/resource/${id}`)
}

function openEstablishResourceUI() {
  openEstablishResource()
}

function triggerAgent(resource: any) {
  router.push(`/resource/${resource.id}?analyze=true`)
}


watch(filters, () => fetchResources(true), { deep: true })
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
