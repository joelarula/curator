import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import TrackTable from '../components/TrackTable.vue';
import ProgramSummary from '../components/ProgramSummary.vue';
import ProgramDetail from '../components/ProgramDetail.vue';
import EpisodeDetail from '../components/EpisodeDetail.vue';
import PlaylistManager from '../components/PlaylistManager.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'songs', component: TrackTable, meta: { label: '🎵 Songs & Airings' } },
  { path: '/summary', name: 'summary', component: ProgramSummary, meta: { label: '📊 Program Summary' } },
  { path: '/program/:id', name: 'program-detail', component: ProgramDetail, meta: { label: '📻 Program' } },
  { path: '/episode/:id', name: 'episode-detail', component: EpisodeDetail, meta: { label: '🎙 Episode' } },
  { path: '/playlists', name: 'playlists', component: PlaylistManager, meta: { label: '📋 Playlists' } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
