<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Search, Plus, Pencil, Trash2, Star, Users } from 'lucide-vue-next';
import { api, queryString } from '../api';
import { useToast } from '../composables/toast';
import AppModal from '../components/AppModal.vue';

const toast = useToast();

const customers = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const search = ref('');
const loading = ref(false);

const showForm = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = ref({ name: '', phone: '', level: '普通会员', points: 0, note: '' });

const showPoints = ref(false);
const pointsCustomer = ref(null);
const pointsForm = ref({ delta: 10, reason: '手动调整' });
const pointsSaving = ref(false);

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const totalPoints = computed(() => customers.value.reduce((sum, c) => sum + Number(c.points || 0), 0));

let timer = null;

async function fetchCustomers() {
  loading.value = true;
  try {
    const data = await api(`/customers${queryString({ search: search.value, page: page.value, pageSize })}`);
    customers.value = data.items;
    total.value = data.total;
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    page.value = 1;
    fetchCustomers();
  }, 250);
});

function openCreate() {
  editingId.value = null;
  form.value = { name: '', phone: '', level: '普通会员', points: 0, note: '' };
  showForm.value = true;
}

function openEdit(customer) {
  editingId.value = customer.id;
  form.value = {
    name: customer.name,
    phone: customer.phone,
    level: customer.level,
    points: customer.points,
    note: customer.note
  };
  showForm.value = true;
}

