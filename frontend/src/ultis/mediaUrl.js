// src/utils/mediaUrl.js
// Tek gerçek kaynak: axios-boot → ORIGIN (…/api'siz)
// Eğer import başarısız olursa env'den/fallback'ten üretir.
let BOOT_ORIGIN;
try {
  // axios-boot.js içinde export edilen API_ORIGIN'i kullanıyoruz
  ({ API_ORIGIN: BOOT_ORIGIN } = await import("@/lib/axios-boot"));
} catch { /* noop - fallback'e düşer */ }

// ---- Env & fallback'lar ----
const RAW_API_ROOT = import.meta.env.VITE_API_ROOT || ""; // ör: http://localhost:5000/api
const RAW_API_URL  = import.meta.env.VITE_API_URL  || ""; // ör: http://localhost:5000
export const CDN_URL = (import.meta.env.VITE_CDN_URL || "").replace(/\/+$/, "");

// Backend origin (…/api yok):
export const ASSET_ORIGIN = (
  BOOT_ORIGIN ||
  (RAW_API_ROOT
    ? RAW_API_ROOT.replace(/\/api\/?$/, "")
    : (RAW_API_URL || "http://localhost:5000"))
).replace(/\/+$/, "");

/**
 * Generic media URL normalizer
 *
 * - http(s), data:, blob:, //cdn... URL'lerini KORUR.
 * - Tüm `\` karakterlerini `/` yapar, aşırı `//`'ları tekler.
 * - "/uploads/..." ve "/api/img?..." yollarını varsayılan olarak **mutlak** yapar (BE origin'e).
 * - Göreli gelenleri (dosya adı/klasör) akıllı biçimde "/uploads/..." altına bağlar.
 *
 * @param {string|string[]} p    - Yol ya da URL (dizi verilirse ilk dolu elemanı alır)
 * @param {object} ctx
 *   - ctx.absolute {boolean}  : true → her zaman mutlak yap, false → hep göreli bırak,
 *                               undefined → "/uploads" ve "/api/img" için mutlak, diğerleri göreli
 *   - ctx.dir {string}        : örn "/uploads/apply/abc123/"
 *   - ctx.applyId {string}    : yalnızca id; "/uploads/apply/<id>/" oluşturur
 *   - ctx.base {string}       : özel base dizini
 *   - ctx.origin {string}     : mutlak yaparken kullanılacak kök (varsayılan ASSET_ORIGIN)
 *   - ctx.cdn {string}        : mutlak yaparken CDN kökü (varsa origin yerine kullanılır)
 * @returns {string}
 */
