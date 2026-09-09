import { createRouter, createWebHistory } from 'vue-router';
import TrackTable from '../components/TrackTable.vue';
import ProgramSummary from '../components/ProgramSummary.vue';
import PlaylistManager from '../components/PlaylistManager.vue';
import AgentManager from '../components/AgentManager.vue';

const routes = [
  { path: '/', name: 'songs', component: TrackTable, meta: { label: '🎵 Songs & Airings' } },
  { path: '/summary', name: 'summary', component: ProgramSummary, meta: { label: '📊 Program Summary' } },
  { path: '/playlists', name: 'playlists', component: PlaylistManager, meta: { label: '📋 Playlists' } },
  { path: '/agents', name: 'agents', component: AgentManager, meta: { label: '🤖 Program Agents' } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
