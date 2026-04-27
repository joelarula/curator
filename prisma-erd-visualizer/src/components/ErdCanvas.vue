<script setup lang="ts">
import { ref, onMounted, markRaw } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import ErdNode from './ErdNode.vue'
import EntityDialog from './EntityDialog.vue'
import rawSchemaData from '../assets/schema-dmmf.json'
import { getLayoutedElements } from '../utils/layout'

const schemaData = rawSchemaData as any

const { onPaneReady, fitView, onNodeDoubleClick } = useVueFlow()

const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const selectedEntity = ref<any>(null)
const isDialogOpen = ref(false)

const nodeTypes = {
  erd: markRaw(ErdNode) as any,
}

onMounted(() => {
  const models = schemaData.datamodel.models
  const initialNodes: any[] = []
  const initialEdges: any[] = []

  models.forEach((model) => {
    initialNodes.push({
      id: model.name,
      type: 'erd',
      data: {
        name: model.name,
        fields: model.fields.map((f: any) => ({
          name: f.name,
          type: f.type,
          kind: f.kind,
          isId: f.isId,
        })),
      },
      position: { x: 0, y: 0 },
    })

    model.fields.forEach((field: any) => {
      if (field.kind === 'object' && field.relationName) {
        // To avoid duplicate edges for the same relation, we can use a unique key
        // But for simplicity, we'll just add it if it's the 'source' side
        if (field.relationFromFields && field.relationFromFields.length > 0) {
          initialEdges.push({
            id: `e-${model.name}-${field.type}-${field.relationName}`,
            source: model.name,
            target: field.type,
            label: field.name,
            animated: true,
            style: { stroke: '#6272a4', strokeWidth: 2 },
          })
        }
      }
    })
  })

  const layouted = getLayoutedElements(initialNodes, initialEdges)
  console.log('Nodes generated:', initialNodes.length)
  console.log('Edges generated:', initialEdges.length)
  nodes.value = layouted.nodes
  edges.value = layouted.edges
})

onPaneReady(() => {
  fitView()
})

onNodeDoubleClick((event) => {
  const modelName = event.node.id
  const model = schemaData.datamodel.models.find((m: any) => m.name === modelName)
  if (model) {
    selectedEntity.value = {
      name: model.name,
      fields: model.fields.map((f: any) => ({
        name: f.name,
        type: f.type,
        kind: f.kind,
        isId: f.isId,
      })),
    }
    isDialogOpen.value = true
  }
})
</script>

<template>
  <div class="canvas-container">
    <VueFlow :nodes="nodes" :edges="edges" :node-types="nodeTypes" :fit-view-on-init="true">
      <Background pattern-color="#44475a" :gap="20" />
      <Controls />
    </VueFlow>

    <EntityDialog :model="selectedEntity" :is-open="isDialogOpen" @close="isDialogOpen = false" />
  </div>
</template>

<style scoped>
.canvas-container {
  height: 100vh;
  width: 100vw;
  background: #282a36;
}
</style>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';

.vue-flow__node-erd {
  padding: 0;
  border: none;
  background: transparent;
}

.vue-flow__handle {
  width: 8px;
  height: 8px;
  background: #6272a4;
}

.vue-flow__edge-path {
  stroke-width: 2;
}

.vue-flow__edge-label {
  background: #44475a;
  color: #f8f8f2;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 10px;
}
</style>
