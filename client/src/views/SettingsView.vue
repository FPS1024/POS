<script setup>
import { onMounted, reactive, ref } from 'vue';
import { Save, UserPlus, Pencil, Trash2, ShieldCheck, Store, Settings } from 'lucide-vue-next';
import { api } from '../api';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';
import { useToast } from '../composables/toast';
import AppModal from '../components/AppModal.vue';

const toast = useToast();
const auth = useAuthStore();
const settingsStore = useSettingsStore();

const tab = ref('base');
const form = reactive({
  store_name: '',
  store_address: '',
  store_phone: '',
  tax_rate: 6,
  tax_enabled: true,
  currency: '¥',
  receipt_footer: '',
  points_rate: 10,
  points_enabled: true
});
const saving = ref(false);

const users = ref([]);
const showUserForm = ref(false);
const editingUser = ref(null);
const userSaving = ref(false);
const userForm = reactive({
  username: '',
  name: '',
  role: 'cashier',
  password: '',
  active: true
});

async function loadSettings() {
  await settingsStore.fetchSettings();
  const s = settingsStore.settings;
  form.store_name = s.store_name;
  form.store_address = s.store_address;
  form.store_phone = s.store_phone;
  form.tax_rate = Math.round(Number(s.tax_rate) * 100);
  form.tax_enabled = s.tax_enabled === '1';
  form.currency = s.currency;
  form.receipt_footer = s.receipt_footer;
  form.points_rate = Number(s.points_rate);
  form.points_enabled = s.points_enabled === '1';
}

