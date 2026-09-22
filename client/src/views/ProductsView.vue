<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Search, Plus, Pencil, Trash2, Upload, Download, Package } from 'lucide-vue-next';
import { api, queryString, getToken } from '../api';
import { useToast } from '../composables/toast';
import AppModal from '../components/AppModal.vue';

const toast = useToast();

const products = ref([]);
const categories = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const search = ref('');
const categoryId = ref('');
const stockFilter = ref('all');
const loading = ref(false);

const showForm = ref(false);
const editingId = ref(null);
const saving = ref(false);
const importInput = ref(null);
const form = ref({
  barcode: '',
  sku: '',
  name: '',
  category_id: '',
  unit: '件',
  cost_price: 0,
  sale_price: 0,
  stock: 0,
  low_stock: 5,
  active: 1
});

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

let timer = null;

async function fetchProducts() {
  loading.value = true;
  try {
    const params = {
      search: search.value,
      categoryId: categoryId.value,
      lowStock: stockFilter.value === 'low' ? 1 : '',
      active: stockFilter.value === 'active' ? 1 : stockFilter.value === 'inactive' ? 0 : '',
      page: page.value,
      pageSize
    };
    const data = await api(`/products${queryString(params)}`);
    products.value = data.items;
    total.value = data.total;
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function fetchCategories() {
  categories.value = await api('/categories');
}

watch([search, categoryId, stockFilter], () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    page.value = 1;
    fetchProducts();
  }, 250);
});

function openCreate() {
  editingId.value = null;
  form.value = {
    barcode: '',
    sku: '',
    name: '',
    category_id: '',
    unit: '件',
    cost_price: 0,
    sale_price: 0,
    stock: 0,
    low_stock: 5,
    active: 1
  };
  showForm.value = true;
}

function openEdit(product) {
  editingId.value = product.id;
  form.value = {
    barcode: product.barcode,
    sku: product.sku,
    name: product.name,
    category_id: product.category_id || '',
    unit: product.unit,
    cost_price: product.cost_price,
    sale_price: product.sale_price,
    stock: product.stock,
    low_stock: product.low_stock,
    active: product.active
  };
  showForm.value = true;
}

