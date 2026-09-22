<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Plus, AlertTriangle, Boxes, Wallet, PackageOpen, Search } from 'lucide-vue-next';
import { api, queryString } from '../api';
import { useSettingsStore } from '../stores/settings';
import { useToast } from '../composables/toast';
import AppModal from '../components/AppModal.vue';

const toast = useToast();
const settingsStore = useSettingsStore();

const summary = ref({ total: 0, stockValue: 0, sellableValue: 0, lowStock: 0 });
const lowStockItems = ref([]);
const products = ref([]);
const movements = ref([]);
const movementTotal = ref(0);
const page = ref(1);
const pageSize = 50;
const typeFilter = ref('');
const productFilter = ref('');
const loading = ref(false);

const showAdjust = ref(false);
const saving = ref(false);
const adjust = ref({
  product_id: '',
  type: 'purchase',
  quantity: 1,
  reason: ''
});

const typeOptions = [
  { key: 'purchase', label: '采购入库' },
  { key: 'adjust_in', label: '盘点调增' },
  { key: 'gift', label: '赠送入库' },
  { key: 'adjust_out', label: '盘点调减' },
  { key: 'damage', label: '报损出库' },
  { key: 'loss', label: '损耗出库' }
];

const typeLabels = Object.fromEntries(typeOptions.map((t) => [t.key, t.label]));
typeLabels.sale = '销售出库';
typeLabels.refund = '退货入库';

const currency = computed(() => settingsStore.currency);
const selectedProduct = computed(() => products.value.find((p) => p.id === Number(adjust.value.product_id)));
const pageCount = computed(() => Math.max(1, Math.ceil(movementTotal.value / pageSize)));

async function fetchSummary() {
  summary.value = await api('/inventory/summary');
  lowStockItems.value = await api('/inventory/low-stock');
}

