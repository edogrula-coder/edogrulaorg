// frontend/src/api/url.js — Ultra Pro (live-ready)

/**
 * Küçük ama güçlü path/url yardımcıları.
 * - pathFromRoot(...parts, opts?)  → "/uploads/apply/<id>/01.jpg"
 * - joinPath(base, ...parts)       → "uploads/apply/<id>/01.jpg" (başında slash YOK)
 * - withQuery(path, query)         → "/p?q=1&tags=a&tags=b"      (hash bozulmaz)
 * - withHash(path, hash)           → "/p?q=1#bölüm"
 * - normalizeDotSegments(path)     → "/a/b/../c" => "/a/c"
 * - stripSearchHash(path)          → "/a?x#y" => "/a"
 * - ensureLeadingSlash(path)       → "a/b" => "/a/b"
 */

const isPlainObject = (v) =>
  Object.prototype.toString.call(v) === "[object Object]";

const ABS_URL_RE = /^https?:\/\//i;

/**
 * KÖKTEN path üretir, segmentleri güvenle birleştirir, tek bir `/` ile başlatır.
 *
 * @param  {...any} parts  string|number|string[]|undefined karışık parçalar
 * @param {object} [opts]
 * @param {boolean} [opts.trailingSlash=false]  Sonda `/` bıraksın mı?
 * @param {boolean} [opts.normalizeDots=true]   "." ve ".." segmentlerini toparla
 * @param {boolean} [opts.encode=true]          Segmentleri encode et
 * @param {string}  [opts.base=""]              Başına bir base ekle (path veya mutlak URL)
 * @returns {string}
 */
export function pathFromRoot(...parts) {
  let opts = {};
  if (parts.length && isPlainObject(parts[parts.length - 1])) {
    const cand = parts[parts.length - 1];
    if (
      "trailingSlash" in cand ||
      "normalizeDots" in cand ||
      "encode" in cand ||
      "base" in cand
    ) {
      opts = parts.pop();
    }
  }

  const baseRaw = (opts.base ?? "").toString().trim();
  const normalizeDots = opts.normalizeDots !== false; // default: true
  const trailingSlash = !!opts.trailingSlash;
  const encode = opts.encode !== false; // default: true

  const segs = [];
  flatten(parts).forEach((p) => {
    if (p == null) return;
    let s = String(p).trim();
    if (!s) return;

    // iç slasha göre böl — çift slash oluşmasın
    s.split("/").forEach((piece) => {
      const t = piece.replace(/^\/+|\/+$/g, "");
      if (!t) return;
      segs.push(encode ? safeEncodeSegment(t) : t);
    });
  });

  let path = "/" + segs.join("/");

  if (normalizeDots) path = normalizeDotSegments(path);

  // base mutlak URL ise (örn CDN), URL birleştir
  if (baseRaw && ABS_URL_RE.test(baseRaw)) {
    try {
      const u = new URL(baseRaw);
      const joined = normalizeDotSegments(
        (u.pathname || "/").replace(/\/+$/, "") + path
      );
      u.pathname = joined;
      // trailing slash politikası URL üzerinde de uygulanır
      if (trailingSlash) {
        if (!u.pathname.endsWith("/")) u.pathname += "/";
      } else {
        if (u.pathname !== "/" && u.pathname.endsWith("/"))
          u.pathname = u.pathname.slice(0, -1);
      }
      return u.toString().replace(/\/{2,}/g, "/").replace(":/", "://");
    } catch {
      // base URL parse edilemezse path-base gibi davran
    }
  }

  // base path ise başa ekle
  if (baseRaw) {
    const b = ("/" + baseRaw)
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/, "");
    path = (b === "/" ? "" : b) + path;
    path = path.replace(/\/{2,}/g, "/");
  }

  // trailing slash politikası
  if (trailingSlash) {
    if (!path.endsWith("/")) path += "/";
  } else {
    if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
  }

  return path;
}

/**
 * Başında slash OLMAYAN relative path birleştirici.
 * İçeride pathFromRoot'u kullanır, sonra lider slash'ı söker.
 */