async function saveProduct() {
  if (!form.value.barcode || !form.value.name) {
    toast.error('条码和商品名称必填');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await api(`/products/${editingId.value}`, { method: 'PUT', body: form.value });
      toast.success('商品已更新');
    } else {
      await api('/products', { method: 'POST', body: form.value });
      toast.success('商品已创建');
    }
    showForm.value = false;
    fetchProducts();
  } catch (err) {
    toast.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function removeProduct(product) {
  if (!window.confirm(`确定删除商品「${product.name}」吗？`)) return;
  try {
    const result = await api(`/products/${product.id}`, { method: 'DELETE' });
    toast.success(result.disabled ? result.message : '商品已删除');
    fetchProducts();
  } catch (err) {
    toast.error(err.message);
  }
}

async function exportCsv() {
  try {
    const res = await fetch('/api/products/export', {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(err.message);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((c) => c !== '')) rows.push(row);
  }
  return rows;
}

const headerMap = {
  条码: 'barcode',
  barcode: 'barcode',
  SKU: 'sku',
  sku: 'sku',
  名称: 'name',
  name: 'name',
  分类: 'category_name',
  category: 'category_name',
  单位: 'unit',
  unit: 'unit',
  进价: 'cost_price',
  cost_price: 'cost_price',
  售价: 'sale_price',
  sale_price: 'sale_price',
  库存: 'stock',
  stock: 'stock',
  低库存阈值: 'low_stock',
  low_stock: 'low_stock'
};

async function importCsv(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    toast.error('CSV 内容为空');
    event.target.value = '';
    return;
  }
  const headers = rows[0].map((h) => headerMap[h.trim()] || null);
  const items = rows.slice(1).map((row) => {
    const item = {};
    headers.forEach((key, index) => {
      if (key) item[key] = row[index]?.trim() ?? '';
    });
    return item;
  }).filter((i) => i.barcode && i.name);
  try {
    const result = await api('/products/import', { method: 'POST', body: { items } });
    toast.success(`导入完成：新建 ${result.created}，更新 ${result.updated}，跳过 ${result.errors}`);
    fetchProducts();
    fetchCategories();
  } catch (err) {
    toast.error(err.message);
  } finally {
    event.target.value = '';
  }
}

onMounted(() => {
  fetchProducts();
  fetchCategories().catch(() => {});
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>商品管理</h1>
        <div class="subtitle">共 {{ total }} 个商品</div>
      </div>
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="search-input">
          <Search :size="16" />
          <input v-model="search" placeholder="搜索条码 / 名称 / SKU" />
        </div>
        <select v-model="categoryId">
          <option value="">全部分类</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
        <select v-model="stockFilter">
          <option value="all">全部状态</option>
          <option value="active">在售</option>
          <option value="inactive">停用</option>
          <option value="low">低库存</option>
        </select>
        <div class="spacer"></div>
        <input ref="importInput" type="file" accept=".csv,text/csv" hidden @change="importCsv" />
        <button class="btn" @click="importInput.click()"><Upload :size="16" /> 导入 CSV</button>
        <button class="btn" @click="exportCsv"><Download :size="16" /> 导出 CSV</button>
        <button class="btn btn-primary" @click="openCreate"><Plus :size="16" /> 新增商品</button>
      </div>

      <div class="panel">
        <div v-if="loading" class="empty">正在加载...</div>
        <table v-else-if="products.length">
          <thead>
            <tr>
              <th>条码</th>
              <th>商品名称</th>
              <th>分类</th>
              <th>单位</th>
              <th>进价</th>
              <th>售价</th>
              <th>库存</th>
              <th>预警值</th>
              <th>状态</th>
              <th style="width: 110px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in products" :key="product.id">
              <td class="mono">{{ product.barcode }}</td>
              <td>
                <div class="product-cell">
                  <span class="cell-dot" :style="{ background: product.category_color }"></span>
                  <div>
                    <div class="cell-name">{{ product.name }}</div>
                    <div class="cell-sku">{{ product.sku || '-' }}</div>
                  </div>
                </div>
              </td>
              <td>{{ product.category_name || '-' }}</td>
              <td>{{ product.unit }}</td>
              <td>{{ Number(product.cost_price).toFixed(2) }}</td>
              <td class="price">{{ Number(product.sale_price).toFixed(2) }}</td>
              <td>
                <span :class="['badge', product.stock <= product.low_stock ? 'badge-orange' : 'badge-green']">
                  {{ product.stock }}
                </span>
              </td>
              <td>{{ product.low_stock }}</td>
              <td>
                <span :class="['badge', product.active ? 'badge-green' : 'badge-gray']">
                  {{ product.active ? '在售' : '停用' }}
                </span>
              </td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-sm" @click="openEdit(product)"><Pencil :size="14" /> 编辑</button>
                  <button class="btn btn-sm" @click="removeProduct(product)"><Trash2 :size="14" /> 删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">
          <Package :size="32" />
          <div>暂无商品</div>
        </div>
        <div class="pagination">
          <span>第 {{ page }} / {{ pageCount }} 页</span>
          <button class="btn btn-sm" :disabled="page <= 1" @click="page--; fetchProducts()">上一页</button>
          <button class="btn btn-sm" :disabled="page >= pageCount" @click="page++; fetchProducts()">下一页</button>
        </div>
      </div>
    </div>

    <AppModal v-if="showForm" :title="editingId ? '编辑商品' : '新增商品'" wide @close="showForm = false">
      <div class="field-grid">
        <div class="field">
          <label>条码 *</label>
          <input v-model="form.barcode" placeholder="商品条码" />
        </div>
        <div class="field">
          <label>SKU</label>
          <input v-model="form.sku" placeholder="选填" />
        </div>
        <div class="field">
          <label>商品名称 *</label>
          <input v-model="form.name" placeholder="商品名称" />
        </div>
        <div class="field">
          <label>分类</label>
          <select v-model="form.category_id">
            <option value="">未分类</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>单位</label>
          <input v-model="form.unit" placeholder="件 / 袋 / 瓶" />
        </div>
        <div class="field">
          <label>进价</label>
          <input type="number" min="0" step="0.01" v-model.number="form.cost_price" />
        </div>
        <div class="field">
          <label>售价</label>
          <input type="number" min="0" step="0.01" v-model.number="form.sale_price" />
        </div>
        <div class="field">
          <label>当前库存</label>
          <input type="number" min="0" step="0.01" v-model.number="form.stock" />
        </div>
        <div class="field">
          <label>低库存预警值</label>
          <input type="number" min="0" step="0.01" v-model.number="form.low_stock" />
        </div>
        <div class="field">
          <label>状态</label>
          <select v-model.number="form.active">
            <option :value="1">在售</option>
            <option :value="0">停用</option>
          </select>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="showForm = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="saveProduct">保存</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.mono {
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  font-size: 12px;
}

.product-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}

.cell-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cell-name {
  font-weight: 600;
}

.cell-sku {
  font-size: 12px;
  color: var(--muted);
}

.price {
  font-weight: 700;
  color: var(--danger);
}

.row-actions {
  display: flex;
  gap: 6px;
}
</style>
