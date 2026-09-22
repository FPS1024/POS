<script setup>
import { computed, onMounted, ref } from 'vue';
import { Search, Eye, Undo2, ReceiptText } from 'lucide-vue-next';
import { api, queryString } from '../api';
import { useSettingsStore } from '../stores/settings';
import { useToast } from '../composables/toast';
import AppModal from '../components/AppModal.vue';

const toast = useToast();
const settingsStore = useSettingsStore();

const orders = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);

const search = ref('');
const status = ref('');
const payment = ref('');
const from = ref('');
const to = ref('');

const detailOrder = ref(null);
const showRefund = ref(false);
const refunding = ref(false);
const refund = ref({ method: 'cash', reason: '' });

const currency = computed(() => settingsStore.currency);
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const paymentLabels = {
  cash: '现金',
  card: '银行卡',
  wechat: '微信',
  alipay: '支付宝'
};

async function fetchOrders() {
  loading.value = true;
  try {
    const data = await api(`/orders${queryString({
      search: search.value,
      status: status.value,
      payment: payment.value,
      from: from.value,
      to: to.value,
      page: page.value,
      pageSize
    })}`);
    orders.value = data.items;
    total.value = data.total;
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

function applyFilter() {
  page.value = 1;
  fetchOrders();
}

function resetFilter() {
  search.value = '';
  status.value = '';
  payment.value = '';
  from.value = '';
  to.value = '';
  applyFilter();
}

async function openDetail(order) {
  try {
    detailOrder.value = await api(`/orders/${order.id}`);
  } catch (err) {
    toast.error(err.message);
  }
}

function openRefund(order) {
  refund.value = { method: order.payment_method, reason: '' };
  showRefund.value = true;
}

async function confirmRefund() {
  if (!detailOrder.value) return;
  refunding.value = true;
  try {
    await api(`/orders/${detailOrder.value.id}/refund`, {
      method: 'POST',
      body: refund.value
    });
    toast.success('退款成功，库存已回补');
    showRefund.value = false;
    await openDetail(detailOrder.value);
    fetchOrders();
  } catch (err) {
    toast.error(err.message);
  } finally {
    refunding.value = false;
  }
}

onMounted(() => {
  settingsStore.fetchSettings().catch(() => {});
  fetchOrders();
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>订单管理</h1>
        <div class="subtitle">交易记录查询、详情与退款</div>
      </div>
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="search-input">
          <Search :size="16" />
          <input v-model="search" placeholder="单号 / 会员 / 备注" @keydown.enter="applyFilter" />
        </div>
        <select v-model="status">
          <option value="">全部状态</option>
          <option value="completed">已完成</option>
          <option value="refunded">已退款</option>
        </select>
        <select v-model="payment">
          <option value="">全部支付方式</option>
          <option v-for="(label, key) in paymentLabels" :key="key" :value="key">{{ label }}</option>
        </select>
        <input type="date" v-model="from" />
        <span class="date-sep">至</span>
        <input type="date" v-model="to" />
        <button class="btn btn-primary" @click="applyFilter">查询</button>
        <button class="btn" @click="resetFilter">重置</button>
      </div>

      <div class="panel">
        <div v-if="loading" class="empty">正在加载...</div>
        <table v-else-if="orders.length">
          <thead>
            <tr>
              <th>单号</th>
              <th>时间</th>
              <th>会员</th>
              <th>商品数</th>
              <th>金额</th>
              <th>支付方式</th>
              <th>状态</th>
              <th>操作员</th>
              <th style="width: 120px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in orders" :key="order.id">
              <td class="mono">{{ order.order_no }}</td>
              <td class="mono">{{ order.created_at }}</td>
              <td>{{ order.customer_name || '-' }}</td>
              <td>
                <span class="badge badge-gray">{{ order.item_count ?? '-' }}</span>
              </td>
              <td class="amount">{{ currency }}{{ Number(order.total).toFixed(2) }}</td>
              <td>{{ paymentLabels[order.payment_method] || order.payment_method }}</td>
              <td>
                <span :class="['badge', order.status === 'completed' ? 'badge-green' : 'badge-gray']">
                  {{ order.status === 'completed' ? '已完成' : '已退款' }}
                </span>
              </td>
              <td>{{ order.operator_name || '-' }}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-sm" @click="openDetail(order)"><Eye :size="14" /> 详情</button>
                  <button v-if="order.status === 'completed'" class="btn btn-sm" @click="openRefund(order)">
                    <Undo2 :size="14" /> 退款
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">
          <ReceiptText :size="32" />
          <div>暂无订单</div>
        </div>
        <div class="pagination">
          <span>第 {{ page }} / {{ pageCount }} 页，共 {{ total }} 单</span>
          <button class="btn btn-sm" :disabled="page <= 1" @click="page--; fetchOrders()">上一页</button>
          <button class="btn btn-sm" :disabled="page >= pageCount" @click="page++; fetchOrders()">下一页</button>
        </div>
      </div>
    </div>

    <AppModal v-if="detailOrder" title="订单详情" wide @close="detailOrder = null">
      <div class="detail-meta">
        <div><span>单号</span><strong class="mono">{{ detailOrder.order_no }}</strong></div>
        <div><span>时间</span><strong>{{ detailOrder.created_at }}</strong></div>
        <div><span>会员</span><strong>{{ detailOrder.customer_name || '散客' }}</strong></div>
        <div><span>收银员</span><strong>{{ detailOrder.operator_name || '-' }}</strong></div>
        <div><span>状态</span>
          <span :class="['badge', detailOrder.status === 'completed' ? 'badge-green' : 'badge-gray']">
            {{ detailOrder.status === 'completed' ? '已完成' : '已退款' }}
          </span>
        </div>
        <div v-if="detailOrder.refunded_at"><span>退款时间</span><strong>{{ detailOrder.refunded_at }}</strong></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>商品</th>
            <th>单价</th>
            <th>数量</th>
            <th>小计</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in detailOrder.items" :key="item.id">
            <td>{{ item.product_name }}</td>
            <td>{{ currency }}{{ Number(item.unit_price).toFixed(2) }}</td>
            <td>{{ item.quantity }}</td>
            <td class="amount">{{ currency }}{{ Number(item.line_total).toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="detail-totals">
        <div class="detail-row"><span>小计</span><span>{{ currency }}{{ Number(detailOrder.subtotal).toFixed(2) }}</span></div>
        <div class="detail-row" v-if="Number(detailOrder.discount_amount) > 0">
          <span>优惠</span><span>-{{ currency }}{{ Number(detailOrder.discount_amount).toFixed(2) }}</span>
        </div>
        <div class="detail-row" v-if="Number(detailOrder.tax_amount) > 0">
          <span>税费</span><span>{{ currency }}{{ Number(detailOrder.tax_amount).toFixed(2) }}</span>
        </div>
        <div class="detail-row grand"><span>合计</span><span>{{ currency }}{{ Number(detailOrder.total).toFixed(2) }}</span></div>
        <div class="detail-row"><span>支付方式</span><span>{{ paymentLabels[detailOrder.payment_method] || '-' }}</span></div>
        <div class="detail-row" v-if="detailOrder.points_earned > 0">
          <span>获得积分</span><span>+{{ detailOrder.points_earned }}</span>
        </div>
        <div class="detail-row" v-if="detailOrder.note"><span>备注</span><span>{{ detailOrder.note }}</span></div>
      </div>
      <template #foot>
        <button class="btn" @click="detailOrder = null">关闭</button>
        <button v-if="detailOrder.status === 'completed'" class="btn btn-danger" @click="openRefund(detailOrder)">
          <Undo2 :size="16" /> 退款
        </button>
      </template>
    </AppModal>

    <AppModal v-if="showRefund && detailOrder" title="订单退款" @close="showRefund = false">
      <div class="refund-box">
        <div class="refund-amount">
          <span>退款金额</span>
          <strong>{{ currency }}{{ Number(detailOrder.total).toFixed(2) }}</strong>
        </div>
        <div class="field">
          <label>退款方式</label>
          <select v-model="refund.method">
            <option value="cash">现金</option>
            <option value="card">银行卡</option>
            <option value="wechat">微信</option>
            <option value="alipay">支付宝</option>
          </select>
        </div>
        <div class="field">
          <label>退款原因</label>
          <textarea v-model="refund.reason" rows="3" placeholder="选填"></textarea>
        </div>
        <div class="refund-hint">退款后将回补商品库存并扣回会员积分。</div>
      </div>
      <template #foot>
        <button class="btn" @click="showRefund = false">取消</button>
        <button class="btn btn-danger" :disabled="refunding" @click="confirmRefund">
          {{ refunding ? '处理中...' : '确认退款' }}
        </button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.date-sep {
  color: var(--muted);
}

.mono {
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  font-size: 12px;
}

.amount {
  font-weight: 700;
}

.row-actions {
  display: flex;
  gap: 6px;
}

.detail-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 16px;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 14px;
}

.detail-meta span {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 2px;
}

.detail-meta strong {
  font-size: 13px;
}

.detail-totals {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 320px;
  margin-left: auto;
  font-size: 13px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
}

.detail-row.grand {
  font-weight: 700;
  color: var(--text);
  font-size: 15px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.refund-box {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.refund-amount {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  background: var(--danger-weak);
  color: var(--danger);
  border-radius: 8px;
  padding: 14px;
}

.refund-amount span {
  color: var(--muted);
}

.refund-amount strong {
  font-size: 22px;
}

.refund-hint {
  font-size: 12px;
  color: var(--muted);
}
</style>
