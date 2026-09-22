<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Store, User, Lock, LogIn } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../composables/toast';

const router = useRouter();
const auth = useAuthStore();
const toast = useToast();
const username = ref('admin');
const password = ref('admin123');
const loading = ref(false);

async function submit() {
  if (!username.value || !password.value) {
    toast.error('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    router.push('/pos');
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-panel">
      <div class="login-brand">
        <div class="login-logo"><Store :size="28" /></div>
        <div>
          <div class="login-title">超市收银 POS</div>
          <div class="login-sub">收银 · 库存 · 会员 · 报表</div>
        </div>
      </div>
      <form class="login-form" @submit.prevent="submit">
        <div class="field">
          <label>账号</label>
          <div class="login-input">
            <User :size="17" />
            <input v-model="username" autocomplete="username" placeholder="请输入账号" />
          </div>
        </div>
        <div class="field">
          <label>密码</label>
          <div class="login-input">
            <Lock :size="17" />
            <input v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" />
          </div>
        </div>
        <button class="btn btn-primary login-btn" type="submit" :disabled="loading">
          <LogIn :size="17" />
          {{ loading ? '登录中...' : '登录系统' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef2f7;
  padding: 20px;
}

.login-panel {
  width: 400px;
  max-width: 100%;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 34px 36px 30px;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
}

.login-logo {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-title {
  font-size: 22px;
  font-weight: 700;
}

.login-sub {
  color: var(--muted);
  font-size: 13px;
  margin-top: 3px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-input {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  padding: 0 11px;
  color: var(--muted);
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.login-input:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(31, 111, 235, 0.12);
}

.login-input input {
  flex: 1;
  border: none;
  box-shadow: none;
  padding: 11px 0;
  background: transparent;
}

.login-btn {
  height: 42px;
  margin-top: 6px;
  font-size: 15px;
}
</style>
