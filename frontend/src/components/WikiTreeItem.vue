<template>
  <v-list-group :value="node.materializedPath || node.path" v-model="isOpen" class="clean-group">
    <template v-slot:activator="{ props: groupProps }">
      <v-list-item
        v-bind="groupProps"
        :prepend-icon="isOpen ? 'mdi-folder-open-outline' : (hasChildren ? 'mdi-folder-outline' : 'mdi-file-outline')"
        :title="node.title || node.path"
        rounded="lg"
        class="mb-1 tree-item"
        :to="'/wiki/' + node.materializedPath"
        :active="isSelected"
        color="primary"
        density="compact"
      >
        <template v-slot:append v-if="!isOpen">
          <v-icon size="x-small" class="opacity-10">mdi-chevron-down</v-icon>
        </template>
      </v-list-item>
    </template>

    <!-- Children rendered only when open -->
    <div v-if="loading" class="ps-6 py-2">
      <v-progress-linear indeterminate color="primary" height="1" class="opacity-30"></v-progress-linear>
    </div>
    
    <div v-else class="ps-2 border-s border-white border-opacity-5 ms-3 child-container">
      <!-- Recursive Sub-items -->
      <WikiTreeItem
        v-for="child in children"
        :key="child.id"
        :node="child"
        :active-path-segments="activePathSegments"
      />
      
      <!-- Branching Anchor -->
      <v-list-item
        prepend-icon="mdi-plus"
        title="Establish sub-identity..."
        class="opacity-30 add-btn"
        density="compact"
        @click="openEstablishSource(node.id)"
      ></v-list-item>
    </div>
  </v-list-group>
</template>

<script setup lang="ts">
/**
 * WikiTreeItem.vue
 *
 * Recursive tree node component for the wiki sidebar navigation.
 *
 * Each node renders as a `<v-list-group>` that:
 *   - Shows a folder/file icon depending on whether it has children
 *     and whether it is currently open.
 *   - Is a `<router-link>` to `/wiki/<materializedPath>`.
 *   - Lazily fetches its children from the `wikiTree` query the first
 *     time it is opened (rather than loading the entire tree upfront).
 *   - Recursively renders `<WikiTreeItem>` for each child.
 *   - Shows an "Establish sub-identity..." ghost row at the bottom that
 *     calls `openEstablishSource(node.id)` to pre-fill the parent.
 *
 * Auto-expansion:
 *   `activePathSegments` (passed from WikiSidebar from the current route)
 *   is checked against `node.path`. If this node's segment is part of
 *   the active path, `isOpen` is set to true immediately, causing the
 *   correct branch to expand on page load.
 *
 * Props:
 *   node               — The Source object ({ id, path, materializedPath, title, _count })
 *   activePathSegments — Current URL path split into segments (e.g. ['science', 'ai'])
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { graphql } from '../composables/useGraphql'
import { openEstablishSource } from '../composables/useGlobalActions'
import WikiTreeItem from './WikiTreeItem.vue'

const props = defineProps<{
  node: any,
  activePathSegments: string[]
}>()

const router = useRouter()
const children = ref<any[]>([])
const loading = ref(false)
const isOpen = ref(false)

const isSelected = computed(() => {
    const nodePath = props.node.materializedPath || props.node.path
    const currentRoutePath = router.currentRoute.value.params.path
    const pathString = Array.isArray(currentRoutePath) ? currentRoutePath.join('/') : (currentRoutePath || '')
    return pathString === nodePath
})

// Check if this segment is part of the active path for auto-expansion
const shouldBeOpen = computed(() => {
    return props.activePathSegments.includes(props.node.path)
})

watch(isOpen, (isNowOpen) => {
    if (isNowOpen && children.value.length === 0 && hasChildren.value) {
        fetchChildren()
    }
})

watch(shouldBeOpen, (val) => {
    if (val) {
        isOpen.value = true
    }
}, { immediate: true })

const hasChildren = computed(() => props.node._count?.children > 0)

async function fetchChildren() {
  if (loading.value) return
  
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
    `, { parentId: props.node.id })
    
    if (data?.wikiTree) {
      children.value = data.wikiTree
    }
  } catch (e) {
    console.error(`Failed to fetch children for ${props.node.path}:`, e)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* Disable Vuetify's automatic nesting padding */
.clean-group :deep(.v-list-group__items .v-list-item) {
  padding-inline-start: 12px !important;
}

.tree-item :deep(.v-list-item__prepend) {
  margin-inline-end: 12px !important;
}

.tree-item :deep(.v-list-item-title) {
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.child-container {
  margin-top: 2px;
}

.add-btn {
  font-size: 0.75rem;
  min-height: 30px !important;
}

.add-btn :deep(.v-list-item__prepend) {
  margin-inline-end: 8px !important;
  opacity: 0.5;
}
</style>
