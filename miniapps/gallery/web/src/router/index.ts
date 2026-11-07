import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import PaintingDetailView from '../views/PaintingDetailView.vue';
import AdminView from '../views/AdminView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/category/:categoryLink',
      name: 'category',
      component: HomeView,
    },
    {
      path: '/author/:authorKey',
      name: 'author',
      component: HomeView,
    },
    {
      path: '/painting/:itemLink',
      name: 'painting-detail',
      component: PaintingDetailView,
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
    },
    {
      path: '/curator',
      redirect: '/admin',
    },
  ],
});

export default router;

