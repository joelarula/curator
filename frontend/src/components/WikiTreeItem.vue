<template>
  <v-list-group :value="node.id" v-model="isOpen" class="clean-group">
    <template v-slot:activator="{ props: groupProps }">
      <v-list-item
        v-bind="groupProps"
        :prepend-icon="isOpen ? 'mdi-folder-open-outline' : (hasChildren ? 'mdi-folder-outline' : 'mdi-file-outline')"
        :title="node.resource.title || node.resource.uri"
        rounded="lg"
        class="mb-1 tree-item"
        :to="'/resource/' + node.resource.id"
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
    </div>
  </v-list-group>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { graphql } from '../composables/useGraphql'
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
    return router.currentRoute.value.params.id === props.node.resource.id.toString()
})

const hasChildren = computed(() => (props.node.treeEnd - props.node.treeStart) > 1)

watch(isOpen, (isNowOpen) => {
    if (isNowOpen && children.value.length === 0 && hasChildren.value) {
        fetchChildren()
    }
})

async function fetchChildren() {
  if (loading.value) return
  
  loading.value = true
  try {
    const data = await graphql(`
      query($treeName: String!, $rootResourceId: Int) {
        resourceTree(treeName: $treeName, rootResourceId: $rootResourceId) {
          id
          resource { id title uri }
          depth
          treeStart
          treeEnd
        }
      }
    `, { treeName: 'MAIN', rootResourceId: props.node.resource.id })

    
    if (data?.resourceTree) {
      // The query returns the subtree INCLUDING the root, so we filter it out
      children.value = data.resourceTree.filter((c: any) => c.id !== props.node.id)
    }
  } catch (e) {
    console.error(`Failed to fetch children for ${props.node.id}:`, e)
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