async function fetchMovements() {
  loading.value = true;
  try {
    const data = await api(`/inventory/movements${queryString({
      type: typeFilter.value,
      productId: productFilter.value,
      page: page.value,
      pageSize
    })}`);
    movements.value = data.items;
    movementTotal.value = data.total;
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function fetchProducts() {
  const data = await api(`/products${queryString({ active: 1, pageSize: 500 })}`);
  products.value = data.items;
}

watch([typeFilter, productFilter], () => {
  page.value = 1;
  fetchMovements();
});

function openAdjust() {
  adjust.value = { product_id: '', type: 'purchase', quantity: 1, reason: '' };
  showAdjust.value = true;
}

async function saveAdjust() {
  if (!adjust.value.product_id) {
    toast.error('请选择商品');
    return;
  }
  saving.value = true;
  try {
    const result = await api('/inventory/adjust', { method: 'POST', body: adjust.value });
    toast.success(`调整完成，${selectedProduct.value?.name} 库存 ${result.before} → ${result.after}`);
    showAdjust.value = false;
    await Promise.all([fetchSummary(), fetchMovements()]);
  } catch (err) {
    toast.error(err.message);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  settingsStore.fetchSettings().catch(() => {});
  Promise.all([fetchSummary(), fetchMovements(), fetchProducts()]).catch((err) => toast.error(err.message));
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>库存管理</h1>
        <div class="subtitle">库存调整、流水追踪与低库存预警</div>
      </div>
      <button class="btn btn-primary" @click="openAdjust"><Plus :size="16" /> 库存调整</button>
    </div>
    <div class="page-body">
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon blue"><Boxes :size="20" /></div>
          <div>
            <div class="kpi-label">在售商品</div>
            <div class="kpi-value">{{ summary.total }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon green"><Wallet :size="20" /></div>
          <div>
            <div class="kpi-label">库存成本</div>
            <div class="kpi-value">{{ currency }}{{ Number(summary.stockValue).toFixed(2) }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon purple"><PackageOpen :size="20" /></div>
          <div>
            <div class="kpi-label">可售金额</div>
            <div class="kpi-value">{{ currency }}{{ Number(summary.sellableValue).toFixed(2) }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon orange"><AlertTriangle :size="20" /></div>
          <div>
            <div class="kpi-label">低库存预警</div>
            <div class="kpi-value">{{ summary.lowStock }}</div>
          </div>
        </div>
      </div>

      <div class="inventory-grid">
        <section class="panel">
          <div class="panel-head">
            <div class="panel-title">库存流水</div>
            <div class="toolbar-inline">
              <select v-model="typeFilter">
                <option value="">全部类型</option>
                <option v-for="t in typeOptions" :key="t.key" :value="t.key">{{ t.label }}</option>
                <option value="sale">销售出库</option>
                <option value="refund">退货入库</option>
              </select>
              <select v-model="productFilter">
                <option value="">全部商品</option>
                <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
          </div>
          <div v-if="loading" class="empty">正在加载...</div>
          <table v-else>
            <thead>
              <tr>
                <th>时间</th>
                <th>商品</th>
                <th>类型</th>
                <th>变动</th>
                <th>调整后库存</th>
                <th>原因</th>
                <th>操作员</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in movements" :key="m.id">
                <td class="mono">{{ m.created_at }}</td>
                <td>
                  <div class="m-name">{{ m.product_name }}</div>
                  <div class="m-id">#{{ m.product_id }}</div>
                </td>
                <td>
                  <span :class="['badge', m.quantity > 0 ? 'badge-green' : 'badge-red']">
                    {{ typeLabels[m.type] || m.type }}
                  </span>
                </td>
                <td :class="['qty', m.quantity > 0 ? 'in' : 'out']">
                  {{ m.quantity > 0 ? '+' : '' }}{{ m.quantity }}
                </td>
                <td>{{ m.after_stock }}</td>
                <td>{{ m.reason || '-' }}</td>
                <td>{{ m.operator_name || '-' }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!loading && !movements.length" class="empty">暂无流水</div>
          <div class="pagination">
            <span>第 {{ page }} / {{ pageCount }} 页</span>
            <button class="btn btn-sm" :disabled="page <= 1" @click="page--; fetchMovements()">上一页</button>
            <button class="btn btn-sm" :disabled="page >= pageCount" @click="page++; fetchMovements()">下一页</button>
          </div>
        </section>

        <section class="panel low-panel">
          <div class="panel-head">
            <div class="panel-title warning-title">
              <AlertTriangle :size="16" />
              低库存商品
            </div>
            <span class="badge badge-orange">{{ lowStockItems.length }} 项</span>
          </div>
          <div v-if="!lowStockItems.length" class="empty">库存充足</div>
          <div v-else class="low-list">
            <div v-for="p in lowStockItems" :key="p.id" class="low-item">
              <div class="low-name">
                <span class="cell-dot" :style="{ background: p.category_color }"></span>
                <div>
                  <div>{{ p.name }}</div>
                  <div class="low-meta">{{ p.category_name || '未分类' }} · 预警 {{ p.low_stock }} {{ p.unit }}</div>
                </div>
              </div>
              <div class="low-stock-num" :class="{ zero: p.stock <= 0 }">
                {{ p.stock }} <span class="low-unit">{{ p.unit }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <AppModal v-if="showAdjust" title="库存调整" @close="showAdjust = false">
      <div class="adjust-form">
        <div class="field">
          <label>商品</label>
          <select v-model="adjust.product_id">
            <option value="">请选择商品</option>
            <option v-for="p in products" :key="p.id" :value="p.id">
              {{ p.name }}（库存 {{ p.stock }} {{ p.unit }}）
            </option>
          </select>
        </div>
        <div v-if="selectedProduct" class="current-stock">
          当前库存：<strong>{{ selectedProduct.stock }} {{ selectedProduct.unit }}</strong>
          <span v-if="selectedProduct.stock <= selectedProduct.low_stock" class="badge badge-orange">低库存</span>
        </div>
        <div class="field">
          <label>调整类型</label>
          <select v-model="adjust.type">
            <option v-for="t in typeOptions" :key="t.key" :value="t.key">{{ t.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>数量</label>
          <input type="number" min="1" v-model.number="adjust.quantity" />
        </div>
        <div class="field">
          <label>原因 / 备注</label>
          <textarea v-model="adjust.reason" rows="3" placeholder="选填，例如：供应商补货、盘点差异"></textarea>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="showAdjust = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="saveAdjust">确认调整</button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 14px 16px;
}

.kpi-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-icon.blue {
  background: var(--primary-weak);
  color: var(--primary);
}

.kpi-icon.green {
  background: var(--success-weak);
  color: var(--success);
}

.kpi-icon.purple {
  background: #f3e8ff;
  color: #9333ea;
}

.kpi-icon.orange {
  background: var(--warning-weak);
  color: var(--warning);
}

.kpi-label {
  font-size: 12px;
  color: var(--muted);
}

.kpi-value {
  font-size: 20px;
  font-weight: 700;
  margin-top: 2px;
}

.inventory-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 12px;
  align-items: start;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-weight: 650;
}

.warning-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--warning);
}

.toolbar-inline {
  display: flex;
  gap: 8px;
}

.toolbar-inline select {
  max-width: 220px;
}

.mono {
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  font-size: 12px;
}

.m-name {
  font-weight: 600;
}

.m-id {
  color: var(--muted);
  font-size: 12px;
}

.qty {
  font-weight: 700;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
}

.qty.in {
  color: var(--success);
}

.qty.out {
  color: var(--danger);
}

.low-panel {
  max-height: 620px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.low-list {
  overflow: auto;
  flex: 1;
}

.low-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.low-item:last-child {
  border-bottom: none;
}

.low-name {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  font-weight: 600;
  font-size: 13px;
}

.cell-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.low-meta {
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
  margin-top: 2px;
}

.low-stock-num {
  font-size: 18px;
  font-weight: 750;
  color: var(--warning);
  white-space: nowrap;
}

.low-stock-num.zero {
  color: var(--danger);
}

.low-unit {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}

.adjust-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.current-stock {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-2);
  border-radius: 7px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--muted);
}

.current-stock strong {
  color: var(--text);
}

@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .inventory-grid {
    grid-template-columns: 1fr;
  }
}
</style>
