/**
 * TenderPro — Vue Router
 */
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
  },
  {
    path: '/vergaben',
    name: 'vergaben',
    component: () => import('../views/VergabenListView.vue'),
  },
  {
    path: '/advisor',
    name: 'advisor',
    component: () => import('../views/AdvisorView.vue'),
  },
  {
    path: '/vergaben/:id',
    name: 'vergabe-detail',
    component: () => import('../views/VergabeDetailView.vue'),
    props: true,
  },
  {
    path: '/freigaben',
    name: 'freigaben',
    component: () => import('../views/FreigabenView.vue'),
  },
  {
    path: '/fristenrechner',
    name: 'fristenrechner',
    component: () => import('../views/FristenrechnerView.vue'),
  },
  {
    path: '/einstellungen',
    name: 'einstellungen',
    component: () => import('../views/EinstellungenView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Auth Guard
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
})

export default router
