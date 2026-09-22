<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  Search,
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  Users,
  Phone,
  PauseCircle,
  ClipboardList,
  Banknote,
  UserPlus,
  RotateCcw,
  ShoppingBag
} from 'lucide-vue-next';
import { api, queryString } from '../api';
import { useCartStore } from '../stores/cart';
import { useSettingsStore } from '../stores/settings';
import { useToast } from '../composables/toast';
import AppModal from '../components/AppModal.vue';
import ReceiptModal from '../components/ReceiptModal.vue';

const cart = useCartStore();
const settingsStore = useSettingsStore();
const toast = useToast();

const products = ref([]);
const categories = ref([]);
const search = ref('');
const barcode = ref('');
const categoryId = ref('');
const loading = ref(false);

const showCheckout = ref(false);
const showHolds = ref(false);
const showMembers = ref(false);
const memberMode = ref('search');
const memberPhone = ref('');
const memberResults = ref([]);
const memberSearching = ref(false);
const newMember = ref({ name: '', phone: '', level: '普通会员' });
const receiptOrder = ref(null);
const checkoutBusy = ref(false);

const paymentMethods = [
  { key: 'cash', label: '现金' },
  { key: 'card', label: '银行卡' },
  { key: 'wechat', label: '微信' },
  { key: 'alipay', label: '支付宝' }
];

const currency = computed(() => settingsStore.currency);
const changeAmount = computed(() => {
  if (cart.paymentMethod !== 'cash' || cart.tendered === '') return 0;
  return Math.max(0, Number(cart.tendered) - cart.total);
});

let searchTimer = null;

