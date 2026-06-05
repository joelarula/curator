import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import ResourcesPage from '../pages/ResourcesPage.vue'
import ResourceDetailPage from '../pages/ResourceDetailPage.vue'
import AgentsPage from '../pages/AgentsPage.vue'
import GraphQLPage from '../pages/GraphQLPage.vue'
import GraphPage from '../pages/GraphPage.vue'
import { isExtensionContext } from '../composables/useEnv'

const routes = [
  { path: '/', name: 'resources', component: ResourcesPage },
  { path: '/resource/:id', name: 'resource-detail', component: ResourceDetailPage },
  { path: '/agents', name: 'agents', component: AgentsPage },
  { path: '/agents/:id', name: 'agent-detail', component: AgentsPage },
  { path: '/graph', name: 'graph', component: GraphPage },
  { path: '/graphql', name: 'graphql', component: GraphQLPage },
]



export const router = createRouter({
  history: isExtensionContext() ? createWebHashHistory() : createWebHistory(),
  routes,
})
