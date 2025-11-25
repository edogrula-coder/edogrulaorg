// frontend/src/components/ProofImages.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

/**
 * ProofImages — Ultra Pro (live-ready)
 *
 * - Sunucu klasör yapısı: /uploads/apply/:requestId/:filename
 * - files: ["01.jpg", ...] ya da {path, filename, mime, blur} nesneleri
 *
 * Props:
 *  - requestId: string (gerekli; absolute URL/path kullanımında allowWithoutRequestId=true yapabilirsiniz)
 *  - files: (string[] | {path:string, filename?:string, mime?:string, blur?:boolean}[])
 *  - base: string => default "/uploads/apply" (absolute URL de olabilir)
 *  - max: number => 0/undefined ise sınırsız; >0 ise +N daha döşemesi gösterir
 *  - allowWithoutRequestId: boolean => absolute URL/absolute path girdilerine izin verir
 *  - enableLightbox: boolean => varsayılan true
 *  - placeholder: string => kırık görseller için fallback
 *  - className: grid wrapper class
 *  - tileClassName: tek tile class override
 *  - thumbHeight: number => varsayılan 112px (h-28)
 */
export default function ProofImages({
  requestId,
  files = ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  base = "/uploads/apply",
  max = 0,
  allowWithoutRequestId = false,
  enableLightbox = true,
  placeholder = "/placeholder-image.webp",
  className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3",
  tileClassName = "",
  thumbHeight = 112,
}) {
  // Güvenlik: requestId yoksa yalnızca absolute src’lere izin ver
  const canRender = useMemo(() => {
    if (requestId) return true;
    if (!allowWithoutRequestId) return false;
    const arr = Array.isArray(files) ? files : [];
    return arr.some((f) => {
      const p = typeof f === "string" ? f : f?.path || f?.filename || "";
      return isAbsoluteUrl(p) || String(p).startsWith("/");
    });
  }, [requestId, allowWithoutRequestId, files]);

  if (!canRender) return null;

  const normalized = useMemo(() => {
    const ridRaw = String(requestId || "");
    const rid = ridRaw ? encodeURIComponent(ridRaw) : "";
    const cleanBase = String(base || "/uploads/apply").replace(/\/+$/, "");

    const list = (Array.isArray(files) ? files : []).map((f, idx) => {
      const rawPath = typeof f === "string" ? f : f?.path || f?.filename || "";
      const rawName =
        typeof f === "string"
          ? f
          : f?.filename || basename(rawPath) || `file-${idx + 1}`;

      // Dosya adı güvenliği: path traversal engelle
      const name = sanitizeFilename(rawName);
      const mime = typeof f === "string" ? guessMime(name) : f?.mime || guessMime(name);
      const blur = typeof f === "object" && !!f?.blur;

      let url = String(rawPath || "").trim();

      if (isAbsoluteUrl(url)) {
        // full url -> olduğu gibi
      } else if (url.startsWith("/")) {
        // root-relative -> olduğu gibi
      } else {
        // relative name/path -> /uploads/apply/:rid/:name
        // requestId yoksa (allowWithoutRequestId true) base/name yap
        url = rid
          ? safeJoin(cleanBase, rid, name)
          : safeJoin(cleanBase, name);
      }

      const isPdf = /pdf$/i.test(mime) || /\.pdf$/i.test(name);

      return {
        key: `${idx}-${name}`,
        url,
        name,
        mime,
        isPdf,
        blur,
      };
    });

    // Tekilleştir (canonical url)
    const seen = new Set();
    return list.filter((x) => {
      const u = String(x.url || "");
      if (!u) return false;
      const canon = u.replace(/#.*$/, "");
      if (seen.has(canon)) return false;
      seen.add(canon);
      return true;
    });
  }, [files, base, requestId]);

  // Gridde gösterilecekler (max kırpma)
  const show = useMemo(() => {
    const m = Number(max || 0);
    return m > 0 ? normalized.slice(0, m) : normalized;
  }, [normalized, max]);

  const restCount = Math.max(0, normalized.length - show.length);

  // Lightbox tüm non-pdf’ler üzerinden çalışır (max'tan bağımsız)
  const viewerItems = useMemo(
    () => normalized.filter((x) => !x.isPdf),
    [normalized]
  );

  // Lightbox state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openViewerAtGridIndex = useCallback(
    (gridIdx) => {
      if (!enableLightbox) return;

      const gridItem = show[gridIdx];
      if (!gridItem) return;

      if (gridItem.isPdf) {
        window.open(gridItem.url, "_blank", "noopener,noreferrer");
        return;
      }

      // grid item’ın viewerItems içindeki index’ini bul
      const vIdx = viewerItems.findIndex((v) => v.url === gridItem.url);
      setViewerIndex(vIdx >= 0 ? vIdx : 0);
      setViewerOpen(true);
    },
    [enableLightbox, show, viewerItems]
  );

  const openViewerDefault = useCallback(() => {
    if (!enableLightbox) return;
    // önce griddeki son non-pdf’e git, yoksa ilk non-pdf
    const lastNonPdfInShow = [...show].reverse().find((x) => !x.isPdf);
    const vIdx = lastNonPdfInShow
      ? viewerItems.findIndex((v) => v.url === lastNonPdfInShow.url)
      : 0;
    setViewerIndex(vIdx >= 0 ? vIdx : 0);
    setViewerOpen(true);
  }, [enableLightbox, show, viewerItems]);

  return (
    <>
      <div className={className}>
        {show.map((it, i) => (
          <Tile
            key={it.key}
            item={it}
            onOpen={() => openViewerAtGridIndex(i)}
            placeholder={placeholder}
            tileClassName={tileClassName}
            height={thumbHeight}
          />
        ))}

        {restCount > 0 && (
          <button
            type="button"
            onClick={openViewerDefault}
            title={`${restCount} daha`}
            className={`relative w-full rounded border border-slate-200 bg-white hover:bg-slate-50 transition ${tileClassName}`}
            style={{ height: thumbHeight }}
          >
            <div className="absolute inset-0 grid place-items-center text-slate-700 font-bold text-sm">
              +{restCount} daha
            </div>
          </button>
        )}
      </div>

      {enableLightbox && viewerOpen && (
        <Lightbox
          items={viewerItems}
          index={Math.min(viewerIndex, Math.max(0, viewerItems.length - 1))}
          onClose={() => setViewerOpen(false)}
          placeholder={placeholder}
        />
      )}
    </>
  );
}