async function fetchProducts() {
  loading.value = true;
  try {
    const data = await api(`/products${queryString({ search: search.value, categoryId: categoryId.value, active: 1, pageSize: 200 })}`);
    products.value = data.items;
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function fetchCategories() {
  categories.value = await api('/categories');
}

watch([search, categoryId], () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(fetchProducts, 250);
});

function addProduct(product) {
  if (product.stock <= 0) {
    toast.error(`${product.name} 已缺货`);
    return;
  }
  cart.addProduct(product);
}

async function addByBarcode() {
  const code = barcode.value.trim();
  if (!code) return;
  const found = products.value.find((p) => p.barcode === code);
  if (found) {
    addProduct(found);
    barcode.value = '';
    return;
  }
  try {
    const data = await api(`/products${queryString({ search: code, active: 1, pageSize: 5 })}`);
    const exact = data.items.find((p) => p.barcode === code);
    if (exact) {
      addProduct(exact);
    } else {
      toast.error('未找到该条码对应的商品');
    }
  } catch (err) {
    toast.error(err.message);
  }
  barcode.value = '';
}

function holdCurrent() {
  cart.holdCart()
    .then(() => toast.success('订单已挂起'))
    .catch((err) => toast.error(err.message));
}

function parseHoldItems(hold) {
  try {
    return JSON.parse(hold.items);
  } catch {
    return [];
  }
}

function holdSummary(hold) {
  const items = parseHoldItems(hold);
  const total = items.reduce((sum, i) => sum + Number(i.line_total || i.unit_price * i.quantity), 0);
  return `${items.length} 件商品 · ${currency.value}${total.toFixed(2)}`;
}

async function retrieveHold(hold) {
  try {
    await cart.retrieveHold(hold.id);
    toast.success(`已取回挂单 ${hold.order_no}`);
  } catch (err) {
    toast.error(err.message);
  }
}

async function deleteHold(hold) {
  if (!window.confirm(`确定删除挂单 ${hold.order_no} 吗？`)) return;
  try {
    await cart.deleteHold(hold.id);
    toast.success('挂单已删除');
  } catch (err) {
    toast.error(err.message);
  }
}

function openHolds() {
  showHolds.value = true;
  cart.loadHolds().catch((err) => toast.error(err.message));
}

function openMembers() {
  showMembers.value = true;
  memberMode.value = 'search';
  memberPhone.value = '';
  memberResults.value = [];
}

async function searchMembers() {
  if (!memberPhone.value.trim()) return;
  memberSearching.value = true;
  try {
    const data = await api(`/customers${queryString({ search: memberPhone.value.trim(), pageSize: 20 })}`);
    memberResults.value = data.items;
    if (!data.items.length) toast.info('未找到会员，可新建');
  } catch (err) {
    toast.error(err.message);
  } finally {
    memberSearching.value = false;
  }
}

function chooseMember(customer) {
  cart.setCustomer(customer);
  showMembers.value = false;
  toast.success(`会员 ${customer.name} 已关联`);
}

function clearMember() {
  cart.setCustomer(null);
}

async function createMember() {
  if (!newMember.value.name || !newMember.value.phone) {
    toast.error('请填写姓名和手机号');
    return;
  }
  try {
    const customer = await api('/customers', {
      method: 'POST',
      body: newMember.value
    });
    cart.setCustomer(customer);
    showMembers.value = false;
    toast.success('会员创建成功');
  } catch (err) {
    toast.error(err.message);
  }
}

function openCheckout() {
  if (!cart.items.length) {
    toast.error('购物车为空');
    return;
  }
  cart.tendered = '';
  showCheckout.value = true;
}

async function confirmCheckout() {
  checkoutBusy.value = true;
  try {
    const order = await cart.checkout();
    showCheckout.value = false;
    receiptOrder.value = order;
  } catch (err) {
    toast.error(err.message);
  } finally {
    checkoutBusy.value = false;
  }
}

onMounted(async () => {
  await settingsStore.fetchSettings().catch(() => {});
  await Promise.all([fetchProducts(), fetchCategories()]);
  cart.loadHolds().catch(() => {});
});
</script>

<template>
  <div class="pos-page">
    <section class="pos-products panel">
      <div class="pos-toolbar">
        <div class="barcode-box">
          <ScanBarcode :size="18" />
          <input
            v-model="barcode"
            placeholder="扫描或输入条码，回车加入购物车"
            @keydown.enter.prevent="addByBarcode"
          />
        </div>
        <div class="search-box">
          <Search :size="17" />
          <input v-model="search" placeholder="搜索商品名称 / SKU" />
        </div>
      </div>
      <div class="cat-tabs">
        <button class="cat-tab" :class="{ active: categoryId === '' }" @click="categoryId = ''">全部</button>
        <button
          v-for="cat in categories"
          :key="cat.id"
          class="cat-tab"
          :class="{ active: categoryId === cat.id }"
          @click="categoryId = cat.id"
        >
          <span class="cat-dot" :style="{ background: cat.color }"></span>
          {{ cat.name }}
        </button>
      </div>
      <div v-if="loading" class="empty">正在加载商品...</div>
      <div v-else-if="!products.length" class="empty">
        <ShoppingBag :size="30" />
        <div>没有找到商品</div>
      </div>
      <div v-else class="product-grid">
        <button
          v-for="product in products"
          :key="product.id"
          class="product-card"
          :class="{ soldout: product.stock <= 0 }"
          @click="addProduct(product)"
        >
          <div class="card-top">
            <span class="cat-dot" :style="{ background: product.category_color }"></span>
            <span v-if="product.stock <= product.low_stock" class="badge badge-orange">补货</span>
          </div>
          <div class="product-name" :title="product.name">{{ product.name }}</div>
          <div class="product-price">
            {{ currency }}{{ Number(product.sale_price).toFixed(2) }}
            <span class="product-unit">/{{ product.unit }}</span>
          </div>
          <div class="product-stock" :class="{ low: product.stock <= product.low_stock }">
            库存 {{ product.stock }} {{ product.unit }}
          </div>
        </button>
      </div>
    </section>

    <aside class="pos-cart panel">
      <div class="cart-head">
        <div class="cart-title">
          <ShoppingBag :size="17" />
          当前订单
          <span class="cart-count">{{ cart.count }}</span>
        </div>
        <div class="cart-actions">
          <button class="btn btn-sm" @click="openHolds">
            <ClipboardList :size="15" />
            取单
          </button>
          <button class="btn btn-sm" :disabled="!cart.items.length" @click="holdCurrent">
            <PauseCircle :size="15" />
            挂单
          </button>
        </div>
      </div>
      <div v-if="!cart.items.length" class="empty cart-empty">
        <ShoppingBag :size="34" />
        <div>购物车为空</div>
        <div class="hint">点击左侧商品加入订单</div>
      </div>
      <div v-else class="cart-list">
        <div v-for="item in cart.items" :key="item.product_id" class="cart-item">
          <div class="cart-item-main">
            <div class="cart-item-name" :title="item.name">{{ item.name }}</div>
            <div class="cart-item-price">{{ currency }}{{ Number(item.unit_price).toFixed(2) }} / {{ item.unit }}</div>
          </div>
          <div class="qty-stepper">
            <button class="qty-btn" @click="cart.setQuantity(item.product_id, item.quantity - 1)">
              <Minus :size="14" />
            </button>
            <input
              type="number"
              min="1"
              :max="item.stock"
              :value="item.quantity"
              @change="cart.setQuantity(item.product_id, Number($event.target.value))"
            />
            <button class="qty-btn" @click="cart.setQuantity(item.product_id, item.quantity + 1)">
              <Plus :size="14" />
            </button>
          </div>
          <div class="cart-item-total">{{ currency }}{{ (item.unit_price * item.quantity).toFixed(2) }}</div>
          <button class="icon-btn remove-btn" title="移除" @click="cart.removeItem(item.product_id)">
            <Trash2 :size="15" />
          </button>
        </div>
      </div>
    </aside>

    <aside class="pos-summary panel">
      <button class="member-box" :class="{ active: cart.customer }" @click="openMembers">
        <div class="member-icon"><Users :size="18" /></div>
        <div class="member-meta">
          <div class="member-label">会员</div>
          <div class="member-value">
            {{ cart.customer ? `${cart.customer.name} · ${cart.customer.points || 0} 积分` : '未选择会员' }}
          </div>
        </div>
        <div v-if="cart.customer" class="member-clear" @click.stop="clearMember">清除</div>
      </button>

      <div class="summary-rows">
        <div class="summary-row"><span>商品小计</span><span>{{ currency }}{{ cart.subtotal.toFixed(2) }}</span></div>
        <div class="summary-row">
          <span>优惠金额</span>
          <input
            type="number"
            min="0"
            class="summary-input"
            v-model.number="cart.discount"
            placeholder="0.00"
          />
        </div>
        <div class="summary-row" v-if="settingsStore.taxEnabled">
          <span>税费 ({{ (settingsStore.taxRate * 100).toFixed(0) }}%)</span>
          <span>{{ currency }}{{ cart.taxAmount.toFixed(2) }}</span>
        </div>
        <div class="summary-total">
          <span>应收</span>
          <span class="total-amount">{{ currency }}{{ cart.total.toFixed(2) }}</span>
        </div>
      </div>

      <div class="summary-actions">
        <button class="btn" :disabled="!cart.items.length" @click="cart.clearCart">
          <RotateCcw :size="16" />
          清空
        </button>
        <button class="btn btn-primary pay-btn" :disabled="!cart.items.length" @click="openCheckout">
          <Banknote :size="17" />
          收款 {{ currency }}{{ cart.total.toFixed(2) }}
        </button>
      </div>
    </aside>

    <AppModal v-if="showCheckout" title="确认收款" @close="showCheckout = false">
      <div class="checkout-grid">
        <div class="checkout-items">
          <div v-for="item in cart.items" :key="item.product_id" class="checkout-item">
            <span class="co-name">{{ item.name }} x {{ item.quantity }}</span>
            <span>{{ currency }}{{ (item.unit_price * item.quantity).toFixed(2) }}</span>
          </div>
        </div>
        <div class="checkout-form">
          <div class="field">
            <label>优惠金额</label>
            <input type="number" min="0" v-model.number="cart.discount" />
          </div>
          <div class="field">
            <label>支付方式</label>
            <div class="segmented pay-seg">
              <button
                v-for="m in paymentMethods"
                :key="m.key"
                :class="{ active: cart.paymentMethod === m.key }"
                @click="cart.paymentMethod = m.key"
              >
                {{ m.label }}
              </button>
            </div>
          </div>
          <div v-if="cart.paymentMethod === 'cash'" class="field">
            <label>实收金额</label>
            <input type="number" min="0" v-model="cart.tendered" placeholder="输入现金金额" />
            <div v-if="changeAmount > 0" class="change-box">找零 {{ currency }}{{ changeAmount.toFixed(2) }}</div>
          </div>
          <div class="field">
            <label>备注</label>
            <input v-model="cart.note" placeholder="选填" />
          </div>
          <div class="checkout-total">
            <span>应收合计</span>
            <strong>{{ currency }}{{ cart.total.toFixed(2) }}</strong>
          </div>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="showCheckout = false">取消</button>
        <button class="btn btn-primary" :disabled="checkoutBusy" @click="confirmCheckout">
          {{ checkoutBusy ? '收款中...' : '确认收款' }}
        </button>
      </template>
    </AppModal>

    <AppModal v-if="showHolds" title="挂单列表" wide @close="showHolds = false">
      <div v-if="!cart.holds.length" class="empty">暂无挂单</div>
      <table v-else>
        <thead>
          <tr>
            <th>挂单号</th>
            <th>会员</th>
            <th>商品数</th>
            <th>金额</th>
            <th>备注</th>
            <th>挂单时间</th>
            <th style="width: 130px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="hold in cart.holds" :key="hold.id">
            <td>{{ hold.order_no }}</td>
            <td>{{ hold.customer_name || '-' }}</td>
            <td>{{ parseHoldItems(hold).length }}</td>
            <td>{{ holdSummary(hold) }}</td>
            <td>{{ hold.note || '-' }}</td>
            <td>{{ hold.created_at }}</td>
            <td>
              <div class="row-actions">
                <button class="btn btn-sm btn-primary" @click="retrieveHold(hold)">取单</button>
                <button class="btn btn-sm" @click="deleteHold(hold)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </AppModal>

    <AppModal v-if="showMembers" title="选择会员" @close="showMembers = false">
      <div v-if="memberMode === 'search'" class="member-picker">
        <div class="form-row">
          <div class="search-input grow">
            <Phone :size="16" />
            <input v-model="memberPhone" placeholder="输入手机号或姓名搜索" @keydown.enter="searchMembers" />
          </div>
          <button class="btn btn-primary" :disabled="memberSearching" @click="searchMembers">搜索</button>
        </div>
        <div class="member-results">
          <button v-for="c in memberResults" :key="c.id" class="member-row" @click="chooseMember(c)">
            <div class="member-avatar">{{ c.name.slice(0, 1) }}</div>
            <div class="member-row-meta">
              <div>{{ c.name }} <span class="badge badge-blue">{{ c.level }}</span></div>
              <div class="muted">{{ c.phone || '未留手机号' }} · {{ c.points }} 积分</div>
            </div>
            <span class="select-hint">选择</span>
          </button>
          <div v-if="!memberResults.length" class="empty">输入手机号搜索会员</div>
        </div>
        <button class="btn new-member-btn" @click="memberMode = 'create'">
          <UserPlus :size="16" />
          新建会员
        </button>
      </div>
      <div v-else class="member-picker">
        <div class="field-grid">
          <div class="field">
            <label>姓名</label>
            <input v-model="newMember.name" placeholder="会员姓名" />
          </div>
          <div class="field">
            <label>手机号</label>
            <input v-model="newMember.phone" placeholder="手机号" />
          </div>
        </div>
        <div class="field">
          <label>等级</label>
          <select v-model="newMember.level">
            <option>普通会员</option>
            <option>银卡会员</option>
            <option>金卡会员</option>
            <option>钻石会员</option>
          </select>
        </div>
        <div class="member-form-actions">
          <button class="btn" @click="memberMode = 'search'">返回</button>
          <button class="btn btn-primary" @click="createMember">创建并关联</button>
        </div>
      </div>
    </AppModal>

    <ReceiptModal v-if="receiptOrder" :order="receiptOrder" :settings="settingsStore.settings" @close="receiptOrder = null" />
  </div>
</template>

<style scoped>
.pos-page {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px 300px;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}

.pos-products {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.pos-toolbar {
  display: flex;
  gap: 10px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border);
}

.barcode-box,
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  padding: 0 11px;
  background: var(--surface-2);
  color: var(--muted);
}

