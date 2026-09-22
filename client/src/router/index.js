import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from '../api';
import Layout from '../components/Layout.vue';

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  {
    path: '/',
    component: Layout,
    children: [
      { path: '', redirect: '/pos' },
      { path: 'pos', name: 'pos', component: () => import('../views/PosView.vue') },
      { path: 'products', name: 'products', component: () => import('../views/ProductsView.vue') },
      { path: 'inventory', name: 'inventory', component: () => import('../views/InventoryView.vue') },
      { path: 'orders', name: 'orders', component: () => import('../views/OrdersView.vue') },
      { path: 'customers', name: 'customers', component: () => import('../views/CustomersView.vue') },
      { path: 'reports', name: 'reports', component: () => import('../views/ReportsView.vue') },
      { path: 'settings', name: 'settings', component: () => import('../views/SettingsView.vue') }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to) => {
  const authed = Boolean(getToken());
  if (!authed && to.name !== 'login') return { name: 'login' };
  if (authed && to.name === 'login') return { name: 'pos' };
  return true;
});

export default router;
