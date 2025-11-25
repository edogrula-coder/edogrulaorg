// src/lib/axios-boot.js
import axios from "axios";

/**
 * Ultra Pro axios bootstrap (live + SSR + adblock-safe)
 * - API_ROOT: env varsa origin/api, yoksa same-origin "/api"
 * - API_ORIGIN: origin (env yoksa "")
 * - Authorization: Bearer <token> (authToken -> token -> adminToken)
 * - Legacy x-auth-token header temizlenir
 * - /api/api double prefix engellenir
 * - Adblock/network block fallback retry (bir kere)
 * - SSR safe: window/localStorage/crypto yoksa patlamaz
 */

/* ========================= Origin & API root ========================= */

function getEnvSafe() {
  try {
    // Vite ortamında import.meta.env var
    if (typeof import.meta !== "undefined" && import.meta.env) {
      return import.meta.env;
    }
  } catch {}
  // Vite dışı SSR/Node için boş env
  return {};
}

function normalizeOrigin(raw) {
  const RAW = String(raw || "").trim();
  if (!RAW) return ""; // live'da same-origin fallback

  let t = "";
  if (/^https?:\/\//i.test(RAW)) t = RAW;
  else if (/^:\d+$/.test(RAW)) t = `http://localhost${RAW}`;
  else t = `http://${RAW}`;

  return t.replace(/\/+$/, "").replace(/\/api$/i, "");
}

const ENV = getEnvSafe();
const ORIGIN = normalizeOrigin(ENV.VITE_API_URL || ENV.VITE_API_ROOT);

// env yoksa "/api" ile same-origin çalış
export const API_ROOT = ORIGIN ? `${ORIGIN}/api` : "/api";
export const API_ORIGIN = ORIGIN || "";

/* ========================= Token helpers ========================= */

const TOKEN_KEYS = ["authToken", "token", "adminToken"];

const sanitizeToken = (v) =>
  String(v || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/[\r\n\t]/g, "");

function safeLocalStorageGet(k) {
  try {
    if (typeof window === "undefined") return "";
    return window.localStorage?.getItem(k) || "";
  } catch {
    return "";
  }
}

function safeLocalStorageSet(k, v) {
  try {
    if (typeof window === "undefined") return;
    if (v) window.localStorage?.setItem(k, v);
    else window.localStorage?.removeItem(k);
  } catch {}
}

export function getAuthToken() {
  for (const k of TOKEN_KEYS) {
    const t = sanitizeToken(safeLocalStorageGet(k));
    if (t) return t;
  }
  return "";
}

export function setAuthToken(token) {
  const clean = sanitizeToken(token);
  safeLocalStorageSet("authToken", clean);
  safeLocalStorageSet("token", clean); // legacy uyumluluk
}

export function clearAuthToken() {
  TOKEN_KEYS.forEach((k) => safeLocalStorageSet(k, ""));
}

// 401'de tetiklenecek opsiyonel callback
let onUnauthorized = null;
export function setOnUnauthorized(fn) {
  onUnauthorized = typeof fn === "function" ? fn : null;
}

/* ========================= Anti-adblock remap =========================
   /report*     -> /rpt*
   /blacklist*  -> /blk*
   /admin/*     -> /_adm/*
   Hem "/api/report" hem "/report" yakalanır.
====================================================================== */

function remapForAdblock(pathLike) {
  const u = String(pathLike || "");

  // absolute URL ise sadece pathname'i remap et
  try {
    if (/^https?:\/\//i.test(u)) {
      const url = new URL(u);
      url.pathname = remapForAdblock(url.pathname);
      return url.origin + url.pathname + url.search + url.hash;
    }
  } catch {
    // relative ya da invalid URL ise altta devam
  }

  let p = u;

  p = p.replace(/\/report(\/|$)/gi, "/rpt$1");
  p = p.replace(/\/blacklist(\/|$)/gi, "/blk$1");
  p = p.replace(/\/admin(\/|$)/gi, "/_adm$1");

  return p;
}

const RETRY_FLAG = "__antiBlockRetried";
const METHODS_WITH_BODY = new Set(["post", "put", "patch", "delete"]);

const isCancel = (e) =>
  e?.code === "ERR_CANCELED" ||
  e?.name === "CanceledError" ||
  (typeof axios.isCancel === "function" && axios.isCancel(e));

/* ========================= Axios instance ========================= */

const API = axios.create({
  baseURL: API_ROOT,
  withCredentials: true,
  timeout: 20000,
  headers: {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

// legacy header'ları globalde kökünden sökelim
try {
  delete axios.defaults?.headers?.common?.["x-auth-token"];
  delete API.defaults?.headers?.common?.["x-auth-token"];
} catch {}

/* ------------ Request interceptor ------------ */
API.interceptors.request.use((config = {}) => {
  config.headers = config.headers || {};

  // legacy header varsa sil
  try {
    delete config.headers["x-auth-token"];
  } catch {}

  const method = String(config.method || "get").toLowerCase();
  const hasBodyMethod = METHODS_WITH_BODY.has(method);
  const data = config.data;

  const isFormLike =
    data &&
    ((typeof FormData !== "undefined" && data instanceof FormData) ||
      (typeof URLSearchParams !== "undefined" &&
        data instanceof URLSearchParams) ||
      (typeof Blob !== "undefined" && data instanceof Blob) ||
      (typeof ArrayBuffer !== "undefined" &&
        data instanceof ArrayBuffer));

  // Content-Type sadece body’li ve form-like olmayanlarda
  if (
    hasBodyMethod &&
    data != null &&
    !isFormLike &&
    !config.headers["Content-Type"]
  ) {
    config.headers["Content-Type"] = "application/json";
  }

  // token -> Authorization
  const tok = getAuthToken();
  if (tok) config.headers.Authorization = `Bearer ${tok}`;

  // /api/api double prefix fix (relative url'lerde)
  if (typeof config.url === "string" && !/^https?:\/\//i.test(config.url)) {
    let u = config.url.trim();

    // baseURL ".../api" ise ve url "/api/..." gelmişse, birini at
    if (/\/api$/i.test(API_ROOT) && u.startsWith("/api/")) {
      u = u.replace(/^\/api\//i, "/");
    }

    u = u.replace(/\/{2,}/g, "/");
    config.url = u;
  }

  // absolute URL ise baseURL boş bırak (axios double-join yapmasın)
  if (typeof config.url === "string" && /^https?:\/\//i.test(config.url)) {
    config.baseURL = "";
  }

  return config;
});

/* ------------ Response interceptor ------------ */
API.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (isCancel(err)) return Promise.reject(err);

    const status = err?.response?.status;

    // 401 -> token temizle + callback
    if (status === 401) {
      clearAuthToken();
      if (onUnauthorized) {
        try {
          onUnauthorized(err);
        } catch {}
      }
      return Promise.reject(err);
    }

    const cfg = err?.config || {};
    const urlStr = String(cfg.url || "");

    // response yoksa / adblock / network block
    const looksBlocked =
      !err?.response &&
      (err?.code === "ERR_BLOCKED_BY_CLIENT" ||
        err?.code === "ERR_NETWORK" ||
        err?.message?.toLowerCase?.().includes("blocked") ||
        err?.message?.toLowerCase?.().includes("network error") ||
        typeof status === "undefined");

    // eligibility: admin/report/blacklist içeren route'lar
    const isEligiblePath =
      urlStr &&
      /(\/|^)(admin|report|blacklist|_adm|rpt|blk)(\/|$)/i.test(urlStr);

    if (looksBlocked && isEligiblePath && !cfg[RETRY_FLAG]) {
      cfg[RETRY_FLAG] = true;

      const remapped = remapForAdblock(urlStr);
      if (remapped !== urlStr) {
        if (ENV.DEV) {
          console.debug(
            "[axios-boot] Adblock remap:",
            urlStr,
            "→",
            remapped
          );
        }
        try {
          return await API.request({ ...cfg, url: remapped });
        } catch (e2) {
          return Promise.reject(e2);
        }
      }
    }

    return Promise.reject(err);
  }
);

if (ENV.DEV) {
  console.log("[axios-boot] API_ROOT =", API_ROOT);
}

export default API;
export const api = API;
