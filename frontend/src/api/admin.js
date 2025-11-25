// frontend/src/api/admin.js — Ultra Pro (Live-ready)
// Not: Export yüzeyi kırılmadı. Sadece sağlamlaştırıldı.

import axios from "axios";
import { API_ROOT, apiPath } from "./base.js";

/* ------------------------------------------------------------------
   Admin API — güvenli path + sağlam fallbacks
   - Mutlak URL’de baseURL kullanılmaz; göreli URL’de baseURL=API_ROOT
   - Auth: localStorage("authToken") → Authorization: Bearer
   - CSV export (Blob) + normalize list
   - Retry sadece network/time-outlarda
   - Tüm liste: listBusinesses({ all:true }) veya limit/status geç
------------------------------------------------------------------- */

/* --------------------------- Token utils --------------------------- */
export function getAdminToken() {
  try { return localStorage.getItem("authToken") || ""; } catch { return ""; }
}
export function setAdminToken(token) {
  try {
    token
      ? localStorage.setItem("authToken", token)
      : localStorage.removeItem("authToken");
  } catch {}
}
export function clearAdminToken() { setAdminToken(""); }

/* ----------------------------- Helpers ----------------------------- */
const cleanParams = (obj = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
};

const saveBlobAs = (blob, name = `export-${Date.now()}.csv`) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;

  // Firefox/Safari için DOM’a ekle
  document.body.appendChild(a);
  a.click();
  a.remove();

  // revoke hemen değil, bir tick sonra
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const filenameFromCD = (cd = "") => {
  try {
    const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd || "");
    const raw = (m?.[1] || m?.[2] || "").trim();
    if (!raw) return null;
    try { return decodeURIComponent(raw); } catch { return raw; }
  } catch {
    return null;
  }
};

const isCSV = (ct = "") =>
  /text\/csv|application\/(vnd\.ms-excel|csv)/i.test(ct || "");

const normalizeList = (data, fallback = []) => {
  const items =
    data?.items ??
    data?.businesses ??
    data?.requests ??
    data?.data?.items ??
    (Array.isArray(data) ? data : fallback);

  const total =
    data?.total ??
    data?.count ??
    data?.data?.total ??
    (Array.isArray(items) ? items.length : 0);

  const page = data?.page ?? 1;
  const limit =
    data?.limit ??
    data?.perPage ??
    (Array.isArray(items) ? items.length : 20);

  const pages =
    data?.pages ??
    Math.max(1, Math.ceil((total || 0) / (limit || 1)));

  return {
    success: !!(data?.success ?? true),
    items: Array.isArray(items) ? items : [],
    total,
    page,
    pages,
    limit,
  };
};

const isFormLike = (data) => {
  if (!data) return false;
  if (typeof FormData !== "undefined" && data instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && data instanceof URLSearchParams) return true;
  if (typeof Blob !== "undefined" && data instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) return true;
  return false;
};

// Debug için tek satır hata mesajı
const unwrapErrorMessage = (e) =>
  e?.response?.data?.message ||
  e?.message ||
  "Beklenmedik hata";

/* -------------------------- Axios instance -------------------------- */
export const api = axios.create({
  withCredentials: true, // backend CORS credentials açık; Authorization ile uyumlu
  timeout: 15000,
});

// Güvence: x-auth-token header’ı asla gitmesin
try {
  delete axios.defaults?.headers?.common?.["x-auth-token"];
  delete api.defaults?.headers?.common?.["x-auth-token"];
} catch {}

// Request interceptor: token + Accept + URL normalizasyonu
api.interceptors.request.use((config) => {
  const tok = getAdminToken();
  config.headers = config.headers || {};

  // ✅ Sadece Authorization kullan
  if (tok) config.headers.Authorization = `Bearer ${tok}`;
  delete config.headers["x-auth-token"];

  if (!config.headers.Accept) config.headers.Accept = "application/json";

  // JSON için Content-Type; FormData/Blob gibi ise dokunma
  if (
    !config.headers["Content-Type"] &&
    config.data &&
    !isFormLike(config.data)
  ) {
    config.headers["Content-Type"] = "application/json";
  }

  // apiPath ile normalize et
  if (typeof config.url === "string") {
    const normalized = apiPath(config.url); // "/admin/..." veya mutlak
    config.url = normalized;

    if (/^https?:\/\//i.test(normalized)) {
      // mutlak URL: baseURL kullanma
      delete config.baseURL;
    } else {
      config.baseURL = API_ROOT || "";
    }
  }

  return config;
});

