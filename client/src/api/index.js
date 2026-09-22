const TOKEN_KEY = 'pos_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({ ok: false, error: '响应解析失败' }));
  if (response.status === 401 && !path.includes('/auth/login')) {
    setToken('');
    if (window.location.pathname !== '/login') window.location.href = '/login';
  }
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error || '请求失败');
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined && value !== null) search.set(key, value);
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}
