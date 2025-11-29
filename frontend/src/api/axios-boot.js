// frontend/src/api/axios-boot.js — Ultra Pro Final (Cloudflare R2 Ready)
import axios from "axios";

/* ======================================================
   ORIGIN NORMALIZATION
====================================================== */
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

export const API_ORIGIN = ORIGIN;
export const API_ROOT = `${ORIGIN}/api`.replace(/\/{2,}api$/i, "/api");

const isDev =
  !!import.meta.env?.DEV ||
  String(import.meta.env?.MODE || "").toLowerCase() !== "production";

if (isDev) {
  console.log("[axios-boot] ORIGIN =", ORIGIN);
  console.log("[axios-boot] API_ROOT =", API_ROOT);
}

/* ======================================================
   INSTANCE
====================================================== */
export const api = axios.create({
  baseURL: API_ROOT,
  timeout: 20000,
  withCredentials: true,
});

/* Legacy token temizliği */
try {
  delete axios.defaults?.headers?.common?.["x-auth-token"];
  delete axios.defaults?.headers?.common?.["X-Auth-Token"];
  delete api.defaults?.headers?.common?.["x-auth-token"];
  delete api.defaults?.headers?.common?.["X-Auth-Token"];
} catch {}

/* ======================================================
   TOKEN
====================================================== */
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

/* ======================================================
   ASSET URL FIX
====================================================== */
function fixAssetUrl(url) {
  if (!url) return url;
  const s = String(url).trim();

  if (/^https?:\/\//i.test(s)) return s;

  if (s.startsWith("/uploads")) return `${API_ORIGIN}${s}`;
  if (s.startsWith("uploads/")) return `${API_ORIGIN}/${s}`;

  return s;
}

/* ======================================================
   RELATIVE URL FIX
====================================================== */
function normalizeRelativeUrl(url) {
  let u = String(url || "");

  if (u && !u.startsWith("/")) u = "/" + u;

  if (/^\/api(\/|$)/i.test(u)) {
    u = u.replace(/^\/api/i, "");
    if (!u.startsWith("/")) u = "/" + u;
  }

  return u.replace(/([^:]\/)\/+/g, "$1");
}

/* ======================================================
   REQUEST INTERCEPTOR
====================================================== */
api.interceptors.request.use((config) => {
  config.headers = config.headers || {};

  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  delete config.headers["x-auth-token"];
  delete config.headers["X-Auth-Token"];

  /* ===========================
     🔥 ÖNEMLİ: Upload Fix
     Eğer config.isUpload = true ise:
     - JSON content-type devre dışı
     - URL normalize edilmez
     - Axios FormData’yı bozmadan yollar
  ============================ */
  const isUpload = config.isUpload === true;

  if (isUpload) {
    config.headers["Content-Type"] = "multipart/form-data";
    return config;
  }

  /* Asset Fix */
  if (typeof config.url === "string") {
    config.url = fixAssetUrl(config.url);
  }

  /* Relative Normalize */
  if (
    typeof config.url === "string" &&
    !/^https?:\/\//i.test(config.url)
  ) {
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

/* ======================================================
   RESPONSE INTERCEPTOR
====================================================== */
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
