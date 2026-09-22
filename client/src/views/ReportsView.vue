<script setup>
import { computed, onMounted, ref } from 'vue';
import { Banknote, ReceiptText, ShoppingCart, Undo2, PackageCheck, TrendingUp } from 'lucide-vue-next';
import { api, queryString } from '../api';
import { useSettingsStore } from '../stores/settings';
import { useToast } from '../composables/toast';
import ChartPanel from '../components/ChartPanel.vue';

const toast = useToast();
const settingsStore = useSettingsStore();

const preset = ref('7');
const from = ref('');
const to = ref('');
const loading = ref(false);

const summary = ref({ revenue: 0, orders: 0, avgOrder: 0, refunds: 0, itemsSold: 0 });
const trend = ref([]);
const topProducts = ref([]);
const categorySales = ref([]);

const currency = computed(() => settingsStore.currency);

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function applyPreset() {
  const t = today();
  if (preset.value === 'today') {
    from.value = t;
    to.value = t;
  } else if (preset.value === '7') {
    from.value = daysAgo(6);
    to.value = t;
  } else if (preset.value === '30') {
    from.value = daysAgo(29);
    to.value = t;
  }
  fetchAll();
}

function customRange() {
  preset.value = 'custom';
  if (from.value && to.value) fetchAll();
}

async function fetchAll() {
  if (!from.value || !to.value) return;
  loading.value = true;
  try {
    const params = { from: from.value, to: to.value };
    const [summaryData, trendData, topData, categoryData] = await Promise.all([
      api(`/stats/summary${queryString(params)}`),
      api(`/stats/trend${queryString({ ...params, days: 30 })}`),
      api(`/stats/top-products${queryString({ ...params, days: 30, limit: 8 })}`),
      api(`/stats/category-sales${queryString({ ...params, days: 30 })}`)
    ]);
    summary.value = summaryData;
    trend.value = trendData;
    topProducts.value = topData;
    categorySales.value = categoryData;
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

const trendLabels = computed(() => trend.value.map((t) => t.date.slice(5)));
const trendDatasets = computed(() => [
  {
    label: '营收',
    data: trend.value.map((t) => t.total),
    borderColor: '#1f6feb',
    backgroundColor: 'rgba(31, 111, 235, 0.12)',
    fill: true,
    tension: 0.35,
    yAxisID: 'y',
    pointRadius: 3
  },
  {
    label: '订单数',
    data: trend.value.map((t) => t.count),
    borderColor: '#0e9f6e',
    backgroundColor: 'rgba(14, 159, 110, 0.14)',
    fill: false,
    tension: 0.3,
    yAxisID: 'y1',
    pointRadius: 2
  }
]);

const categoryLabels = computed(() => categorySales.value.map((c) => c.name));
const categoryDatasets = computed(() => [{
  data: categorySales.value.map((c) => c.amount),
  backgroundColor: categorySales.value.map((c) => c.color),
  borderWidth: 2,
  borderColor: '#ffffff'
}]);

const topLabels = computed(() => topProducts.value.map((p) => p.product_name));
const topDatasets = computed(() => [{
  label: '销量',
  data: topProducts.value.map((p) => p.qty),
  backgroundColor: '#1f6feb',
  borderRadius: 4
}]);

const lineOptions = {
  plugins: {
    legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } }
  },
  scales: {
    y: {
      position: 'left',
      beginAtZero: true,
      ticks: { callback: (v) => `${currency.value}${v}` },
      grid: { color: '#eef1f5' }
    },
    y1: {
      position: 'right',
      beginAtZero: true,
      grid: { drawOnChartArea: false },
      ticks: { precision: 0 }
    }
  }
};

const doughnutOptions = {
  plugins: {
    legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } }
  },
  cutout: '62%'
};

const barOptions = {
  indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: {
    x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef1f5' } },
    y: { ticks: { autoSkip: false, font: { size: 11 } }, grid: { display: false } }
  }
};