/* ======================= Tile (Card) ======================= */
function Tile({ item, onOpen, placeholder, tileClassName, height }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // item değişince state reset
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [item.url]);

  if (item.isPdf) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`relative w-full rounded border border-slate-200 bg-white grid place-items-center hover:bg-slate-50 transition ${tileClassName}`}
        title={item.name}
        aria-label={`${item.name} (PDF) – yeni sekmede aç`}
        style={{ height }}
      >
        <div className="text-3xl">📄</div>
        <span className="sr-only">{item.name}</span>
      </a>
    );
  }

  const src = failed ? placeholder : item.url;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative w-full rounded overflow-hidden border border-slate-200 bg-slate-50 ${tileClassName}`}
      title={item.name}
      aria-label={`${item.name} görselini büyüt`}
      style={{ height }}
    >
      {!loaded && !failed && <Shimmer />}

      <img
        src={src}
        alt={item.name}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
        className="w-full h-full object-cover"
        style={{
          filter: item.blur ? "blur(6px)" : "none",
          transition: "filter .2s, opacity .25s",
          opacity: loaded ? 1 : 0,
        }}
        draggable={false}
      />

      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-white/90 text-slate-500 text-xs px-2">
          <span>Görsel yüklenemedi</span>
        </div>
      )}

      {/* Hover overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition bg-black/10" />

      {/* Actions */}
      <div className="absolute right-1.5 bottom-1.5 flex gap-1">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 rounded bg-white/95 border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          Aç
        </a>
        <a
          href={item.url}
          download={item.name}
          className="px-2 py-1 rounded bg-white/95 border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          İndir
        </a>
      </div>
    </button>
  );
}

/* ======================= Lightbox (Portal) ======================= */
function Lightbox({ items, index = 0, onClose, placeholder }) {
  const [i, setI] = useState(index);
  const wrapRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastFocus = useRef(null);
  const touchRef = useRef({ x: 0, y: 0 });

  const total = items.length;

  const clamp = useCallback(
    (n) => ((n % total) + total) % total,
    [total]
  );

  useEffect(() => {
    setI(clamp(index));
  }, [index, clamp]);

  useEffect(() => {
    if (!total) return;

    lastFocus.current = document.activeElement;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") setI((n) => clamp(n + 1));
      else if (e.key === "ArrowLeft") setI((n) => clamp(n - 1));
      else if (e.key === "Tab") trapFocus(e, wrapRef.current);
    };

    document.addEventListener("keydown", onKey, true);
    setTimeout(() => closeBtnRef.current?.focus?.(), 0);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.style.overflow = prev;
      lastFocus.current?.focus?.();
    };
  }, [total, clamp, onClose]);

  // swipe
  const onTouchStart = (e) => {
    touchRef.current.x = e.touches?.[0]?.clientX || 0;
    touchRef.current.y = e.touches?.[0]?.clientY || 0;
  };
  const onTouchEnd = (e) => {
    const dx = (e.changedTouches?.[0]?.clientX || 0) - touchRef.current.x;
    const dy = (e.changedTouches?.[0]?.clientY || 0) - touchRef.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
      setI((n) => clamp(n + (dx < 0 ? 1 : -1)));
    }
  };

  if (!total) return null;
  const cur = items[i];
  const src = cur?.url || placeholder;

  const portalNode = typeof document !== "undefined" ? document.body : null;
  if (!portalNode) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] bg-black/75 grid place-items-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        ref={wrapRef}
        className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-lg overflow-hidden shadow-2xl"
      >
        {/* header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white/90 gap-2">
          <div className="text-sm font-semibold truncate min-w-0">
            {cur?.name || "Görsel"}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-500 mr-1">
              {i + 1}/{total}
            </span>

            <button
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
              onClick={() => setI((n) => clamp(n - 1))}
              aria-label="Önceki (sol ok)"
              type="button"
            >
              ‹
            </button>
            <button
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
              onClick={() => setI((n) => clamp(n + 1))}
              aria-label="Sonraki (sağ ok)"
              type="button"
            >
              ›
            </button>

            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
            >
              Aç
            </a>
            <a
              href={src}
              download={cur?.name || "image"}
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
            >
              İndir
            </a>

            <button
              ref={closeBtnRef}
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
              onClick={onClose}
              aria-label="Kapat (Esc)"
              type="button"
            >
              ✕
            </button>
          </div>
        </div>

        {/* image */}
        <div className="relative w-full h-[70vh] bg-black flex items-center justify-center">
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img
            src={src}
            alt=""
            className="max-h-full max-w-full object-contain select-none"
            draggable={false}
            loading="eager"
            decoding="async"
            onError={(e) => {
              if (placeholder && e.currentTarget.src !== placeholder) {
                e.currentTarget.src = placeholder;
              }
            }}
          />
        </div>
      </div>
    </div>,
    portalNode
  );
}

/* ======================= Bits & utils ======================= */
function Shimmer() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(90deg, rgba(0,0,0,.04), rgba(0,0,0,.08), rgba(0,0,0,.04))",
        backgroundSize: "200% 100%",
        animation: "pf-sh 1.1s infinite linear",
      }}
      aria-hidden="true"
    >
      <style>{`@keyframes pf-sh {0%{background-position:0 0}100%{background-position:200% 0}}`}</style>
    </div>
  );
}

function isAbsoluteUrl(u = "") {
  return /^https?:\/\//i.test(String(u || ""));
}

function basename(p = "") {
  const s = String(p || "");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

// path traversal / slash / backslash temizliği
function sanitizeFilename(name = "") {
  let n = String(name || "").trim();
  n = n.replace(/\\/g, "/");
  n = n.split("/").pop();      // sadece son segment
  n = n.replace(/\.\.+/g, ".");// ".." zincirlerini kır
  n = n.replace(/[^\w.\-()]+/g, "_").slice(0, 120);
  return n || "file";
}

function safeJoin(...parts) {
  const segs = parts
    .filter(Boolean)
    .map((p) => String(p).trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return (
    (String(parts[0] || "").startsWith("http") ? "" : "/") +
    segs.join("/")
  ).replace(/\/{2,}/g, "/");
}

function guessMime(name = "") {
  const n = String(name).toLowerCase();
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

/** Focus trap inside a container */
function trapFocus(e, root) {
  if (!root) return;
  if (e.key !== "Tab") return;

  const Q =
    'a[href], button, textarea, input, select, summary, [tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(root.querySelectorAll(Q)).filter(
    (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden")
  );
  if (!nodes.length) return;

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const isShift = e.shiftKey;

  if (isShift && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!isShift && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}
