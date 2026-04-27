import { createRouter, createWebHistory } from 'vue-router'
import TextsPage from '../pages/TextsPage.vue'
import WikiPage from '../pages/WikiPage.vue'
import FeedsPage from '../pages/FeedsPage.vue'
import SourceReviewPage from '../pages/SourceReviewPage.vue'
import GraphQLPage from '../pages/GraphQLPage.vue'

const routes = [
  { path: '/', name: 'texts', component: TextsPage }, // Unified Knowledge Studio
  { path: '/wiki/:path(.*)*', name: 'wiki', component: WikiPage },
  { path: '/feeds', name: 'feeds', component: FeedsPage },
  { path: '/source-review', name: 'source-review', component: SourceReviewPage },
  { path: '/graphql', name: 'graphql', component: GraphQLPage },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
