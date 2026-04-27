<template>
  <div class="text-metadata-editor pb-8">
    <div class="d-flex ga-4 mb-4">
      <v-select
        v-model="internalValue.language"
        :items="languages"
        label="Language"
        variant="solo-filled"
        hide-details
        density="comfortable"
        class="flex-grow-1"
      ></v-select>
      <v-checkbox
        v-model="internalValue.isPublished"
        label="Published"
        color="primary"
        density="compact"
        hide-details
        class="mt-1"
      ></v-checkbox>
    </div>

    <!-- Parent Source Selection (The main hierarchy) -->
    <v-autocomplete
      v-model="internalValue.parentId"
      :items="allSources"
      :loading="loadingSources"
      v-model:search="sourceSearch"
      label="Parent Identity / Source"
      variant="solo-filled"
      item-title="searchTitle"
      item-value="id"
      placeholder="Search for a parent node..."
      class="mb-4"
      clearable
      hide-details
    >
      <template v-slot:item="{ props, item }">
        <v-list-item v-bind="props" :subtitle="item.raw.materializedPath || item.raw.path"></v-list-item>
      </template>
    </v-autocomplete>

    <!-- Legacy Fragment Hierarchy (Keep for compatibility) -->
    <v-expansion-panels variant="accordion" class="mb-4">
      <v-expansion-panel elevation="0" class="transparent-panel">
        <v-expansion-panel-title class="text-caption font-weight-bold opacity-40 px-0">ADVANCED FRAGMENT HIERARCHY</v-expansion-panel-title>
        <v-expansion-panel-text class="px-0">
          <v-autocomplete
            v-model="internalValue.textParentId"
            :items="allTexts"
            :loading="loadingTexts"
            v-model:search="textSearch"
            label="Parent Text (Fragment of...)"
            variant="solo-filled"
            item-title="searchTitle"
            item-value="id"
            placeholder="Search for a specific text fragment..."
            clearable
            hide-details
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :subtitle="item.raw.content.slice(0, 100) + '...'"></v-list-item>
            </template>
          </v-autocomplete>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <v-text-field
      v-model="internalValue.path"
      label="Sub-path (Local Slug)"
      variant="solo-filled"
      prepend-inner-icon="mdi-identifier"
      class="mb-4"
      hide-details
      placeholder="e.g. quantum (No slashes needed)"
    ></v-text-field>

    <v-text-field
      v-model="internalValue.source.url"
      label="Origin URL (External Source)"
      variant="solo-filled"
      prepend-inner-icon="mdi-link"
      class="mb-4"
      hide-details
      placeholder="e.g. https://example.com/article"
    ></v-text-field>

    <!-- Tags Section -->
    <div class="mb-2 text-caption font-weight-bold opacity-60 uppercase tracking-widest">Tags</div>
    <div class="d-flex flex-wrap ga-2 mb-3 min-height-32">
      <v-chip
        v-for="(tag, idx) in internalValue.tags"
        :key="idx"
        size="small"
        closable
        color="secondary"
        variant="tonal"
        @click:close="removeTag(idx)"
      >
        {{ tag.name }}: {{ tag.value }}
      </v-chip>
      <div v-if="internalValue.tags.length === 0" class="text-caption opacity-30 italic">No tags added</div>
    </div>
    
    <div class="d-flex ga-2 align-center">
      <v-text-field
        v-model="inlineTag.name"
        label="Key"
        density="compact"
        variant="outlined"
        hide-details
        @keyup.enter="addTag"
      ></v-text-field>
      <v-text-field
        v-model="inlineTag.value"
        label="Value"
        density="compact"
        variant="outlined"
        hide-details
        @keyup.enter="addTag"
      ></v-text-field>
      <v-btn
        icon="mdi-plus"
        variant="tonal"
        size="small"
        color="primary"
        :disabled="!inlineTag.name"
        @click="addTag"
      ></v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TextMetadataEditor.vue
 *
 * Shared metadata panel used when creating or editing a Text/Source.
 * Rendered inside EstablishSourceDialog and the WikiPage editor.
 *
 * Fields managed:
 *   - Language selector (Estonian / English)
 *   - Published checkbox
 *   - Parent Identity / Source autocomplete — links this text to a parent
 *     Source node in the wiki hierarchy (sets `parentId` on the Source).
 *   - [Advanced] Parent Text autocomplete — legacy "fragment-of" relationship
 *     linking a Text to another Text (sets `textParentId`).
 *   - Local slug / sub-path field
 *   - Origin URL field (for texts extracted from external web sources)
 *   - Inline tag manager — key+value chip UI for attaching Tags
 *
 * Data loading:
 *   On mount, fetches the top-100 Sources and top-50 Texts from the server
 *   to populate the autocomplete lists. These are loaded once per component
 *   mount, not reactively re-fetched on search input.
 *
 * v-model contract:
 *   The entire form state is exposed as a single deep reactive object matching
 *   the WikiPageInput GraphQL type. Internal changes are immediately emitted
 *   to the parent via a deep watcher on `internalValue`.
 */
import { ref, watch, reactive, onMounted } from 'vue'
import { graphql } from '../composables/useGraphql'

const props = defineProps<{
  modelValue: {
    language: string
    isPublished: boolean
    textParentId?: string | null
    parentId?: string | null
    path?: string | null
    source: { url: string; [key: string]: any }
    tags: { name: string; value?: string | null }[]
  }
}>()

const emit = defineEmits(['update:modelValue'])

const internalValue = reactive({ ...props.modelValue })

// Parent Searching logic
const allTexts = ref<any[]>([])
const allSources = ref<any[]>([])
const loadingTexts = ref(false)
const loadingSources = ref(false)
const textSearch = ref('')
const sourceSearch = ref('')

async function fetchAllTexts() {
  loadingTexts.value = true
  const data = await graphql(`
    query($take: Int) {
      texts(take: $take) {
        items {
          id
          content
          originSource { id title path }
        }
      }
    }
  `, { take: 50 })
  if (data?.texts?.items) {
    allTexts.value = data.texts.items.map((t: any) => ({
      ...t,
      searchTitle: `${t.originSource.title || t.originSource.path}: ${t.content.slice(0, 30)}...`
    }))
  }
  loadingTexts.value = false
}

async function fetchAllSources() {
  loadingSources.value = true
  const data = await graphql(`
    query($take: Int) {
      sources(take: $take) {
        items {
          id
          title
          path
          materializedPath
        }
      }
    }
  `, { take: 100 })
  if (data?.sources?.items) {
    allSources.value = data.sources.items.map((s: any) => ({
      ...s,
      searchTitle: s.title || s.path || s.materializedPath
    }))
  }
  loadingSources.value = false
}

onMounted(() => {
  fetchAllTexts()
  fetchAllSources()
})

// Sync internal value with props
watch(() => props.modelValue, (newVal) => {
  Object.assign(internalValue, newVal)
}, { deep: true })

// Emit changes back to parent
watch(internalValue, (newVal) => {
  emit('update:modelValue', { ...newVal })
}, { deep: true })

const languages = [
  { title: 'Eesti (ET)', value: 'et' },
  { title: 'English (EN)', value: 'en' },
]

const inlineTag = ref({
  name: '',
  value: ''
})

function addTag() {
  if (!inlineTag.value.name) return
  internalValue.tags.push({ ...inlineTag.value })
  inlineTag.value = { name: '', value: '' }
}

function removeTag(idx: number) {
  internalValue.tags.splice(idx, 1)
}
</script>

<style scoped>
.min-height-32 {
  min-height: 32px;
}
.transparent-panel {
  background: transparent !important;
}
</style>
