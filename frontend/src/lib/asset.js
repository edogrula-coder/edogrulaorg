// src/lib/asset.js

/**
 * asset/img helpers — Live + SSR + CDN safe
 *
 * Env priority:
 *  1) VITE_ASSET_ORIGIN or VITE_FILE_BASE_URL  (örn: https://cdn.edogrula.org)
 *  2) VITE_API_ROOT (örn: https://api.edogrula.org/api)
 *  3) VITE_API_URL  (örn: https://api.edogrula.org)
 *  4) same-origin (browser'da window.location.origin)
 */

const RAW_ASSET_ORIGIN =
  (import.meta.env.VITE_ASSET_ORIGIN ||
    import.meta.env.VITE_FILE_BASE_URL ||
    "").trim();

const RAW_API_ROOT = (import.meta.env.VITE_API_ROOT || "").trim(); // .../api olabilir
const RAW_API_URL  = (import.meta.env.VITE_API_URL  || "").trim(); // origin olabilir

function normalizeOrigin(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  // /api veya son slashları kırp
  s = s.replace(/\/api\/?$/i, "").replace(/\/+$/, "");
  return s;
}

function getBrowserOrigin() {
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin.replace(/\/+$/, "");
    }
  } catch {}
  return "";
}

// Final ORIGIN
const ORIGIN =
  normalizeOrigin(RAW_ASSET_ORIGIN) ||
  normalizeOrigin(RAW_API_ROOT) ||
  normalizeOrigin(RAW_API_URL) ||
  getBrowserOrigin() ||
  ""; // SSR'da boş kalabilir (relative çalışır)

/** Güvenli path normalize */
function normalizePath(p) {
  let s = String(p || "").trim();
  if (!s) return "";
  if (/^javascript:/i.test(s)) return "";
  // data/blob zaten mutlak ve güvenli
  if (/^(data:|blob:)/i.test(s)) return s;
  // absolute http(s)
  if (/^https?:\/\//i.test(s)) return s;
  // lider slash garanti et
  if (!s.startsWith("/")) s = "/" + s;
  // çift slashları temizle
  s = s.replace(/\/{2,}/g, "/");
  return s;
}

/**
 * Statik dosya için mutlak URL döndürür.
 * - src absolute ise dokunmaz.
 * - ORIGIN yoksa relative döner (same-origin).
 */
export function asset(p = "") {
  const path = normalizePath(p);
  if (!path) return "";
  if (/^(data:|blob:|https?:\/\/)/i.test(path)) return path;

  if (!ORIGIN) return path; // SSR/same-origin fallback
  return `${ORIGIN}${path}`;
}

/**
 * Görseli backend resizer üzerinden almak istersen
 * Endpoint: GET /api/img?src=/uploads/x.jpg&w=...&dpr=...&q=...
 */
export function img(
  src,
  {
    w = 1200,
    dpr,
    q = 82,
    fit = "cover",
    fmt = "auto",
    force = false, // true ise /api/img olsa bile yeniden sarmalar
  } = {}
) {
  const cleanSrc = normalizePath(src);
  if (!cleanSrc) return "";

  // data/blob resizer'a girmez
  if (/^(data:|blob:)/i.test(cleanSrc)) return cleanSrc;

  // zaten resizer ise tekrar sarmalama (force değilse)
  if (!force && cleanSrc.includes("/api/img?")) return cleanSrc;

  const effectiveDpr =
    typeof dpr === "number"
      ? Math.min(3, Math.max(1, dpr))
      : (() => {
          try {
            if (typeof window !== "undefined") {
              return Math.min(3, window.devicePixelRatio || 1);
            }
          } catch {}
          return 1;
        })();

  // absolute URL ise origin kısmını atıp path al (backend route'u relative bekler)
  let relativeSrc = cleanSrc;
  if (/^https?:\/\//i.test(cleanSrc)) {
    try {
      const u = new URL(cleanSrc);
      relativeSrc = u.pathname + u.search; // query'yi koru
    } catch {
      // parse edemezse olduğu gibi bırak
      relativeSrc = cleanSrc;
    }
  }

  // src paramında lider slash garanti olsun
  if (!relativeSrc.startsWith("/")) relativeSrc = "/" + relativeSrc;

  const params = new URLSearchParams({
    src: relativeSrc,
    w: String(w),
    dpr: String(effectiveDpr),
    q: String(q),
    fit,
    fmt,
  });

  const base = ORIGIN || ""; // same-origin ise relative bir URL üretir
  return `${base}/api/img?${params.toString()}`.replace(/([^:]\/)\/+/g, "$1");
}

// İsteyenler için export
export const ASSET_ORIGIN = ORIGIN;
