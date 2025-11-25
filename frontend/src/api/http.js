// src/api/http.js — Ultra Pro (Live uyumlu)
import axios from "axios";
import { API_ROOT, apiPath } from "./base.js";

/**
 * Hedef:
 * - baseURL: API_ROOT (base.js normalize ediyor)
 * - apiPath ile /api prefixini sök → /api/api sorunu biter
 * - Mutlak URL gelirse baseURL kullanılmaz
 * - Authorization: Bearer <token> (authToken veya token)
 * - x-auth-token asla gönderilmez
 * - Accept header varsayılan
 */

export const http = axios.create({
  baseURL: API_ROOT,
  withCredentials: true,
  timeout: 20000,
});

// Güvence: legacy headerları sıfırla
delete axios.defaults?.headers?.common?.["x-auth-token"];
delete http.defaults?.headers?.common?.["x-auth-token"];

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

http.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers || {};

  // Token → Authorization
  const tok = getToken();
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  delete cfg.headers["x-auth-token"]; // kesin temizlik

  if (!cfg.headers.Accept) {
    cfg.headers.Accept = "application/json";
  }

  // URL normalize
  if (typeof cfg.url === "string") {
    const normalized = apiPath(cfg.url);
    cfg.url = normalized;
    cfg.baseURL = /^https?:\/\//i.test(normalized) ? "" : API_ROOT;
  }

  return cfg;
});

http.interceptors.response.use(
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

export default http;
