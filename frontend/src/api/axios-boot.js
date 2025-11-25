// frontend/src/api/axios-boot.js — Ultra Pro (Live/Vercel Ready)
import axios from "axios";

/**
 * Ultra Pro axios bootstrap
 * - Env toleranslı: VITE_API_URL / VITE_API_ROOT / origin / :5000 / .../api
 * - API_ROOT her zaman "<origin>/api" olur
 * - Authorization: Bearer <token> (authToken veya token)
 * - Legacy x-auth-token header'ını her ihtimale karşı SİLER
 * - Relative URL'lerde /api çoğaltmasını engeller (/api/api => /api)
 * - Dev logları sade, prod'da sessiz
 */

/* ----------------------------- base url normalize ----------------------------- */
function normalizeOrigin(raw) {
  const RAW = String(raw || "").trim();

  if (!RAW) return "http://localhost:5000";

  // full url
  if (/^https?:\/\//i.test(RAW)) {
    return RAW.replace(/\/+$/, "").replace(/\/api$/i, "");
  }

  // ":5000"
  if (/^:\d+$/.test(RAW)) {
    return `http://localhost${RAW}`.replace(/\/api$/i, "");
  }

  // "localhost:5000" (no protocol)
  return `http://${RAW}`.replace(/\/+$/, "").replace(/\/api$/i, "");
}

const ORIGIN = normalizeOrigin(
  import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_ROOT
);

// API_ROOT MUST end with /api
export const API_ROOT = `${ORIGIN}/api`.replace(/\/{2,}api$/i, "/api");

const isDev =
  !!import.meta.env?.DEV ||
  String(import.meta.env?.MODE || "").toLowerCase() !== "production";

if (isDev) {
  // eslint-disable-next-line no-console
  console.log("[axios-boot] ORIGIN =", ORIGIN);
  // eslint-disable-next-line no-console
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

/* ----------------------------- helpers ----------------------------- */
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

function normalizeRelativeUrl(url) {
  let u = String(url || "");

  // guarantee leading slash
  if (u && !u.startsWith("/")) u = "/" + u;

  // baseURL already ends with /api
  // so strip leading "/api" from relative paths
  if (/^\/api(\/|$)/i.test(u)) {
    u = u.replace(/^\/api/i, "");
    if (!u.startsWith("/")) u = "/" + u;
  }

  // collapse accidental double slashes (except protocol)
  u = u.replace(/([^:]\/)\/+/g, "$1");

  return u;
}

/* ----------------------------- request interceptor ----------------------------- */
api.interceptors.request.use((config) => {
  config.headers = config.headers || {};

  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // x-auth-token KESİNLİKLE gönderme
  delete config.headers["x-auth-token"];
  delete config.headers["X-Auth-Token"];

  // Accept default
  if (!config.headers.Accept) config.headers.Accept = "application/json";

  // Relative URL normalize (/api/api fix)
  if (typeof config.url === "string" && !/^https?:\/\//i.test(config.url)) {
    config.url = normalizeRelativeUrl(config.url);
  }

  if (isDev) {
    const m = (config.method || "get").toUpperCase();
    const full = /^https?:\/\//i.test(config.url || "")
      ? config.url
      : API_ROOT + (config.url?.startsWith("/") ? "" : "/") + (config.url || "");
    // eslint-disable-next-line no-console
    console.debug(`[Axios] → ${m} ${full}`);
  }

  return config;
});

/* ----------------------------- response interceptor ----------------------------- */
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const cfg = error?.config || {};

    // Fallback denemelerde sessiz kal
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

        // eslint-disable-next-line no-console
        console.groupCollapsed(`[Axios][ERR] ${m} ${u}`);
        // eslint-disable-next-line no-console
        console.log("status:", r?.status, r?.statusText);
        // eslint-disable-next-line no-console
        console.log("data:", r?.data);
        // eslint-disable-next-line no-console
        console.log("headers:", r?.headers);
        // eslint-disable-next-line no-console
        console.log("request headers:", cfg.headers);
        // eslint-disable-next-line no-console
        console.groupEnd();
      } catch {
        // no-op
      }
    }

    return Promise.reject(error);
  }
);

export default api;