async function saveSettings() {
  saving.value = true;
  try {
    await settingsStore.saveSettings({
      store_name: form.store_name,
      store_address: form.store_address,
      store_phone: form.store_phone,
      tax_rate: String((Number(form.tax_rate) || 0) / 100),
      tax_enabled: form.tax_enabled ? '1' : '0',
      currency: form.currency,
      receipt_footer: form.receipt_footer,
      points_rate: String(Number(form.points_rate) || 10),
      points_enabled: form.points_enabled ? '1' : '0'
    });
    toast.success('设置已保存');
  } catch (err) {
    toast.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function loadUsers() {
  if (!auth.isAdmin) return;
  try {
    users.value = await api('/settings/users');
  } catch (err) {
    toast.error(err.message);
  }
}

function openUserCreate() {
  editingUser.value = null;
  Object.assign(userForm, { username: '', name: '', role: 'cashier', password: '', active: true });
  showUserForm.value = true;
}

function openUserEdit(user) {
  editingUser.value = user;
  Object.assign(userForm, {
    username: user.username,
    name: user.name,
    role: user.role,
    password: '',
    active: Boolean(user.active)
  });
  showUserForm.value = true;
}

async function saveUser() {
  if (!userForm.username) {
    toast.error('请输入账号');
    return;
  }
  userSaving.value = true;
  try {
    if (editingUser.value) {
      await api(`/settings/users/${editingUser.value.id}`, { method: 'PUT', body: userForm });
      toast.success('用户已更新');
    } else {
      if (!userForm.password) {
        toast.error('请输入初始密码');
        return;
      }
      await api('/settings/users', { method: 'POST', body: userForm });
      toast.success('用户已创建');
    }
    showUserForm.value = false;
    loadUsers();
  } catch (err) {
    toast.error(err.message);
  } finally {
    userSaving.value = false;
  }
}

async function deleteUser(user) {
  if (!window.confirm(`确定删除用户「${user.name || user.username}」吗？`)) return;
  try {
    await api(`/settings/users/${user.id}`, { method: 'DELETE' });
    toast.success('用户已删除');
    loadUsers();
  } catch (err) {
    toast.error(err.message);
  }
}

onMounted(async () => {
  await loadSettings();
  await loadUsers();
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>系统设置</h1>
        <div class="subtitle">门店信息、计费规则与操作员账号</div>
      </div>
    </div>
    <div class="page-body">
      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'base' }" @click="tab = 'base'">
          <Store :size="16" /> 基础设置
        </button>
        <button v-if="auth.isAdmin" class="tab" :class="{ active: tab === 'users' }" @click="tab = 'users'">
          <ShieldCheck :size="16" /> 用户管理
        </button>
      </div>

      <div v-if="tab === 'base'" class="panel settings-panel">
        <div class="settings-section">
          <div class="section-title"><Store :size="16" /> 门店信息</div>
          <div class="field-grid">
            <div class="field">
              <label>门店名称</label>
              <input v-model="form.store_name" />
            </div>
            <div class="field">
              <label>联系电话</label>
              <input v-model="form.store_phone" />
            </div>
            <div class="field full">
              <label>门店地址</label>
              <input v-model="form.store_address" />
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="section-title"><Settings :size="16" /> 计费与会员规则</div>
          <div class="field-grid">
            <div class="field">
              <label>税率（%）</label>
              <input type="number" min="0" step="0.1" v-model.number="form.tax_rate" />
            </div>
            <div class="field">
              <label>币种符号</label>
              <input v-model="form.currency" maxlength="3" />
            </div>
            <div class="field">
              <label>积分规则（每消费多少元积 1 分）</label>
              <input type="number" min="1" v-model.number="form.points_rate" />
            </div>
            <div class="field">
              <label>积分启用</label>
              <div class="toggle-row">
                <label class="switch">
                  <input type="checkbox" v-model="form.points_enabled" />
                  <span class="slider"></span>
                </label>
                <span>{{ form.points_enabled ? '启用' : '停用' }}</span>
              </div>
            </div>
            <div class="field">
              <label>税费计入</label>
              <div class="toggle-row">
                <label class="switch">
                  <input type="checkbox" v-model="form.tax_enabled" />
                  <span class="slider"></span>
                </label>
                <span>{{ form.tax_enabled ? '启用' : '停用' }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="section-title">小票底部文案</div>
          <div class="field">
            <textarea v-model="form.receipt_footer" rows="2" placeholder="感谢惠顾，欢迎再次光临！"></textarea>
          </div>
        </div>

        <div class="settings-foot">
          <button class="btn btn-primary" :disabled="saving" @click="saveSettings">
            <Save :size="16" /> {{ saving ? '保存中...' : '保存设置' }}
          </button>
        </div>
      </div>

      <div v-else-if="tab === 'users'" class="panel settings-panel">
        <div class="panel-bar">
          <div class="panel-title">操作员账号</div>
          <button class="btn btn-primary" @click="openUserCreate"><UserPlus :size="16" /> 新增用户</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>账号</th>
              <th>姓名</th>
              <th>角色</th>
              <th>状态</th>
              <th>创建时间</th>
              <th style="width: 130px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td class="mono">{{ user.username }}</td>
              <td>{{ user.name || '-' }}</td>
              <td>
                <span :class="['badge', user.role === 'admin' ? 'badge-blue' : 'badge-gray']">
                  {{ user.role === 'admin' ? '管理员' : '收银员' }}
                </span>
              </td>
              <td>
                <span :class="['badge', user.active ? 'badge-green' : 'badge-red']">
                  {{ user.active ? '启用' : '停用' }}
                </span>
              </td>
              <td class="mono">{{ user.created_at }}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-sm" @click="openUserEdit(user)"><Pencil :size="14" /> 编辑</button>
                  <button class="btn btn-sm" @click="deleteUser(user)"><Trash2 :size="14" /> 删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <AppModal v-if="showUserForm" :title="editingUser ? '编辑用户' : '新增用户'" @close="showUserForm = false">
      <div class="field-grid">
        <div class="field">
          <label>账号 *</label>
          <input v-model="userForm.username" placeholder="登录账号" />
        </div>
        <div class="field">
          <label>姓名</label>
          <input v-model="userForm.name" placeholder="显示名称" />
        </div>
        <div class="field">
          <label>角色</label>
          <select v-model="userForm.role">
            <option value="cashier">收银员</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <div class="field">
          <label>{{ editingUser ? '重置密码（留空则不修改）' : '初始密码 *' }}</label>
          <input type="password" v-model="userForm.password" placeholder="至少 6 位" />
        </div>
        <div class="field">
          <label>状态</label>
          <div class="toggle-row">
            <label class="switch">
              <input type="checkbox" v-model="userForm.active" />
              <span class="slider"></span>
            </label>
            <span>{{ userForm.active ? '启用' : '停用' }}</span>
          </div>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="showUserForm = false">取消</button>
        <button class="btn btn-primary" :disabled="userSaving" @click="saveUser">保存</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 7px;
  padding: 9px 16px;
  color: var(--muted);
  font-weight: 500;
}

.tab.active {
  background: var(--primary-weak);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}

.settings-panel {
  max-width: 860px;
  padding: 6px 20px 16px;
}

.settings-section {
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 650;
  margin-bottom: 12px;
}

.full {
  grid-column: 1 / -1;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  color: var(--muted);
}

.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #c6cdd8;
  border-radius: 999px;
  transition: background 0.15s;
}

.slider::before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.15s;
}

.switch input:checked + .slider {
  background: var(--primary);
}

.switch input:checked + .slider::before {
  transform: translateX(18px);
}

.settings-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.panel-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
}

.panel-title {
  font-weight: 650;
}

.mono {
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  font-size: 12px;
}

.row-actions {
  display: flex;
  gap: 6px;
}
</style>
