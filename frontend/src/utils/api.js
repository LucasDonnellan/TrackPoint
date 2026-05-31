import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "/api";

const api = axios.create({ baseURL: API_BASE });

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      try {
        const refresh = localStorage.getItem("refresh_token");
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {}, {
          headers: { Authorization: `Bearer ${refresh}` },
        });
        localStorage.setItem("access_token", data.access_token);
        error.config.headers.Authorization = `Bearer ${data.access_token}`;
        return api(error.config);
      } catch {
        localStorage.clear();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login:    (email, password) => api.post("/auth/login", { email, password }),
  register: (email, name, password) => api.post("/auth/register", { email, name, password }),
  logout:   () => api.post("/auth/logout"),
  me:       () => api.get("/auth/me"),
};

// ── Devices ───────────────────────────────────────────────────────────────────
export const devicesApi = {
  list:       ()          => api.get("/devices/"),
  get:        (id)        => api.get(`/devices/${id}`),
  create:     (data)      => api.post("/devices/", data),
  update:     (id, data)  => api.put(`/devices/${id}`, data),
  delete:     (id)        => api.delete(`/devices/${id}`),
  rotateKey:  (id)        => api.post(`/devices/${id}/rotate-key`),
};

// ── Tracking ──────────────────────────────────────────────────────────────────
export const trackingApi = {
  latest:  ()     => api.get("/location/latest"),
  history: (params) => api.get("/location/history", { params }),
};

// ── Geofences ─────────────────────────────────────────────────────────────────
export const geofenceApi = {
  list:   ()          => api.get("/geofence/"),
  create: (data)      => api.post("/geofence/", data),
  update: (id, data)  => api.put(`/geofence/${id}`, data),
  delete: (id)        => api.delete(`/geofence/${id}`),
};

// ── Alerts ────────────────────────────────────────────────────────────────────
export const alertsApi = {
  list:        (params) => api.get("/alerts/", { params }),
  markRead:    (id)     => api.post(`/alerts/${id}/read`),
  markAllRead: ()       => api.post("/alerts/mark-all-read"),
  unreadCount: ()       => api.get("/alerts/unread-count"),
};

export default api;