.barcode-box {
  flex: 1.4;
}

.search-box {
  flex: 1;
}

.barcode-box:focus-within,
.search-box:focus-within {
  border-color: var(--primary);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(31, 111, 235, 0.12);
}

.barcode-box input,
.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 10px 0;
  min-width: 0;
}

.cat-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  scrollbar-width: thin;
}

.cat-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 6px 13px;
  color: var(--muted);
  white-space: nowrap;
}

.cat-tab:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.cat-tab.active {
  background: var(--primary-weak);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}

.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.product-grid {
  flex: 1;
  overflow: auto;
  padding: 12px 14px 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 10px;
  align-content: start;
}

.product-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  padding: 10px 11px;
  min-height: 96px;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.product-card:hover {
  border-color: var(--primary);
  box-shadow: 0 3px 10px rgba(31, 111, 235, 0.12);
  transform: translateY(-1px);
}

.product-card.soldout {
  opacity: 0.55;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
}

.product-name {
  font-weight: 600;
  font-size: 13px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 34px;
}

.product-price {
  font-size: 16px;
  font-weight: 700;
  color: var(--danger);
}

.product-unit {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
}

.product-stock {
  font-size: 12px;
  color: var(--muted);
}

.product-stock.low {
  color: var(--warning);
  font-weight: 600;
}