async function saveCustomer() {
  if (!form.value.name) {
    toast.error('请输入会员姓名');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await api(`/customers/${editingId.value}`, { method: 'PUT', body: form.value });
      toast.success('会员已更新');
    } else {
      await api('/customers', { method: 'POST', body: form.value });
      toast.success('会员已创建');
    }
    showForm.value = false;
    fetchCustomers();
  } catch (err) {
    toast.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function removeCustomer(customer) {
  if (!window.confirm(`确定删除会员「${customer.name}」吗？`)) return;
  try {
    await api(`/customers/${customer.id}`, { method: 'DELETE' });
    toast.success('会员已删除');
    fetchCustomers();
  } catch (err) {
    toast.error(err.message);
  }
}

function openPoints(customer) {
  pointsCustomer.value = customer;
  pointsForm.value = { delta: 10, reason: '手动调整' };
  showPoints.value = true;
}

async function savePoints() {
  if (!pointsCustomer.value) return;
  pointsSaving.value = true;
  try {
    const result = await api(`/customers/${pointsCustomer.value.id}/points`, {
      method: 'POST',
      body: pointsForm.value
    });
    toast.success(`积分已调整，当前 ${result.points}`);
    showPoints.value = false;
    fetchCustomers();
  } catch (err) {
    toast.error(err.message);
  } finally {
    pointsSaving.value = false;
  }
}

onMounted(fetchCustomers);
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>客户管理</h1>
        <div class="subtitle">会员档案与积分管理</div>
      </div>
      <button class="btn btn-primary" @click="openCreate"><Plus :size="16" /> 新增会员</button>
    </div>
    <div class="page-body">
      <div class="customer-stats">
        <div class="cs-item">
          <div class="cs-label">会员总数</div>
          <div class="cs-value">{{ total }}</div>
        </div>
        <div class="cs-item">
          <div class="cs-label">本页累计积分</div>
          <div class="cs-value">{{ totalPoints }}</div>
        </div>
      </div>
      <div class="toolbar">
        <div class="search-input">
          <Search :size="16" />
          <input v-model="search" placeholder="搜索姓名 / 手机号" />
        </div>
      </div>
      <div class="panel">
        <div v-if="loading" class="empty">正在加载...</div>
        <table v-else-if="customers.length">
          <thead>
            <tr>
              <th>姓名</th>
              <th>手机号</th>
              <th>等级</th>
              <th>积分</th>
              <th>备注</th>
              <th>注册时间</th>
              <th style="width: 190px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="customer in customers" :key="customer.id">
              <td>
                <div class="name-cell">
                  <div class="avatar">{{ customer.name.slice(0, 1) }}</div>
                  <strong>{{ customer.name }}</strong>
                </div>
              </td>
              <td class="mono">{{ customer.phone || '-' }}</td>
              <td><span class="badge badge-blue">{{ customer.level }}</span></td>
              <td>
                <span class="points-num"><Star :size="14" /> {{ customer.points }}</span>
              </td>
              <td>{{ customer.note || '-' }}</td>
              <td class="mono">{{ customer.created_at }}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-sm" @click="openPoints(customer)"><Star :size="14" /> 积分</button>
                  <button class="btn btn-sm" @click="openEdit(customer)"><Pencil :size="14" /> 编辑</button>
                  <button class="btn btn-sm" @click="removeCustomer(customer)"><Trash2 :size="14" /> 删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">
          <Users :size="32" />
          <div>暂无会员</div>
        </div>
        <div class="pagination">
          <span>第 {{ page }} / {{ pageCount }} 页</span>
          <button class="btn btn-sm" :disabled="page <= 1" @click="page--; fetchCustomers()">上一页</button>
          <button class="btn btn-sm" :disabled="page >= pageCount" @click="page++; fetchCustomers()">下一页</button>
        </div>
      </div>
    </div>

    <AppModal v-if="showForm" :title="editingId ? '编辑会员' : '新增会员'" @close="showForm = false">
      <div class="field-grid">
        <div class="field">
          <label>姓名 *</label>
          <input v-model="form.name" placeholder="会员姓名" />
        </div>
        <div class="field">
          <label>手机号</label>
          <input v-model="form.phone" placeholder="手机号" />
        </div>
        <div class="field">
          <label>等级</label>
          <select v-model="form.level">
            <option>普通会员</option>
            <option>银卡会员</option>
            <option>金卡会员</option>
            <option>钻石会员</option>
          </select>
        </div>
        <div class="field">
          <label>积分</label>
          <input type="number" min="0" v-model.number="form.points" />
        </div>
        <div class="field full">
          <label>备注</label>
          <textarea v-model="form.note" rows="3" placeholder="选填"></textarea>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="showForm = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="saveCustomer">保存</button>
      </template>
    </AppModal>

    <AppModal v-if="showPoints && pointsCustomer" title="调整积分" @close="showPoints = false">
      <div class="points-panel">
        <div class="points-customer">
          <div class="avatar large">{{ pointsCustomer.name.slice(0, 1) }}</div>
          <div>
            <div class="points-name">{{ pointsCustomer.name }}</div>
            <div class="points-level">{{ pointsCustomer.level }} · 当前 {{ pointsCustomer.points }} 积分</div>
          </div>
        </div>
        <div class="field">
          <label>积分变动</label>
          <input type="number" v-model.number="pointsForm.delta" />
          <div class="field-hint">正数增加，负数扣减，结果不会低于 0</div>
        </div>
        <div class="field">
          <label>原因</label>
          <input v-model="pointsForm.reason" placeholder="选填" />
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="showPoints = false">取消</button>
        <button class="btn btn-primary" :disabled="pointsSaving" @click="savePoints">确认调整</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.customer-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.cs-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 18px;
  min-width: 180px;
}

.cs-label {
  font-size: 12px;
  color: var(--muted);
}

.cs-value {
  font-size: 20px;
  font-weight: 700;
  margin-top: 2px;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #dbeafe;
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
}

.avatar.large {
  width: 42px;
  height: 42px;
  font-size: 16px;
}

.mono {
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  font-size: 12px;
}

.points-num {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 700;
  color: var(--warning);
}

.row-actions {
  display: flex;
  gap: 5px;
}

.full {
  grid-column: 1 / -1;
}

.points-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.points-customer {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 12px;
}

.points-name {
  font-weight: 650;
}

.points-level {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}

.field-hint {
  font-size: 12px;
  color: var(--muted);
}
</style>
