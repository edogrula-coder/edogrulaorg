// src/components/LightboxGallery.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
} from "react";
import { createPortal } from "react-dom";

/**
 * LightboxGallery — Ultra Pro, live-ready, erişilebilir galeri
 *
 * Props (geri uyumlu):
 *  - imagesAbs: string[]
 *  - title: string
 *  - heroHeight: CSS length
 *  - startIndex: number
 *  - maxThumbs: number
 *  - loop: boolean
 *  - showCounter: boolean
 *  - enableDownload: boolean
 *  - onIndexChange(i)
 *  - onOpenChange(open)
 *
 * Ek opsiyonlar:
 *  - placeholder: string (fallback görsel)
 *  - className: string
 *  - style: object
 *  - thumbSize: { w:number, h:number } (default 88x62)
 *  - prefetchNeighbors: boolean (default true)
 */
export default function LightboxGallery({
  imagesAbs = [],
  title = "",
  heroHeight = "clamp(220px, 44vw, 420px)",
  startIndex = 0,
  maxThumbs = 12,
  loop = true,
  showCounter = true,
  enableDownload = true,
  onIndexChange,
  onOpenChange,

  placeholder = "/placeholder-image.webp",
  className = "",
  style,
  thumbSize = { w: 88, h: 62 },
  prefetchNeighbors = true,
}) {
  const galleryId = useId();

  const safeImages = useMemo(() => {
    const arr = Array.isArray(imagesAbs) ? imagesAbs.filter(Boolean) : [];
    return arr;
  }, [imagesAbs]);

  const total = safeImages.length;
  const has = total > 0;

  // Kırık görselleri tek seferlik placeholder'a düşürmek için
  const brokenSetRef = useRef(new Set());

  const clampIndex = useCallback(
    (i) => {
      if (!total) return 0;
      const n = i | 0;
      return loop ? ((n % total) + total) % total : Math.min(Math.max(0, n), total - 1);
    },
    [total, loop]
  );

  const [idx, setIdx] = useState(() => clampIndex(startIndex));
  const [open, setOpen] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);

  // imagesAbs / startIndex değişince index'i güvenle güncelle
  useEffect(() => {
    setIdx(clampIndex(startIndex));
  }, [startIndex, clampIndex]);

  useEffect(() => {
    setIdx((prev) => clampIndex(prev));
  }, [total, clampIndex]);

  const img = has ? safeImages[idx] : null;

  const setIndex = useCallback(
    (i) => {
      if (!total) return;
      const next = clampIndex(i);
      setIdx(next);
      onIndexChange?.(next);
    },
    [total, clampIndex, onIndexChange]
  );

  const go = useCallback(
    (d) => {
      if (!total) return;
      setIndex(idx + d);
    },
    [idx, total, setIndex]
  );

  // Current hero değişince shimmer reset
  useEffect(() => {
    setHeroLoaded(false);
  }, [img]);

  // Komşu görselleri prefetch
  useEffect(() => {
    if (!prefetchNeighbors || !total) return;

    const preload = (i) => {
      const src = safeImages[clampIndex(i)];
      if (!src || brokenSetRef.current.has(src)) return;
      const im = new Image();
      im.decoding = "async";
      im.loading = "eager";
      im.src = src;
    };

    const run = () => {
      preload(idx + 1);
      preload(idx - 1);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 800 });
      return () => window.cancelIdleCallback(id);
    }
    run();
  }, [idx, total, safeImages, clampIndex, prefetchNeighbors]);

  // Focus yönetimi
  const lbWrapRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastFocusRef = useRef(null);

  const openLightbox = () => {
    lastFocusRef.current = document.activeElement;
    setOpen(true);
  };

  useEffect(() => {
    onOpenChange?.(open);

    if (open) {
      // body scroll lock
      const prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";

      // ilk focus
      setTimeout(() => closeBtnRef.current?.focus?.(), 0);

      return () => {
        document.documentElement.style.overflow = prevOverflow;
      };
    } else {
      // focus geri ver
      lastFocusRef.current?.focus?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Klavye (lightbox açıkken)
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "Escape") setOpen(false);
      else if (e.key === "Tab") trapFocus(e, lbWrapRef.current);
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, go]);

  // Touch swipe
  const heroTouch = useRef({ x: 0, y: 0 });
  const onHeroTouchStart = (e) => {
    heroTouch.current.x = e.touches?.[0]?.clientX || 0;
    heroTouch.current.y = e.touches?.[0]?.clientY || 0;
  };
  const onHeroTouchEnd = (e) => {
    const dx = (e.changedTouches?.[0]?.clientX || 0) - heroTouch.current.x;
    const dy = (e.changedTouches?.[0]?.clientY || 0) - heroTouch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) go(dx < 0 ? 1 : -1);
  };

  const lbTouch = useRef({ x: 0, y: 0 });
  const onLbTouchStart = (e) => {
    lbTouch.current.x = e.touches?.[0]?.clientX || 0;
    lbTouch.current.y = e.touches?.[0]?.clientY || 0;
  };
  const onLbTouchEnd = (e) => {
    const dx = (e.changedTouches?.[0]?.clientX || 0) - lbTouch.current.x;
    const dy = (e.changedTouches?.[0]?.clientY || 0) - lbTouch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) go(dx < 0 ? 1 : -1);
  };

  // img error -> placeholder (tek sefer)
  const renderSrc = (src) => {
    if (!src || brokenSetRef.current.has(src)) return placeholder;
    return src;
  };
  const onImgErrorMarkBroken = (src) => {
    if (!src) return;
    brokenSetRef.current.add(src);
  };

  const heroAlt = title || "galeri görseli";
  const downloadName = safeFileName(title || "image") + "-" + (idx + 1) + ".jpg";

  return (
    <>
      <style>{css}</style>

      {/* HERO */}
      <div
        className={`lg-hero ${className}`}
        style={{ height: heroHeight, ...style }}
        onTouchStart={onHeroTouchStart}
        onTouchEnd={onHeroTouchEnd}
        aria-label="Galeri ana görsel"
      >
        {img ? (
          <>
            {!heroLoaded && <Shimmer />}
            <img
              src={renderSrc(img)}
              alt={heroAlt}
              className="lg-hero-img"
              loading="eager"
              decoding="async"
              onLoad={() => setHeroLoaded(true)}
              onError={() => {
                onImgErrorMarkBroken(img);
                setHeroLoaded(true);
              }}
              draggable={false}
            />
          </>
        ) : (
          <div className="lg-hero-fallback" />
        )}

        {has && (
          <>
            <button
              className="lg-nav lg-left"
              aria-label="Önceki görsel"
              onClick={() => go(-1)}
              type="button"
            >
              ‹
            </button>
            <button
              className="lg-nav lg-right"
              aria-label="Sonraki görsel"
              onClick={() => go(1)}
              type="button"
            >
              ›
            </button>

            {/* Büyük tıklama alanı: lightbox aç */}
            <button
              className="lg-open"
              aria-label="Tam ekran görüntüle"
              title="Büyüt"
              onClick={openLightbox}
              type="button"
            />
          </>
        )}
      </div>

      {/* THUMB BAR */}
      {has && (
        <div
          className="lg-thumbs"
          role="listbox"
          aria-label="Galeri küçük resimler"
          aria-controls={`lg-lightbox-${galleryId}`}
        >
          {safeImages.slice(0, maxThumbs).map((src, i) => {
            const active = i === idx;
            return (
              <button
                key={`${i}-${src}`}
                role="option"
                aria-selected={active}
                className={`lg-thumb ${active ? "is-active" : ""}`}
                onClick={() => setIndex(i)}
                title={`${i + 1}. görsel`}
                type="button"
                style={{ width: thumbSize.w, height: thumbSize.h }}
              >
                <img
                  src={renderSrc(src)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={() => onImgErrorMarkBroken(src)}
                  draggable={false}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* LIGHTBOX (Portal) */}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id={`lg-lightbox-${galleryId}`}
              className="lg-lightbox"
              onClick={() => setOpen(false)}
              onTouchStart={onLbTouchStart}
              onTouchEnd={onLbTouchEnd}
              role="dialog"
              aria-modal="true"
              aria-label="Galeri tam ekran görüntüleyici"
            >
              <div
                className="lg-frame"
                ref={lbWrapRef}
                onClick={(e) => e.stopPropagation()}
              >
                <header className="lg-bar">
                  <div className="lg-leftside">
                    {showCounter && total > 0 && (
                      <span className="lg-counter">
                        {idx + 1} / {total}
                      </span>
                    )}
                    {title && (
                      <span className="lg-title" title={title}>
                        {title}
                      </span>
                    )}
                  </div>

                  <div className="lg-actions">
                    {enableDownload && img && (
                      <>
                        <a
                          href={renderSrc(img)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="lg-btn"
                        >
                          Aç
                        </a>
                        <a
                          href={renderSrc(img)}
                          download={downloadName}
                          className="lg-btn"
                        >
                          İndir
                        </a>
                      </>
                    )}

                    <button
                      ref={closeBtnRef}
                      className="lg-btn"
                      aria-label="Kapat"
                      onClick={() => setOpen(false)}
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                </header>

                <button
                  className="lg-nav lg-left lg-onlight"
                  onClick={() => go(-1)}
                  aria-label="Önceki görsel"
                  type="button"
                >
                  ‹
                </button>
                <button
                  className="lg-nav lg-right lg-onlight"
                  onClick={() => go(1)}
                  aria-label="Sonraki görsel"
                  type="button"
                >
                  ›
                </button>

                <div className="lg-stage">
                  <img
                    src={renderSrc(img)}
                    alt={heroAlt}
                    className="lg-lightbox-img"
                    draggable={false}
                    decoding="async"
                    onError={() => onImgErrorMarkBroken(img)}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/* --------- küçük yardımcılar --------- */
function Shimmer() {
  return (
    <div
      className="lg-shimmer"
      aria-hidden="true"
      style={{
        background:
          "linear-gradient(90deg, rgba(0,0,0,.06), rgba(0,0,0,.12), rgba(0,0,0,.06))",
        backgroundSize: "200% 100%",
        animation: "lg-sh 1.15s infinite linear",
      }}
    />
  );
}

function trapFocus(e, root) {
  if (!root) return;
  if (e.key !== "Tab") return;

  const focusables = root.querySelectorAll(
    'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
  const items = Array.from(focusables).filter(
    (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden")
  );

  if (!items.length) return;

  const first = items[0];
  const last = items[items.length - 1];
  const isShift = e.shiftKey;

  if (isShift && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!isShift && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

function safeFileName(s) {
  return String(s || "image")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

/* --------- stiller --------- */
const css = `
:root{
  --lg-border: var(--border, #e5e7eb);
  --lg-card: var(--card, #fff);
}

/* container */
.lg-hero{
  position: relative;
  border: 1px solid var(--lg-border);
  border-radius: 14px;
  overflow: hidden;
  background: #efe6d9;
  box-shadow: inset 0 2px 10px rgba(0,0,0,.04);
}
.lg-hero-img{
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  display: block; object-fit: cover;
}
.lg-hero-fallback{
  width:100%; height:100%;
  background: linear-gradient(0deg,#eee,#fafafa);
}
.lg-shimmer{
  position:absolute; inset:0; border-radius:inherit;
}
@keyframes lg-sh { 0%{background-position:0 0} 100%{background-position:200% 0} }

/* nav buttons */
.lg-nav{
  position: absolute; top: 50%; transform: translateY(-50%);
  border: 1px solid var(--lg-border);
  background: rgba(255,255,255,.92);
  border-radius: 10px;
  padding: 4px 10px;
  font-size: 22px; line-height: 1;
  cursor: pointer; user-select: none;
  transition: transform .12s ease, background .12s ease;
}
.lg-nav:hover{ transform: translateY(-50%) scale(1.03); }
.lg-left{ left: 8px; }
.lg-right{ right: 8px; }
.lg-open{
  position: absolute; inset: 0;
  background: transparent; border: 0; cursor: zoom-in;
}

/* thumbs */
.lg-thumbs{
  display: flex; gap: 8px; margin-top: 10px;
  overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin;
}
.lg-thumb{
  flex: 0 0 auto;
  border-radius: 8px; overflow: hidden;
  background: var(--lg-card); border: 1px solid var(--lg-border);
  padding: 0; cursor: pointer;
}
.lg-thumb.is-active{
  outline: 2px solid #111827;
  outline-offset: -2px;
}
.lg-thumb img{
  width: 100%; height: 100%;
  object-fit: cover; display: block;
}

/* lightbox */
.lg-lightbox{
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,.88);
  display: grid; place-items: center; padding: 16px;
}
.lg-frame{
  position: relative; width: min(98vw, 1100px);
  max-height: 92vh; display: grid;
  grid-template-rows: auto 1fr; gap: 8px;
}
.lg-bar{
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 6px; border-radius: 10px;
  background: rgba(15, 23, 42, .5); color: #fff;
  backdrop-filter: blur(6px);
}
.lg-leftside{ display:flex; align-items:center; gap:8px; min-width:0 }
.lg-title{
  opacity:.95; font-weight:700; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; max-width:48vw
}
.lg-counter{
  font-weight:800; padding:2px 6px;
  background:rgba(255,255,255,.12); border-radius:999px
}

.lg-actions{ display:flex; gap:6px; }
.lg-btn{
  border:1px solid rgba(255,255,255,.35);
  background: rgba(255,255,255,.15);
  color:#fff; font-weight:700; padding:6px 10px;
  border-radius:10px; cursor:pointer;
  transition: background .12s ease, transform .12s ease;
}
.lg-btn:hover{ background: rgba(255,255,255,.25); transform: translateY(-1px); }

.lg-onlight{
  background: rgba(255,255,255,.18);
  border-color: rgba(255,255,255,.3);
  color: #fff;
}

.lg-stage{
  position: relative; border-radius: 12px; overflow:hidden;
  background: #000; display:grid; place-items:center;
  height: min(88vh, 70vw);
}
.lg-lightbox-img{
  max-width: 100%; max-height: 100%;
  object-fit: contain; user-select:none;
}

/* reduced motion */
@media (prefers-reduced-motion: reduce){
  .lg-nav, .lg-btn{ transition: none !important; }
  .lg-shimmer{ animation: none !important; }
}

/* responsive */
@media (max-width: 540px){
  .lg-thumb{ width: 72px !important; height: 50px !important; }
  .lg-title{ display:none }
}
`;