export function mediaUrl(p, ctx = {}) {
  if (!p && p !== 0) return "";
  if (Array.isArray(p)) p = p.find(Boolean) ?? "";

  let s = String(p).trim();
  if (!s) return "";

  // Backslash → slash
  s = s.replace(/\\/g, "/");

  // Mutlak/protokollü URL'ler aynen kalsın
  const isHttp = /^https?:\/\//i.test(s);
  const isData = /^data:/i.test(s);
  const isBlob = /^blob:/i.test(s);
  if (isHttp || isData || isBlob) return s;

  // Protocol-relative: "//cdn..." → "https://cdn..." (veya sayfanın protokolü)
  if (/^\/\//.test(s)) {
    const proto = (typeof window !== "undefined" && window.location?.protocol) || "https:";
    return `${proto}${s}`;
  }

  // Çift slash'lı uploads → tekilleştir
  if (/^\/\/uploads\//i.test(s)) s = s.replace(/^\/\//, "/");

  // Kökten başlıyorsa (/uploads, /api/img, /foo/bar...)
  if (s.startsWith("/")) {
    const clean = squashSlashes(s);

    // /api/img veya /uploads ise varsayılan davranış: mutlak üret
    const mustAbsDefault = /^\/(uploads|api\/img)\b/i.test(clean);
    const needAbs = ctx.absolute ?? mustAbsDefault;
    if (needAbs) return joinUrlRoot(resolveRoot(ctx), clean);
    return clean; // göreli bırak
  }

  // Göreli (ör: "file.jpg", "dir/file.webp")
  const { path, queryHash } = splitQueryHash(s);

  // Base belirle: ctx.dir > ctx.applyId > ctx.base > "/uploads/"
  const base =
    (ctx.dir && ensureStartsWithSlash(ctx.dir)) ||
    (ctx.applyId && `/uploads/apply/${ctx.applyId}/`) ||
    (ctx.base && ensureStartsWithSlash(ctx.base)) ||
    "/uploads/";

  let joined = joinPath(base, path); // "/uploads/.../file.ext"

  const mustAbsDefault = /^\/(uploads|api\/img)\b/i.test(joined);
  const needAbs = ctx.absolute ?? mustAbsDefault;
  if (needAbs) joined = joinUrlRoot(resolveRoot(ctx), joined);

  return joined + queryHash;
}

/**
 * /uploads/... görselleri için hazır **img proxy** URL'i üretir.
 * uploads dışı bir URL gelirse aynen geri verir.
 *
 * @param {string} p
 * @param {object} opts
 *   - w {number}   : genişlik (default 800)
 *   - dpr {number} : device pixel ratio (default 2)
 *   - fit {string} : "cover" | "contain" | "inside"
 *   - fmt {string} : "auto" | "webp" | "avif" | "jpg"
 *   - cdn {string} : CDN origin (varsa ASSET_ORIGIN yerine bunu kullan)
 *   - absolute {boolean} : mediaUrl'a geçilecek absolute davranışı (default undefined)
 */
export function toPreview(p, opts = {}) {
  const { w = 800, dpr = 2, fit, fmt, cdn, absolute } = opts;
  if (!p) return "";

  // Önce "uploads" yolunu çıkar (absolute=false → relative "/uploads/..." üretelim ki parametreyi src olarak verelim)
  let rel = mediaUrl(p, { absolute: false });
  // Eğer zaten tam img-proxy URL'i gelmişse ya da http(s) ise direkt dön
  if (/^https?:\/\/.+\/api\/img\?/i.test(rel) || /^https?:\/\//i.test(rel)) return rel;

  // uploads değilse değiştirme
  if (!/^\/uploads\//i.test(rel)) return mediaUrl(p, { absolute });

  const root = (cdn || CDN_URL || ASSET_ORIGIN).replace(/\/+$/, "");
  const qs = new URLSearchParams({ src: rel, w: String(w), dpr: String(dpr) });
  if (fit) qs.set("fit", fit);
  if (fmt) qs.set("fmt", fmt);

  return `${root}/api/img?${qs.toString()}`;
}

/* ------------------------- helpers ------------------------- */

function splitQueryHash(s) {
  const m = /([^?#]*)(.*)/.exec(s) || [];
  return { path: m[1] || "", queryHash: m[2] || "" };
}

function ensureStartsWithSlash(x = "") {
  x = String(x);
  if (!x.startsWith("/")) x = "/" + x;
  return squashSlashes(x);
}

// base + rel → tek slash'lı birleştirme
function joinPath(base, rel) {
  const b = String(base || "").replace(/\/+$/, "");
  const r = String(rel || "").replace(/^\/+/, "");
  return squashSlashes(`${b}/${r}`);
}

// "https://host" + "/path" güvenli birleştirme
function joinUrlRoot(root, path) {
  const r = String(root || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${r}/${p}`;
}

// "http(s)://..." kısımlarını bozmayacak şekilde fazla slash'ları azalt
function squashSlashes(u) {
  return String(u).replace(/([^:]\/)\/+/g, "$1");
}

// Mutlak URL üretirken kullanılacak kök (CDN > ctx.origin > BE origin)
function resolveRoot(ctx = {}) {
  const prefer = ctx.cdn || CDN_URL || ctx.origin || null;
  if (prefer && /^https?:\/\//i.test(prefer)) return prefer.replace(/\/+$/, "");
  return ASSET_ORIGIN;
}

export default mediaUrl;
