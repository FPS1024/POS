<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ScanLine,
  Package,
  Boxes,
  ReceiptText,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Store
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const settingsStore = useSettingsStore();

const navItems = [
  { path: '/pos', label: '收银台', icon: ScanLine },
  { path: '/products', label: '商品管理', icon: Package },
  { path: '/inventory', label: '库存管理', icon: Boxes },
  { path: '/orders', label: '订单管理', icon: ReceiptText },
  { path: '/customers', label: '客户管理', icon: Users },
  { path: '/reports', label: '数据报表', icon: BarChart3 },
  { path: '/settings', label: '系统设置', icon: Settings }
];

const activePath = computed(() => route.path);
const storeName = computed(() => settingsStore.settings.store_name || '超市 POS');

async function logout() {
  await auth.logout();
  router.push('/login');
}

onMounted(() => {
  auth.fetchMe();
  settingsStore.fetchSettings().catch(() => {});
});
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon"><Store :size="20" /></div>
        <div>
          <div class="brand-name">{{ storeName }}</div>
          <div class="brand-sub">收银管理系统</div>
        </div>
      </div>
      <nav class="nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: activePath === item.path }"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
      <div class="sidebar-foot">
        <div class="user-box">
          <div class="avatar">{{ auth.user?.name?.slice(0, 1) || '员' }}</div>
          <div class="user-meta">
            <div class="user-name">{{ auth.user?.name || '操作员' }}</div>
            <div class="user-role">{{ auth.user?.role === 'admin' ? '管理员' : '收银员' }}</div>
          </div>
          <button class="icon-btn" title="退出登录" @click="logout">
            <LogOut :size="16" />
          </button>
        </div>
      </div>
    </aside>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
}

.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background: #ffffff;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px 14px;
  border-bottom: 1px solid var(--border);
}

.brand-icon {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-name {
  font-weight: 700;
  font-size: 15px;
  line-height: 1.2;
}

.brand-sub {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}

.nav {
  flex: 1;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 7px;
  color: #42506a;
  text-decoration: none;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}

.nav-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.nav-item.active {
  background: var(--primary-weak);
  color: var(--primary);
  font-weight: 600;
}

.sidebar-foot {
  padding: 12px;
  border-top: 1px solid var(--border);
}

.user-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  background: var(--surface-2);
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #dbeafe;
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
}

.user-meta {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  color: var(--muted);
  font-size: 12px;
}

.main {
  flex: 1;
  min-width: 0;
  height: 100%;
}
</style>