export function joinPath(base, ...parts) {
  const abs = pathFromRoot("", base, ...parts, {
    encode: true,
    normalizeDots: true,
  });

  // Mutlak URL döndüyse aynen bırak (edge-case), değilse baştaki slash'ı sök
  if (ABS_URL_RE.test(abs)) return abs;
  return abs === "/" ? "" : abs.replace(/^\/+/, "");
}

/** Path'e query ekler (string, URLSearchParams veya nesne). Hash korunur. */
export function withQuery(path, query) {
  const p = String(path || "");
  if (!query || (typeof query === "string" && !query.trim())) return p;

  // hash’i ayır, query’yi hash’ten önce ekle
  const [baseAndSearch, hashPart = ""] = p.split("#");
  const hash = hashPart ? "#" + hashPart : "";

  let qs = "";
  if (typeof query === "string") {
    qs = query.replace(/^\?/, "");
  } else if (typeof URLSearchParams !== "undefined" && query instanceof URLSearchParams) {
    qs = query.toString();
  } else if (isPlainObject(query)) {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v == null) return;
      if (Array.isArray(v)) v.forEach((vv) => vv != null && sp.append(k, String(vv)));
      else sp.append(k, String(v));
    });
    qs = sp.toString();
  }

  if (!qs) return p;

  const glued =
    baseAndSearch + (baseAndSearch.includes("?") ? "&" : "?") + qs;

  return glued + hash;
}

/** Path'e hash (#) ekler/değiştirir. */
export function withHash(path, hash) {
  if (!hash && hash !== 0) return String(path || "");
  const h = String(hash);
  return String(path || "").replace(/#.*$/, "") + (h ? (h.startsWith("#") ? h : "#" + h) : "");
}

/** "/a/b/../c/." → "/a/c" (yalnız path; protokol/host değil) */
export function normalizeDotSegments(path) {
  const raw = String(path || "");
  const leadingSlash = raw.startsWith("/");
  const parts = raw.split("/").filter((p) => p.length > 0);
  const out = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") {
      if (out.length) out.pop();
      continue;
    }
    out.push(p);
  }
  const joined = out.join("/");
  return (leadingSlash ? "/" : "") + joined;
}

/** Query ve hash’i kaldırır. */
export function stripSearchHash(path) {
  return String(path || "").replace(/[?#].*$/, "");
}

/** Başında tek ve sadece tek slash bırakır. */
export function ensureLeadingSlash(path) {
  const s = String(path || "");
  return "/" + s.replace(/^\/+/, "");
}

/* iç yardımcı */
function flatten(arr) {
  const out = [];
  arr.forEach((it) => {
    if (Array.isArray(it)) out.push(...flatten(it));
    else out.push(it);
  });
  return out;
}

/**
 * Segment encode: zaten encode edilmiş bir parçayı ikinci kez encode etmemeye çalışır.
 * (geçersiz % dizileri varsa sessizce normal encode’a düşer)
 */
function safeEncodeSegment(seg) {
  const s = String(seg);
  try {
    // önce decode dene → sonra encode et (double-encode riskini azaltır)
    return encodeURIComponent(decodeURIComponent(s));
  } catch {
    return encodeURIComponent(s);
  }
}

/* -------------------------
 * Örnekler:
 * pathFromRoot('uploads','apply', id, '01.jpg')      -> '/uploads/apply/<id>/01.jpg'
 * pathFromRoot('/uploads/apply/', id, '/01.jpg')     -> '/uploads/apply/<id>/01.jpg'
 * pathFromRoot('uploads','my folder','a b.png')      -> '/uploads/my%20folder/a%20b.png'
 * pathFromRoot('a','b',{trailingSlash:true})         -> '/a/b/'
 * withQuery('/x', { q:'test', tags:['a','b'] })      -> '/x?q=test&tags=a&tags=b'
 * withHash('/x?y=1','section')                       -> '/x?y=1#section'
 * joinPath('uploads','apply',id,'01.jpg')            -> 'uploads/apply/<id>/01.jpg'
 * ------------------------- */
