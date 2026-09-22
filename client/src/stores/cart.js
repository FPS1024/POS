import { defineStore } from 'pinia';
import { api } from '../api';
import { useSettingsStore } from './settings';

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: [],
    customer: null,
    discount: 0,
    paymentMethod: 'cash',
    tendered: '',
    note: '',
    holds: []
  }),
  getters: {
    count: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal(state) {
      return state.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    },
    taxable(state) {
      return Math.max(0, this.subtotal - (Number(state.discount) || 0));
    },
    taxAmount() {
      const settings = useSettingsStore();
      return settings.taxEnabled ? this.taxable * settings.taxRate : 0;
    },
    total() {
      return Math.max(0, this.taxable + this.taxAmount);
    },
    currency() {
      return useSettingsStore().currency;
    }
  },
  actions: {
    addProduct(product, quantity = 1) {
      const existing = this.items.find((item) => item.product_id === product.id);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + quantity, product.stock);
      } else {
        this.items.push({
          product_id: product.id,
          name: product.name,
          barcode: product.barcode,
          unit: product.unit,
          unit_price: Number(product.sale_price),
          stock: Number(product.stock),
          quantity
        });
      }
    },
    setQuantity(productId, quantity) {
      const item = this.items.find((i) => i.product_id === productId);
      if (!item) return;
      const value = Math.max(1, Math.min(Number(quantity) || 1, item.stock));
      item.quantity = value;
    },
    removeItem(productId) {
      this.items = this.items.filter((i) => i.product_id !== productId);
    },
    clearCart() {
      this.items = [];
      this.customer = null;
      this.discount = 0;
      this.tendered = '';
      this.note = '';
      this.paymentMethod = 'cash';
    },
    setCustomer(customer) {
      this.customer = customer;
    },
    async loadHolds() {
      this.holds = await api('/orders/holds');
      return this.holds;
    },
    async holdCart() {
      if (!this.items.length) throw new Error('购物车为空');
      const items = this.items.map((i) => ({
        product_id: i.product_id,
        name: i.name,
        unit: i.unit,
        unit_price: i.unit_price,
        quantity: i.quantity,
        line_total: i.unit_price * i.quantity,
        stock: i.stock
      }));
      const hold = await api('/orders/holds', {
        method: 'POST',
        body: {
          customer_id: this.customer?.id || null,
          note: this.note,
          items
        }
      });
      this.clearCart();
      await this.loadHolds();
      return hold;
    },
    async retrieveHold(id) {
      const hold = await api(`/orders/holds/${id}/retrieve`, { method: 'POST' });
      this.items = hold.items.map((i) => ({
        product_id: i.product_id,
        name: i.name,
        unit: i.unit || '件',
        unit_price: i.unit_price,
        stock: i.stock,
        quantity: i.quantity
      }));
      this.customer = hold.customer_id ? { id: hold.customer_id, name: hold.customer_name || '会员' } : null;
      this.note = hold.note || '';
      await this.loadHolds();
      return hold;
    },
    async deleteHold(id) {
      await api(`/orders/holds/${id}`, { method: 'DELETE' });
      await this.loadHolds();
    },
    async checkout() {
      if (!this.items.length) throw new Error('购物车为空');
      const body = {
        items: this.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        customer_id: this.customer?.id || null,
        discount_amount: Number(this.discount) || 0,
        payment_method: this.paymentMethod,
        tendered: this.paymentMethod === 'cash' && this.tendered !== '' ? Number(this.tendered) : null,
        note: this.note
      };
      const data = await api('/orders', { method: 'POST', body });
      this.clearCart();
      return data.order;
    }
  }
});