// Response interceptor: 401/403 → token temizleme
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const base = err?.config?.baseURL || "";
    const url = err?.config?.url || "";
    const full = `${base}${url}`;

    if (
      (status === 401 || status === 403) &&
      (full.includes("/auth/me") ||
        full.includes("/admin/") ||
        full.includes("/_adm/"))
    ) {
      clearAdminToken();
      // İstersen live’da login’e at:
      // window.location.href = "/admin/login";
    }

    return Promise.reject(err);
  }
);

/* --------------------------- Low-level request --------------------------- */
const isRetryableNetworkError = (e) => {
  if (e?.response) return false; // response varsa retry yok
  const code = String(e?.code || "");
  const msg = String(e?.message || "");
  return (
    code === "ECONNABORTED" ||
    code === "ERR_NETWORK" ||
    /timeout/i.test(msg) ||
    /network/i.test(msg)
  );
};

const request = async (cfg, { retry = 0 } = {}) => {
  let lastErr;
  for (let i = 0; i <= retry; i++) {
    try {
      const url =
        typeof cfg.url === "string"
          ? apiPath(cfg.url)
          : cfg.url;

      const isAbsolute =
        typeof url === "string" &&
        /^https?:\/\//i.test(url);

      const baseURL = isAbsolute ? undefined : (API_ROOT || "");

      return await api.request({
        ...cfg,
        url,
        ...(baseURL !== undefined ? { baseURL } : {}),
      });
    } catch (e) {
      lastErr = e;
      if (!isRetryableNetworkError(e) || i === retry) break;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
};

const ENV_DEFAULT_LIMIT =
  Number(import.meta?.env?.VITE_ADMIN_LIST_LIMIT ?? 1000) || 1000;

const ENV_DEFAULT_STATUS =
  String(import.meta?.env?.VITE_ADMIN_LIST_STATUS ?? "all").toLowerCase();

/* ============================ Businesses ============================ */
export async function listBusinesses(opts = {}) {
  const {
    q = "",
    page = 1,
    limit = ENV_DEFAULT_LIMIT,
    sort = "-createdAt",
    fields = "",
    from,
    to,
    status = ENV_DEFAULT_STATUS,
    verified,
    hidden,
    format,
    signal,
    retry = 1,
    all = false,
    mode,
    maxPages = 200,
  } = opts;

  const params = cleanParams({
    q, page, limit, sort, fields, from, to,
    ...(status ? { status } : {}),
    ...(verified !== undefined ? { verified } : {}),
    ...(hidden !== undefined ? { hidden } : {}),
    ...(format ? { format } : {}),
  });

  // CSV export
  if (format === "csv") {
    const res = await request(
      {
        url: "/admin/businesses",
        method: "GET",
        params,
        responseType: "blob",
        signal,
      },
      { retry }
    );

    const ct = res.headers?.["content-type"] || "";
    if (!isCSV(ct)) {
      try {
        const txt = await res.data.text();
        const json = JSON.parse(txt);
        throw new Error(json?.message || "CSV beklenirken beklenmedik yanıt");
      } catch {
        throw new Error("CSV indirilemedi.");
      }
    }

    const name =
      filenameFromCD(res.headers?.["content-disposition"]) ||
      "businesses.csv";

    saveBlobAs(res.data, name);
    return { success: true, downloaded: true, filename: name };
  }

  const fetchModeAll = all || mode === "all";
  if (!fetchModeAll) {
    const res = await request(
      { url: "/admin/businesses", method: "GET", params, signal },
      { retry }
    );
    return normalizeList(res.data, []);
  }

  // all-mode (sayfa sayfa biriktir)
  let curPage = Number(params.page) || 1;
  const perPage = Number(params.limit) || 200;
  const acc = [];
  let total = 0, pages = 1, firstLimit;

  for (let i = 0; i < maxPages; i++) {
    const res = await request(
      {
        url: "/admin/businesses",
        method: "GET",
        params: { ...params, page: curPage },
        signal,
      },
      { retry }
    );

    const norm = normalizeList(res.data, []);
    if (i === 0) {
      total = norm.total || 0;
      pages = norm.pages || 1;
      firstLimit = norm.limit || perPage;
    }

    if (Array.isArray(norm.items) && norm.items.length) acc.push(...norm.items);

    if (!norm.items?.length || curPage >= pages || acc.length >= total) break;
    if (norm.items.length < (norm.limit || firstLimit || perPage)) break;

    curPage += 1;
  }

  return {
    success: true,
    items: acc,
    total: total || acc.length,
    page: 1,
    pages,
    limit: firstLimit || perPage,
  };
}

/* ============================== Requests ============================ */
export async function listRequests(opts = {}) {
  const {
    status = "pending",
    q = "",
    page = 1,
    limit = 20,
    sort = "-createdAt",
    fields = "",
    from,
    to,
    format,
    signal,
    retry = 1,
  } = opts;

  const params = cleanParams({
    q, page, limit, sort, fields, from, to,
    ...(status && status !== "all" ? { status } : {}),
    ...(format ? { format } : {}),
  });

  if (format === "csv") {
    const res = await request(
      {
        url: "/admin/requests",
        method: "GET",
        params,
        responseType: "blob",
        signal,
      },
      { retry }
    );

    const ct = res.headers?.["content-type"] || "";
    if (!isCSV(ct)) throw new Error("CSV indirilemedi.");

    const name =
      filenameFromCD(res.headers?.["content-disposition"]) ||
      "requests.csv";

    saveBlobAs(res.data, name);
    return { success: true, downloaded: true, filename: name };
  }

  const res = await request(
    { url: "/admin/requests", method: "GET", params, signal },
    { retry }
  );

  return normalizeList(res.data, []);
}

export async function approveRequest(id, { signal } = {}) {
  try {
    await request({
      url: `/admin/requests/${encodeURIComponent(id)}/status`,
      method: "PATCH",
      data: { status: "approved" },
      signal,
    });
    return;
  } catch (e) {
    if (![404, 405].includes(e?.response?.status)) throw e;
  }

  try {
    await request({
      url: `/admin/requests/${encodeURIComponent(id)}/approve`,
      method: "POST",
      signal,
    });
    return;
  } catch (e) {
    if (![404, 405].includes(e?.response?.status)) throw e;
  }

  await request({
    url: `/apply/${encodeURIComponent(id)}/approve`,
    method: "POST",
    signal,
  });
}

export async function rejectRequest(id, rejectReason = "", { signal } = {}) {
  try {
    await request({
      url: `/admin/requests/${encodeURIComponent(id)}/status`,
      method: "PATCH",
      data: { status: "rejected", rejectReason },
      signal,
    });
    return;
  } catch (e) {
    if (![404, 405].includes(e?.response?.status)) throw e;
  }

  try {
    await request({
      url: `/admin/requests/${encodeURIComponent(id)}/reject`,
      method: "POST",
      data: { rejectReason },
      signal,
    });
    return;
  } catch (e) {
    if (![404, 405].includes(e?.response?.status)) throw e;
  }

  await request({
    url: `/apply/${encodeURIComponent(id)}/reject`,
    method: "POST",
    data: { rejectReason },
    signal,
  });
}

export async function bulkSetRequestStatus(
  ids = [],
  status = "approved",
  rejectReason = "",
  { signal } = {}
) {
  const { data } = await request({
    url: `/admin/requests/bulk-status`,
    method: "PATCH",
    data: { ids, status, rejectReason },
    signal,
  });
  return data;
}

/* ------------------------- Convenience exports -------------------- */
export async function listBusinessesAll(opts = {}) {
  return listBusinesses({ ...opts, all: true });
}

/* ------------------------- Default export -------------------------- */
export default {
  api,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  listBusinesses,
  listBusinessesAll,
  listRequests,
  approveRequest,
  rejectRequest,
  bulkSetRequestStatus,
  unwrapErrorMessage, // yeni ama break etmiyor
};
