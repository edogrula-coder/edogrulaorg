// src/api/client.js — Ultra Pro (Live/Vercel Ready)
import axios from "axios";
import { API_ROOT, apiPath } from "./base.js";

/**
 * Pro hedefler:
 * - baseURL daima API_ROOT (env/same-origin uyumlu)
 * - /api/api gibi çift prefixleri apiPath ile engelle
 * - Mutlak URL gelirse baseURL kullanılmasın
 * - Authorization: Bearer <token> (authToken veya token)
 * - Legacy x-auth-token header'ı asla gönderme (CORS preflight derdi)
 * - Makul timeout + Accept header
 */

export const api = axios.create({
  baseURL: API_ROOT,        // ← base.js normalize ediyor
  withCredentials: true,    // cookie kullanmasan da sorun çıkarmaz
  timeout: 20000,
});

// Güvence: global/instance legacy header'ları temizle
delete axios.defaults?.headers?.common?.["x-auth-token"];
delete api.defaults?.headers?.common?.["x-auth-token"];

// Token okumayı güvenli yap
function getToken() {
  try {
    return (
      localStorage.getItem("authToken") ||
      localStorage.getItem("token") ||
      ""
    );
  } catch {
    return "";
  }
}

// Request interceptor
api.interceptors.request.use((config) => {
  config.headers = config.headers || {};

  // ✅ Sadece Authorization gönder
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  delete config.headers["x-auth-token"];

  if (!config.headers.Accept) {
    config.headers.Accept = "application/json";
  }

  // URL normalize:
  // - abs URL ise dokunma ve baseURL boş bırak
  // - göreli ise apiPath ile "/api" önekini sök
  if (typeof config.url === "string") {
    const normalized = apiPath(config.url);
    config.url = normalized;
    config.baseURL = /^https?:\/\//i.test(normalized) ? "" : API_ROOT;
  }

  return config;
});

// Response interceptor (opsiyonel: 401/403'te token temizle)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const st = err?.response?.status;
    if (st === 401 || st === 403) {
      try {
        localStorage.removeItem("authToken");
        localStorage.removeItem("token");
      } catch {}
    }
    return Promise.reject(err);
  }
);

export default api;
