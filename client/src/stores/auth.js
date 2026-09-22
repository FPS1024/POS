import { defineStore } from 'pinia';
import { api, setToken, getToken } from '../api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    token: getToken()
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'admin'
  },
  actions: {
    async login(username, password) {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { username, password }
      });
      this.token = data.token;
      this.user = data.user;
      setToken(data.token);
      return data.user;
    },
    async fetchMe() {
      if (!this.token) return null;
      try {
        this.user = await api('/auth/me');
        return this.user;
      } catch {
        this.logout();
        return null;
      }
    },
    async logout() {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch {
        // 本地会话仍需要清理
      }
      this.user = null;
      this.token = '';
      setToken('');
    }
  }
});