onMounted(async () => {
  await settingsStore.fetchSettings().catch(() => {});
  applyPreset();
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>数据报表</h1>
        <div class="subtitle">销售概览、趋势与商品表现</div>
      </div>
      <div class="range-box">
        <div class="segmented">
          <button :class="{ active: preset === 'today' }" @click="preset = 'today'; applyPreset()">今天</button>
          <button :class="{ active: preset === '7' }" @click="preset = '7'; applyPreset()">近 7 天</button>
          <button :class="{ active: preset === '30' }" @click="preset = '30'; applyPreset()">近 30 天</button>
        </div>
        <input type="date" v-model="from" @change="customRange" />
        <span class="sep">至</span>
        <input type="date" v-model="to" @change="customRange" />
      </div>
    </div>
    <div class="page-body">
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon blue"><Banknote :size="20" /></div>
          <div>
            <div class="kpi-label">营业收入</div>
            <div class="kpi-value">{{ currency }}{{ Number(summary.revenue).toFixed(2) }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon green"><ReceiptText :size="20" /></div>
          <div>
            <div class="kpi-label">订单数</div>
            <div class="kpi-value">{{ summary.orders }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon purple"><ShoppingCart :size="20" /></div>
          <div>
            <div class="kpi-label">客单价</div>
            <div class="kpi-value">{{ currency }}{{ Number(summary.avgOrder).toFixed(2) }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon orange"><PackageCheck :size="20" /></div>
          <div>
            <div class="kpi-label">销售件数</div>
            <div class="kpi-value">{{ summary.itemsSold }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon red"><Undo2 :size="20" /></div>
          <div>
            <div class="kpi-label">退款金额</div>
            <div class="kpi-value">{{ currency }}{{ Number(summary.refunds).toFixed(2) }}</div>
          </div>
        </div>
      </div>

      <div class="report-grid">
        <section class="panel chart-card trend-card">
          <div class="card-head">
            <div class="card-title"><TrendingUp :size="16" /> 销售趋势</div>
            <span class="badge badge-blue">{{ from }} ~ {{ to }}</span>
          </div>
          <div v-if="loading" class="empty">正在加载...</div>
          <ChartPanel v-else type="line" :labels="trendLabels" :datasets="trendDatasets" :options="lineOptions" />
        </section>

        <section class="panel chart-card">
          <div class="card-head">
            <div class="card-title">品类销售占比</div>
            <span class="badge badge-gray">{{ categorySales.length }} 类</span>
          </div>
          <div v-if="loading" class="empty">正在加载...</div>
          <ChartPanel v-else-if="categorySales.length" type="doughnut" :labels="categoryLabels" :datasets="categoryDatasets" :options="doughnutOptions" />
          <div v-else class="empty">暂无数据</div>
        </section>

        <section class="panel chart-card top-card">
          <div class="card-head">
            <div class="card-title">热销商品 TOP {{ topProducts.length }}</div>
            <span class="badge badge-green">按销量</span>
          </div>
          <div v-if="loading" class="empty">正在加载...</div>
          <ChartPanel v-else-if="topProducts.length" type="bar" :labels="topLabels" :datasets="topDatasets" :options="barOptions" />
          <div v-else class="empty">暂无数据</div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.range-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sep {
  color: var(--muted);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
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
  padding: 13px 14px;
}

.kpi-icon {
  width: 38px;
  height: 38px;
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

.kpi-icon.red {
  background: var(--danger-weak);
  color: var(--danger);
}

.kpi-label {
  font-size: 12px;
  color: var(--muted);
}

.kpi-value {
  font-size: 18px;
  font-weight: 700;
  margin-top: 2px;
  white-space: nowrap;
}

.report-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  grid-template-rows: 300px 300px;
  gap: 12px;
}

.chart-card {
  padding: 12px 14px;
  min-width: 0;
}

.trend-card {
  grid-row: span 2;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 650;
}

@media (max-width: 1280px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .report-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }

  .trend-card {
    grid-row: auto;
  }

  .chart-card {
    height: 300px;
  }
}
</style>
