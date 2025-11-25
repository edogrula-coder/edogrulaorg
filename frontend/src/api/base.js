// src/api/base.js — Ultra Pro (Live/Vercel Ready)

/**
 * Amaç:
 * - VITE_API_URL / VITE_API_ROOT her formatta gelse de normalize et:
 *   "https://site.com", "https://site.com/api", "localhost:5000", ":5000", "/api"
 * - API_ROOT her zaman:
 *   - env varsa "<origin>/api"  (tek kez)
 *   - env yoksa same-origin "/api"
 * - apiPath: mutlak URL ise dokunma, değilse "/api" prefix'ini sök ve göreli dön
 * - apiUrl: göreliyi API_ROOT ile birleştir
 */

function normalizeOrigin(raw) {
  const RAW = String(raw || "").trim();

  if (!RAW) return ""; // same-origin

  // same-origin path verilmişse ("/api" gibi)
  if (RAW.startsWith("/")) {
    // "/api" veya "/backend/api" gibi path'lerde origin yoktur
    return RAW.replace(/\/+$/, "").replace(/\/api$/i, "");
  }

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

const RAW =
  (import.meta.env?.VITE_API_URL ||
    import.meta.env?.VITE_API_ROOT ||
    "").trim();

const ORIGIN = normalizeOrigin(RAW);

// API_ROOT: daima .../api ile biter.
// ORIGIN "" ise same-origin "/api" döner.
// ORIGIN "/backend" ise "/backend/api" gibi göreli root döner.
export const API_ROOT = (() => {
  if (!ORIGIN) return "/api";

  // ORIGIN bir path ise ("/api" veya "/backend")
  if (ORIGIN.startsWith("/")) {
    const base = ORIGIN.replace(/\/+$/, "");
    return (base.toLowerCase().endsWith("/api") ? base : `${base}/api`)
      .replace(/\/{2,}/g, "/");
  }

  // ORIGIN mutlak origin ise
  return `${ORIGIN}/api`.replace(/\/{2,}api$/i, "/api");
})();

// İstersen debug için kullanırsın
export const API_ORIGIN = ORIGIN || "";

/**
 * apiPath(p):
 *  - Mutlak URL ise (http/https) olduğu gibi geri döndürür.
 *  - Onun dışında daima GÖRELİ bir path döndürür ("/admin/...", "/report/..."),
 *    kesinlikle "/api" ile başlamaz (çift /api'yi engeller).
 */
export function apiPath(p = "/") {
  let s = String(p || "").trim();

  // 1) Mutlak URL ise aynen kullan
  if (/^https?:\/\//i.test(s)) return s;

  // 2) Baştaki "/" garanti et
  s = s ? (s.startsWith("/") ? s : `/${s}`) : "/";

  // 3) "/api" ve tekrarlı "/api/api" öneklerini sök
  //    "/api" -> "/" ; "/api/xyz" -> "/xyz"
  while (s === "/api" || s.startsWith("/api/")) {
    s = s === "/api" ? "/" : s.slice(4);
    if (!s.startsWith("/")) s = "/" + s;
  }

  // 4) Çift slash normalize (protocol yok → güvenli)
  s = s.replace(/([^:]\/)\/+/g, "$1");

  return s;
}

/**
 * apiUrl(p):
 *  - Mutlak URL ise aynen döner.
 *  - Göreli path ise API_ROOT ile birleştirir → tam URL üretir.
 */
export function apiUrl(p = "/") {
  const path = apiPath(p);
  if (/^https?:\/\//i.test(path)) return path; // zaten mutlak

  const root = API_ROOT.replace(/\/+$/, "");
  const full = `${root}${path}`; // path her zaman "/" ile başlar

  // son bir güvenlik: double slash temizle (protocol yok)
  return full.replace(/([^:]\/)\/+/g, "$1");
}
