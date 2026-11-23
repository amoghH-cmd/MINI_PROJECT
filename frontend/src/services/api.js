import axios from 'axios';

// Access token lives in memory only (never localStorage); the refresh token is an HTTP-only cookie.
let accessToken = null;
export const setAccessToken = (t) => { accessToken = t; };

export const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 30000 });
api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

// One refresh at a time: the refresh token rotates, so parallel calls (StrictMode, several requests
// expiring together) must share a single request.
let refreshing = null;
export function refreshSession() {
  refreshing = refreshing || api.post('/auth/refresh').finally(() => { refreshing = null; });
  return refreshing;
}
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const { config, response } = err;
    if (response?.status === 401 && response.data?.error?.code === 'TOKEN_EXPIRED' && config && !config._retried) {
      config._retried = true;
      try {
        const { data } = await refreshSession();
        setAccessToken(data.accessToken);
        config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(config);
      } catch { setAccessToken(null); window.dispatchEvent(new Event('auth:expired')); }
    }
    return Promise.reject(err);
  }
);

// Normalises the backend's { error: { code, message, fields } } envelope.
export function apiError(err) {
  const e = err?.response?.data?.error;
  if (e) return { code: e.code, message: e.message, fields: e.fields || [], status: err.response.status };
  if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED')
    return { code: 'NETWORK', message: 'The server could not be reached. Check that the backend is running.', fields: [] };
  return { code: 'UNKNOWN', message: 'Unexpected error', fields: [] };
}