.pos-cart {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.cart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.cart-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 650;
}

.cart-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
}

.cart-actions {
  display: flex;
  gap: 6px;
}

.cart-empty {
  flex: 1;
}

.cart-empty .hint {
  font-size: 12px;
}

.cart-list {
  flex: 1;
  overflow: auto;
  padding: 6px 10px;
}

.cart-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto 30px;
  align-items: center;
  gap: 8px;
  padding: 9px 6px;
  border-bottom: 1px solid var(--border);
}

.cart-item:last-child {
  border-bottom: none;
}

.cart-item-main {
  min-width: 0;
}

.cart-item-name {
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cart-item-price {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}

.qty-stepper {
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.qty-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}

.qty-btn:hover {
  background: #e8ecf3;
  color: var(--text);
}

.qty-stepper input {
  width: 38px;
  height: 26px;
  border: none;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-radius: 0;
  text-align: center;
  padding: 0;
  font-size: 13px;
}

.cart-item-total {
  min-width: 62px;
  text-align: right;
  font-weight: 700;
  font-size: 13px;
}

.remove-btn {
  width: 28px;
  height: 28px;
}

.pos-summary {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  gap: 12px;
}

.member-box {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1px dashed var(--border-strong);
  background: var(--surface-2);
  border-radius: 8px;
  padding: 10px 12px;
  text-align: left;
  color: var(--text);
}

.member-box:hover {
  border-color: var(--primary);
}

.member-box.active {
  background: var(--success-weak);
  border-color: var(--success);
}

.member-icon {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  background: var(--primary-weak);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-box.active .member-icon {
  background: var(--success);
  color: #fff;
}

.member-meta {
  flex: 1;
  min-width: 0;
}

.member-label {
  font-size: 12px;
  color: var(--muted);
}

.member-value {
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-clear {
  color: var(--muted);
  font-size: 12px;
}

.summary-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  font-size: 13px;
}

.summary-input {
  width: 90px;
  height: 30px;
  padding: 4px 8px;
  text-align: right;
  font-size: 13px;
}

.summary-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  padding-top: 10px;
  font-weight: 600;
}

.total-amount {
  font-size: 24px;
  font-weight: 750;
  color: var(--danger);
}

.summary-actions {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pay-btn {
  height: 44px;
  font-size: 15px;
}

.checkout-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.checkout-items {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
}

.checkout-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px dashed var(--border);
  font-size: 13px;
}

.checkout-item:last-child {
  border-bottom: none;
}

.co-name {
  min-width: 0;
}

.checkout-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pay-seg {
  width: 100%;
}

.pay-seg button {
  flex: 1;
}

.change-box {
  background: var(--success-weak);
  color: var(--success);
  border-radius: 6px;
  padding: 8px 10px;
  font-weight: 600;
  font-size: 13px;
}

.checkout-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
}

.checkout-total strong {
  font-size: 22px;
  color: var(--danger);
}

.row-actions {
  display: flex;
  gap: 6px;
}

.member-picker {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.grow {
  flex: 1;
}

.member-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--surface);
  text-align: left;
  color: var(--text);
}

.member-row:hover {
  border-color: var(--primary);
  background: var(--primary-weak);
}

.member-avatar {
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

.member-row-meta {
  flex: 1;
  min-width: 0;
}

.muted {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}

.select-hint {
  color: var(--primary);
  font-size: 13px;
  font-weight: 600;
}

.new-member-btn {
  align-self: flex-start;
}

.member-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 1280px) {
  .pos-page {
    grid-template-columns: minmax(0, 1fr) 330px 270px;
  }
}

@media (max-width: 1024px) {
  .pos-page {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) 260px 240px;
    overflow: auto;
  }
}
</style>
