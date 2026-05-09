<template>
  <v-container fluid class="pa-0 fill-height bg-grey-darken-4 overflow-hidden">
    <!-- Header Overlay -->
    <div class="header-overlay px-6 py-4">
      <h1 class="text-h4 font-weight-bold text-gradient mb-1">Knowledge Graph</h1>
      <p class="text-subtitle-2 text-grey-lighten-1">Exploring {{ nodes.length }} entities and {{ links.length }} relations</p>
    </div>

    <!-- Graph Canvas Container -->
    <div ref="graphContainer" class="graph-container"></div>

    <!-- Sidebar Controls -->
    <v-fade-transition>
      <div v-if="selectedNode" class="node-panel pa-6">
        <v-btn icon="mdi-close" variant="text" size="small" class="close-btn" @click="selectedNode = null"></v-btn>
        
        <v-chip size="x-small" color="primary" variant="flat" class="mb-2">{{ selectedNode.type || 'RESOURCE' }}</v-chip>
        <h2 class="text-h5 font-weight-bold mb-4">{{ selectedNode.title }}</h2>
        
        <div class="mb-6">
          <p class="text-caption text-grey mb-1">ID</p>
          <p class="text-body-2 font-mono">{{ selectedNode.id }}</p>
        </div>

        <v-btn block color="primary" variant="tonal" class="mb-2" :to="'/wiki/' + selectedNode.id">
          View in Wiki
        </v-btn>
      </div>
    </v-fade-transition>

    <!-- Bottom Controls -->
    <div class="controls-overlay pa-4">
      <v-btn-group variant="outlined" divided color="grey-lighten-2">
        <v-btn icon="mdi-refresh" @click="fetchData" :loading="loading"></v-btn>
        <v-btn icon="mdi-target" @click="resetCamera"></v-btn>
      </v-btn-group>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import ForceGraph from 'force-graph';

const KNOWLEDGE_GRAPH_QUERY = gql`
  query GetKnowledgeGraph($rootId: Int, $depth: Int) {
    knowledgeGraph(rootResourceId: $rootId, depth: $depth) {
      nodes {
        id
        title
        type
        val
      }
      links {
        source
        target
        label
      }
    }
  }
`;

const graphContainer = ref<HTMLElement | null>(null);
const nodes = ref<any[]>([]);
const links = ref<any[]>([]);
const selectedNode = ref<any>(null);
const loading = ref(false);

let graphInstance: any = null;

const { result, loading: queryLoading, refetch } = useQuery(KNOWLEDGE_GRAPH_QUERY, {
  depth: 2
});

watch(queryLoading, (val) => { loading.value = val; });

watch(result, (val) => {
  if (val?.knowledgeGraph) {
    nodes.value = val.knowledgeGraph.nodes;
    links.value = val.knowledgeGraph.links;
    updateGraph();
  }
});

const fetchData = () => {
  refetch();
};

const resetCamera = () => {
  graphInstance?.zoomToFit(400);
};

const updateGraph = () => {
  if (!graphContainer.value) return;

  if (!graphInstance) {
    graphInstance = ForceGraph()(graphContainer.value)
      .nodeId('id')
      .nodeLabel('title')
      .nodeAutoColorBy('type')
      .linkDirectionalArrowLength(3)
      .linkDirectionalArrowRelPos(1)
      .linkCurvature(0.2)
      .backgroundColor('#212121')
      .onNodeClick((node: any) => {
        selectedNode.value = node;
        graphInstance.centerAt(node.x, node.y, 400);
      })
      .nodeCanvasObject((node: any, ctx, globalScale) => {
        const label = node.title;
        const fontSize = 12 / globalScale;
        ctx.font = `${fontSize}px Inter, sans-serif`;
        const textWidth = ctx.measureText(label).width;
        const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

        // Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.val * 2, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Glow
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 10 / globalScale;

        if (globalScale > 2) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fillText(label, node.x - textWidth / 2, node.y + node.val * 2 + fontSize);
        }
      });
  }

  graphInstance.graphData({
    nodes: nodes.value,
    links: links.value
  });
};

onMounted(() => {
  window.addEventListener('resize', () => {
    graphInstance?.width(graphContainer.value?.clientWidth);
    graphInstance?.height(graphContainer.value?.clientHeight);
  });
});

onUnmounted(() => {
  graphInstance?._destructor?.();
});
</script>

<style scoped>
.graph-container {
  width: 100%;
  height: 100%;
}

.header-overlay {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  pointer-events: none;
}

.text-gradient {
  background: linear-gradient(135deg, #a78bfa 0%, #34d399 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.node-panel {
  position: absolute;
  top: 80px;
  right: 24px;
  width: 320px;
  background: rgba(30, 30, 30, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  z-index: 20;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.controls-overlay {
  position: absolute;
  bottom: 24px;
  left: 24px;
  z-index: 10;
}

.close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
}

.font-mono {
  font-family: 'JetBrains Mono', monospace;
}
</style>
