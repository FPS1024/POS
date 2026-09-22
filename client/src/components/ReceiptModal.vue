<script setup>
import { computed } from 'vue';
import { X, Printer } from 'lucide-vue-next';

const props = defineProps({
  order: { type: Object, required: true },
  settings: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['close']);

const currency = computed(() => props.settings.currency || '¥');
const methodText = {
  cash: '现金',
  card: '银行卡',
  wechat: '微信支付',
  alipay: '支付宝'
};

function print() {
  window.print();
}
</script>

<template>
  <div class="modal-mask" @mousedown.self="emit('close')">
    <div class="receipt-panel">
      <div class="receipt" v-if="order">
        <div class="receipt-store">{{ settings.store_name || '超市' }}</div>
        <div class="receipt-meta">{{ settings.store_address }}</div>
        <div class="receipt-meta">电话：{{ settings.store_phone }}</div>
        <div class="receipt-line"></div>
        <div class="receipt-row"><span>单号</span><span>{{ order.order_no }}</span></div>
        <div class="receipt-row"><span>时间</span><span>{{ order.created_at }}</span></div>
        <div class="receipt-row" v-if="order.customer_name"><span>会员</span><span>{{ order.customer_name }}</span></div>
        <div class="receipt-row"><span>收银</span><span>{{ order.operator_name }}</span></div>
        <div class="receipt-line"></div>
        <div v-for="item in order.items" :key="item.id" class="receipt-item">
          <div class="receipt-item-name">{{ item.product_name }}</div>
          <div class="receipt-row">
            <span>{{ item.quantity }} x {{ currency }}{{ Number(item.unit_price).toFixed(2) }}</span>
            <span>{{ currency }}{{ Number(item.line_total).toFixed(2) }}</span>
          </div>
        </div>
        <div class="receipt-line"></div>
        <div class="receipt-row"><span>小计</span><span>{{ currency }}{{ Number(order.subtotal).toFixed(2) }}</span></div>
        <div class="receipt-row" v-if="Number(order.discount_amount) > 0">
          <span>优惠</span><span>-{{ currency }}{{ Number(order.discount_amount).toFixed(2) }}</span>
        </div>
        <div class="receipt-row" v-if="Number(order.tax_amount) > 0">
          <span>税费</span><span>{{ currency }}{{ Number(order.tax_amount).toFixed(2) }}</span>
        </div>
        <div class="receipt-total"><span>合计</span><span>{{ currency }}{{ Number(order.total).toFixed(2) }}</span></div>
        <div class="receipt-row"><span>支付方式</span><span>{{ methodText[order.payment_method] || order.payment_method }}</span></div>
        <div class="receipt-row" v-if="Number(order.tendered) > 0"><span>实收</span><span>{{ currency }}{{ Number(order.tendered).toFixed(2) }}</span></div>
        <div class="receipt-row" v-if="Number(order.change_amount) > 0"><span>找零</span><span>{{ currency }}{{ Number(order.change_amount).toFixed(2) }}</span></div>
        <div class="receipt-row" v-if="order.points_earned > 0"><span>获得积分</span><span>+{{ order.points_earned }}</span></div>
        <div class="receipt-line"></div>
        <div class="receipt-footer">{{ settings.receipt_footer || '感谢惠顾' }}</div>
      </div>
      <div class="receipt-actions">
        <button class="btn" @click="emit('close')"><X :size="16" /> 关闭</button>
        <button class="btn btn-primary" @click="print"><Printer :size="16" /> 打印小票</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.receipt-panel {
  background: var(--surface);
  border-radius: 10px;
  width: 340px;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  overflow: auto;
  box-shadow: var(--shadow-lg);
}

.receipt {
  padding: 22px 24px 18px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
}

.receipt-store {
  text-align: center;
  font-size: 16px;
  font-weight: 700;
}

.receipt-meta {
  text-align: center;
  color: #4a5568;
  font-size: 12px;
}

.receipt-line {
  border-top: 1px dashed #8a94a6;
  margin: 10px 0;
}

.receipt-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 3px 0;
}

.receipt-item {
  margin: 7px 0;
}

.receipt-item-name {
  font-weight: 600;
}

.receipt-total {
  display: flex;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 700;
  margin: 8px 0;
}

.receipt-footer {
  text-align: center;
  color: #4a5568;
}

.receipt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

@media print {
  .receipt-actions {
    display: none;
  }
}
</style>
