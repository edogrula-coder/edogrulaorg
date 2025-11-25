// frontend/src/api/axios-boot.js — Ultra Pro (Live/Vercel Ready)
import axios from "axios";

/**
 * Ultra Pro axios bootstrap
 * - Env toleranslı: VITE_API_URL / VITE_API_ROOT / origin / :5000 / .../api
 * - API_ROOT her zaman "<origin>/api" olur
 * - Authorization: Bearer <token> (authToken veya token)
 * - Legacy x-auth-token header'ını her ihtimale karşı SİLER
 * - Relative URL'lerde /api çoğaltmasını engeller (/api/api => /api)
 * - Asset path fix: /uploads/... → backend origin ile birleştirir
 */

/* ----------------------------- base url normalize ----------------------------- */
function normalizeOrigin(raw) {
  const RAW = String(raw || "").trim();

  if (!RAW) return "http://localhost:5000";

  if (/^https?:\/\//i.test(RAW)) {
    return RAW.replace(/\/+$/, "").replace(/\/api$/i, "");
  }

  if (/^:\d+$/.test(RAW)) {
    return `http://localhost${RAW}`.replace(/\/api$/i, "");
  }

  return `http://${RAW}`.replace(/\/+$/, "").replace(/\/api$/i, "");
}

const ORIGIN = normalizeOrigin(
  import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_ROOT
);

// 🔥 Backend ORIGIN export
export const API_ORIGIN = ORIGIN;

// API_ROOT MUST end with /api
export const API_ROOT = `${ORIGIN}/api`.replace(/\/{2,}api$/i, "/api");

const isDev =
  !!import.meta.env?.DEV ||
  String(import.meta.env?.MODE || "").toLowerCase() !== "production";

if (isDev) {
  console.log("[axios-boot] ORIGIN =", ORIGIN);
  console.log("[axios-boot] API_ROOT =", API_ROOT);
}

/* ----------------------------- axios instance ----------------------------- */
export const api = axios.create({
  baseURL: API_ROOT,
  timeout: 20000,
  withCredentials: true,
});

// Güvence: global/instance legacy header temizliği
try {
  delete axios.defaults?.headers?.common?.["x-auth-token"];
  delete axios.defaults?.headers?.common?.["X-Auth-Token"];
  delete api.defaults?.headers?.common?.["x-auth-token"];
  delete api.defaults?.headers?.common?.["X-Auth-Token"];
} catch {}

/* ----------------------------- Token helper ----------------------------- */
function getToken() {
  try {
    if (typeof localStorage === "undefined") return "";
    return (
      localStorage.getItem("authToken") ||
      localStorage.getItem("token") ||
      ""
    );
  } catch {
    return "";
  }
}

/* ----------------------------- ASSET URL FIX ----------------------------- */
// 🔥🔥🔥 Canlıda görüntülerin çıkmasını sağlayan sihir burada 🔥🔥🔥
function fixAssetUrl(url) {
  if (!url) return url;
  const s = String(url).trim();

  // Full http/https ise dokunma
  if (/^https?:\/\//i.test(s)) return s;

  // /uploads/... → backend origin ile birleştir
  if (s.startsWith("/uploads")) {
    return `${API_ORIGIN}${s}`;
  }

  // Vercel yanlış çözerse (uploads/... → /uploads/...)
  if (s.startsWith("uploads/")) {
    return `${API_ORIGIN}/${s}`;
  }

  return s;
}

/* ----------------------------- relative path normalize ----------------------------- */
function normalizeRelativeUrl(url) {
  let u = String(url || "");

  // guarantee leading slash
  if (u && !u.startsWith("/")) u = "/" + u;

  // strip duplicated API prefix (avoid /api/api)
  if (/^\/api(\/|$)/i.test(u)) {
    u = u.replace(/^\/api/i, "");
    if (!u.startsWith("/")) u = "/" + u;
  }

  // collapse accidental double slashes
  u = u.replace(/([^:]\/)\/+/g, "$1");

  return u;
}

/* ----------------------------- request interceptor ----------------------------- */
api.interceptors.request.use((config) => {
  config.headers = config.headers || {};

  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  delete config.headers["x-auth-token"];
  delete config.headers["X-Auth-Token"];

  if (!config.headers.Accept) config.headers.Accept = "application/json";

  // 🔥 Asset Fix
  if (typeof config.url === "string") {
    config.url = fixAssetUrl(config.url);
  }

  // Relative URL normalize (/api/api fix)
  if (typeof config.url === "string" && !/^https?:\/\//i.test(config.url)) {
    config.url = normalizeRelativeUrl(config.url);
  }

  if (isDev) {
    const m = (config.method || "get").toUpperCase();
    const full = /^https?:\/\//i.test(config.url || "")
      ? config.url
      : API_ROOT + (config.url?.startsWith("/") ? "" : "/") + (config.url || "");
    console.debug(`[Axios] → ${m} ${full}`);
  }

  return config;
});

/* ----------------------------- response interceptor ----------------------------- */
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const cfg = error?.config || {};

    if (cfg._quiet || cfg.meta?.silentOnError) {
      return Promise.reject(error);
    }

    if (isDev) {
      try {
        const r = error?.response;
        const m = (cfg.method || "get").toUpperCase();
        const u = /^https?:\/\//i.test(cfg.url || "")
          ? cfg.url
          : API_ROOT +
            (cfg.url?.startsWith("/") ? "" : "/") +
            (cfg.url || "");

        console.groupCollapsed(`[Axios][ERR] ${m} ${u}`);
        console.log("status:", r?.status, r?.statusText);
        console.log("data:", r?.data);
        console.log("headers:", r?.headers);
        console.log("request headers:", cfg.headers);
        console.groupEnd();
      } catch {}
    }

    return Promise.reject(error);
  }
);

export default api;
