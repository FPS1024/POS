import { defineStore } from 'pinia';
import { api } from '../api';

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: {
      store_name: '阳光生活超市',
      store_address: '',
      store_phone: '',
      tax_rate: '0.06',
      tax_enabled: '1',
      currency: '¥',
      receipt_footer: '',
      points_rate: '10',
      points_enabled: '1'
    },
    loaded: false
  }),
  getters: {
    taxRate: (state) => Number(state.settings.tax_rate) || 0,
    taxEnabled: (state) => state.settings.tax_enabled === '1',
    pointsEnabled: (state) => state.settings.points_enabled === '1',
    pointsRate: (state) => Number(state.settings.points_rate) || 10,
    currency: (state) => state.settings.currency || '¥'
  },
  actions: {
    async fetchSettings() {
      this.settings = { ...this.settings, ...(await api('/settings')) };
      this.loaded = true;
      return this.settings;
    },
    async saveSettings(patch) {
      this.settings = await api('/settings', { method: 'PUT', body: patch });
      return this.settings;
    }
  }
});
