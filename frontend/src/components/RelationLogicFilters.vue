<template>
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
      <div 
        v-for="(rel, index) in localRelations" 
        :key="index" 
        class="d-flex align-center ga-3 animate-fade-in pa-2 rounded-lg border border-white border-opacity-5 bg-black bg-opacity-40 transition-all hover-bg-opacity-50"
      >
        <!-- Predicate Auto-Complete -->
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
          @update:model-value="(val: any) => onPredicateChanged(rel, val)"
          @update:search="searchPredicates"
        >
          <template v-slot:item="{ props, item }">
            <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
          </template>
        </v-autocomplete>

        <!-- Inversion Toggle -->
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

        <!-- Dynamic Target Field: Select for Enums, Autocomplete for Graph -->
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
          @update:model-value="(val: any) => onTargetChanged(rel, val)"
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
          @update:model-value="(val: any) => onTargetChanged(rel, val)"
          @update:search="searchObjects"
        >
          <template v-slot:item="{ props, item }">
            <v-list-item v-bind="props" :title="item.raw.title" :subtitle="item.raw.uri"></v-list-item>
          </template>
        </v-autocomplete>

        <!-- Remove Filter -->
        <v-btn 
          icon="mdi-close" 
          size="x-small" 
          variant="text" 
          color="error" 
          class="opacity-40" 
          @click="removeRelationFilter(index)"
        ></v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { graphql } from '../composables/useGraphql'

interface RelationFilter {
  predicateUri: string;
  objectUri: string;
  subjectUri: string;
  isInverted: boolean;
}

const props = defineProps<{
  modelValue: RelationFilter[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: RelationFilter[]): void
  (e: 'change'): void
}>()

const localRelations = ref<RelationFilter[]>([])

watch(() => props.modelValue, (newVal) => {
  localRelations.value = newVal.map(rel => ({ ...rel }))
}, { deep: true, immediate: true })

const uriSearch = ref('')
const predicateSearch = ref('')
const uriResults = ref<any[]>([])
const predicateResults = ref<any[]>([])
const defaultUriResults = ref<any[]>([])
const defaultPredicateResults = ref<any[]>([])
const predicateRelationRows = ref<Record<string, any[]>>({})

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

  uriResults.value = defaultUriResults.value
  predicateResults.value = defaultPredicateResults.value
}

function addRelationFilter() {
  localRelations.value.push({ predicateUri: '', objectUri: '', subjectUri: '', isInverted: false })
  emit('update:modelValue', localRelations.value)
}

function removeRelationFilter(index: number) {
  localRelations.value.splice(index, 1)
  emit('update:modelValue', localRelations.value)
  emit('change')
}

function isObjectSidePredicate(predicateUri: string) {
  return ['schema:about', 'rdf:type', 'prop:status', 'prop:allows_value', 'prop:inLanguage'].includes(predicateUri)
}

function toggleRelationInversion(index: number) {
  const rel = localRelations.value[index]
  if (isObjectSidePredicate(rel.predicateUri)) {
    rel.isInverted = false
    return
  }
  rel.isInverted = !rel.isInverted
  if (rel.isInverted) {
    rel.subjectUri = rel.objectUri
    rel.objectUri = ''
  } else {
    rel.objectUri = rel.subjectUri
    rel.subjectUri = ''
  }
  emit('update:modelValue', localRelations.value)
  emit('change')
}

function getRelationTargetUri(rel: RelationFilter) {
  return rel.isInverted ? rel.subjectUri : rel.objectUri
}

function setRelationTargetUri(rel: RelationFilter, value: string) {
  if (rel.isInverted) {
    rel.subjectUri = value || ''
  } else {
    rel.objectUri = value || ''
  }
}

function getRelationTargetItems(rel: RelationFilter) {
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

function shouldUsePredicateOptions(rel: RelationFilter) {
  return hasUsefulPredicateOptions(rel.predicateUri)
}

function onPredicateChanged(rel: RelationFilter, val: string) {
  fetchPredicateOptions(val)
  emit('update:modelValue', localRelations.value)
  emit('change')
}

function onTargetChanged(rel: RelationFilter, val: string) {
  setRelationTargetUri(rel, val)
  emit('update:modelValue', localRelations.value)
  emit('change')
}

onMounted(() => {
  preloadRelationFilterData()
})
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
