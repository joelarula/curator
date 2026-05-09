<template>
  <div class="wiki-sidebar h-100 d-flex flex-column">
    <div class="pa-4 d-flex align-center justify-space-between">
      <span class="text-overline font-weight-black opacity-40 uppercase tracking-widest">Graph Index</span>
      <v-btn icon="mdi-plus" variant="text" size="x-small" color="primary" @click="openEstablishSource()"></v-btn>
    </div>

    <v-list density="compact" nav class="px-2 flex-grow-1 overflow-y-auto custom-scrollbar">
      <!-- Static Home Link -->
      <v-list-item
        prepend-icon="mdi-home-variant-outline"
        title="Wiki Home"
        to="/wiki/home"
        rounded="lg"
        class="mb-1"
        active-color="primary"
      ></v-list-item>

      <v-divider class="my-2 opacity-5 mx-2"></v-divider>

      <!-- Dynamic Tree - Direct Children of v-list -->
      <template v-if="rootNodes.length > 0">
        <WikiTreeItem
          v-for="node in rootNodes"
          :key="node.id"
          :node="node"
          :active-path-segments="currentPathSegments"
        />
      </template>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-6">
        <v-progress-circular indeterminate color="primary" size="24" width="2"></v-progress-circular>
      </div>

      <!-- Empty State -->
      <div v-if="!loading && rootNodes.length === 0" class="pa-4 text-center">
        <v-icon color="grey-darken-3" size="32" class="mb-2">mdi-molecule</v-icon>
        <div class="text-caption opacity-30 font-weight-light mb-4">No root identities established yet.</div>
        <v-btn
          variant="tonal"
          size="small"
          rounded="pill"
          prepend-icon="mdi-plus"
          class="text-caption"
          @click="openEstablishSource()"
        >
          Create First Root
        </v-btn>
      </div>
    </v-list>
  </div>
</template>

<script setup lang="ts">
/**
 * WikiSidebar.vue
 *
 * Persistent left-rail navigation tree for the Wiki knowledge graph.
 * Rendered inside App.vue and visible on all /wiki/* routes.
 *
 * Responsibilities:
 *   1. Fetches root-level wiki nodes (parentId = null) on mount via the
 *      `wikiTree` GraphQL query.
 *   2. Renders each root node as a `<WikiTreeItem>` which handles lazy
 *      child loading and recursive expansion.
 *   3. Tracks the active route path (`/wiki/a/b/c`) and passes the
 *      path segments down to WikiTreeItem so the correct nodes auto-expand.
 *   4. Provides `refreshWikiTree` via Vue's provide/inject so child
 *      components (e.g. WikiPage after saving) can trigger a sidebar reload
 *      without prop drilling.
 *
 * The "+" button in the header calls `openEstablishSource(null)` to create
 * a new top-level root page.
 */
import { ref, onMounted, provide, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { graphql } from '../composables/useGraphql'
import { openEstablishSource } from '../composables/useGlobalActions'
import WikiTreeItem from './WikiTreeItem.vue'

const router = useRouter()
const route = useRoute()
const rootNodes = ref<any[]>([])
const loading = ref(false)

const currentPathSegments = computed(() => {
  const path = route.params.path
  if (!path) return []
  return Array.isArray(path) ? path : path.split('/')
})

async function fetchRoot() {
  loading.value = true
  try {
    const data = await graphql(`
      query($parentId: ID) {
        wikiTree(parentId: $parentId) {
          id
          path
          materializedPath
          title
          _count { children }
        }
      }
    `, { parentId: null })
    
    if (data?.wikiTree) {
      rootNodes.value = data.wikiTree
    }
  } catch (e) {
    console.error('Failed to fetch Wiki Tree:', e)
  } finally {
    loading.value = false
  }
}

provide('refreshWikiTree', fetchRoot)
onMounted(fetchRoot)
</script>

<style scoped>
.wiki-sidebar {
  background-color: transparent;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}
</style>
