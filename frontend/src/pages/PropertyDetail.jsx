import React from "react";
import { mediaUrl } from "@/utils/mediaUrl"; // alias yoksa "../utils/mediaUrl"

/* =========================================================================
   Görsel Yardımcıları (SSR-safe + proxy)
   ====================================================================== */

const IS_BROWSER = typeof window !== "undefined";

function canUseImgProxy(u) {
  try {
    const url = String(u || "");
    if (!url) return false;
    if (url.startsWith("/uploads/")) return true;
    if (!IS_BROWSER) return false;
    const parsed = new URL(url, window.location.origin);
    return /^\/uploads\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function imgProxy(
  src,
  { w = 1200, dpr = 1, q = 82, fit = "cover", fmt = "auto" } = {}
) {
  if (!canUseImgProxy(src)) return src;
  const base = "/api/img";
  const path = src.startsWith("/uploads/")
    ? src
    : new URL(src, IS_BROWSER ? window.location.origin : "http://localhost")
        .pathname;

  const params = new URLSearchParams({
    src: path,
    w: String(w),
    dpr: String(dpr),
    q: String(q),
    fmt,
    fit,
  });
  return `${base}?${params.toString()}`;
}

function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x || "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

const FALLBACK = "/placeholder-image.webp";

/* =========================================================================
   Güvenli Img bileşeni
   - lazy/eager kontrolü
   - proxy + srcSet
   - skeleton
   - unmount guard
   ====================================================================== */
function Img({
  src,
  alt = "",
  ctx,
  width = 1200,
  height,
  fit = "cover",
  className,
  imgClassName,
  style,
  loading = "lazy",
  fetchPriority, // "high" | "low" | "auto"
  ...props
}) {
  const resolved = mediaUrl(src, ctx);
  const [url, setUrl] = React.useState(resolved || FALLBACK);
  const [loaded, setLoaded] = React.useState(false);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    const u = mediaUrl(src, ctx) || FALLBACK;
    setUrl(u);
    setLoaded(false);
    return () => {
      aliveRef.current = false;
    };
  }, [src, ctx]);

  const srcSet = React.useMemo(() => {
    if (!canUseImgProxy(url)) return undefined;
    const widths = [
      width,
      Math.round(width * 1.5),
      width * 2,
      480,
      768,
      1024,
      1440,
    ]
      .map((w) => Math.max(480, Math.min(w, 2400)))
      .sort((a, b) => a - b);

    const unique = uniq(widths);
    return unique
      .map((w) => `${imgProxy(url, { w, dpr: 1, fit })} ${w}w`)
      .join(", ");
  }, [url, width, fit]);

  const sizes =
    "(max-width: 640px) 96vw, (max-width: 1200px) 70vw, 1200px";

  const dpr =
    (IS_BROWSER && window.devicePixelRatio) ? window.devicePixelRatio : 1;

  const effectiveSrc = canUseImgProxy(url)
    ? imgProxy(url, { w: width, dpr, fit })
    : url;

  const onError = React.useCallback(() => {
    if (url !== FALLBACK) setUrl(FALLBACK);
  }, [url]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        background: "#f3f4f6",
        overflow: "hidden",
        borderRadius: 12,
        ...style,
      }}
    >
      {!loaded && (
        <div
          aria-hidden="true"
          className="img-skeleton"
          style={{
            position: "absolute",
            inset: 0,
          }}
        />
      )}

      <img
        src={effectiveSrc}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={() => aliveRef.current && setLoaded(true)}
        onError={onError}
        className={imgClassName}
        style={{
          display: "block",
          width: "100%",
          height: height ? height : "100%",
          objectFit: fit,
          transition: "opacity .2s ease",
          opacity: loaded ? 1 : 0,
        }}
        {...props}
      />

      {/* Keyframes tek noktadan */}
      <style>{imgCss}</style>
    </div>
  );
}

const imgCss = `
  .img-skeleton{
    background: linear-gradient(90deg, rgba(0,0,0,.04), rgba(0,0,0,.07), rgba(0,0,0,.04));
    background-size: 200% 100%;
    animation: sweep 1.2s infinite linear;
  }
  @keyframes sweep { 
    0%{background-position:0 0} 
    100%{background-position:-200% 0} 
  }
  @media (prefers-reduced-motion: reduce){
    .img-skeleton{ animation: none; }
  }
`;

/* =========================================================================
   Lightbox (ESC, oklar, swipe, scroll lock)
   ====================================================================== */
function Lightbox({ images = [], index = 0, onClose, onStep }) {
  const total = images.length;
  const hasImages = total > 0;

  const [i, setI] = React.useState(index);

  // index prop değişirse sync
  React.useEffect(() => setI(index), [index]);

  const step = React.useCallback(
    (delta) => {
      if (!hasImages) return;
      setI((cur) => {
        const next = (cur + delta + total) % total;
        onStep?.(next);
        return next;
      });
    },
    [total, hasImages, onStep]
  );

  // keyboard
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  // scroll lock
  React.useEffect(() => {
    if (!IS_BROWSER) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const current = hasImages ? images[i] : FALLBACK;

  const touch = React.useRef({ x: 0, y: 0 });
  const onTouchStart = (e) => {
    touch.current.x = e.touches[0].clientX;
    touch.current.y = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30)
      step(dx < 0 ? 1 : -1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Büyütülmüş görsel"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={lbBackdrop}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Kapat"
        style={lbCloseBtn}
      >
        ✕
      </button>

      {hasImages && (
        <div style={lbCounter}>
          {i + 1} / {total}
        </div>
      )}

      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <Img
          src={current}
          alt={`galeri görseli ${i + 1}`}
          fit="contain"
          width={1400}
          loading="eager"
          fetchPriority="high"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 8,
            background: "transparent",
          }}
        />

        <button
          type="button"
          aria-label="Önceki"
          onClick={() => step(-1)}
          style={lbNav("left")}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Sonraki"
          onClick={() => step(1)}
          style={lbNav("right")}
        >
          ›
        </button>
      </div>
    </div>
  );
}

const lbBackdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.85)",
  backdropFilter: "blur(4px)",
  zIndex: 1000,
  display: "grid",
  placeItems: "center",
  padding: 8,
};
const lbCloseBtn = {
  position: "fixed",
  top: 12,
  right: 12,
  width: 36,
  height: 36,
  borderRadius: 99,
  border: "none",
  background: "rgba(0,0,0,.4)",
  color: "#fff",
  cursor: "pointer",
  zIndex: 1001,
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
};
const lbCounter = {
  position: "fixed",
  top: 18,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "6px 12px",
  borderRadius: 99,
  background: "rgba(0,0,0,.4)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
};
function lbNav(side) {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 4,
    width: 40,
    height: 40,
    borderRadius: 99,
    border: "none",
    background: "rgba(0,0,0,.4)",
    color: "#fff",
    cursor: "pointer",
    zIndex: 5,
    display: "grid",
    placeItems: "center",
    fontSize: 24,
    lineHeight: 1,
  };
}

/* =========================================================================
   Ana Bileşen
   ====================================================================== */
export default function PropertyDetail({ property }) {
  if (!property) return null;

  const applyId =
    property?.applyId ||
    property?.apply?._id ||
    property?.apply?.id ||
    property?.sourceId ||
    property?._id;

  // gallery güvenli normalize
  const gallery = React.useMemo(() => {
    const raw =
      property?.images ||
      property?.photos ||
      property?.gallery ||
      [];

    const mapped = (raw || [])
      .filter(Boolean)
      .map((p) => mediaUrl(p, { applyId }));

    const coverFirst = [
      mediaUrl(property?.cover || raw?.[0], { applyId }),
      ...mapped,
    ].filter(Boolean);

    return uniq(coverFirst);
  }, [property, applyId]);

  const images = gallery.length ? gallery : [FALLBACK];
  const total = images.length;
  const [idx, setIdx] = React.useState(0);
  const [openLB, setOpenLB] = React.useState(false);

  React.useEffect(() => setIdx(0), [images]);

  // preload next/prev
  React.useEffect(() => {
    if (total <= 1) return;

    const preload = (j) => {
      const src = images[j];
      const x = new Image();
      x.src = canUseImgProxy(src)
        ? imgProxy(src, { w: 960, dpr: 1 })
        : src;
    };
    preload((idx + 1) % total);
    preload((idx - 1 + total) % total);
  }, [idx, images, total]);

  const go = React.useCallback(
    (delta) => setIdx((cur) => (cur + delta + total) % total),
    [total]
  );

  // keyboard arrows on page
  React.useEffect(() => {
    const onKey = (e) => {
      if (openLB) return; // lightbox zaten dinliyor
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, openLB]);

  // swipe hero
  const touch = React.useRef({ x: 0, y: 0 });
  const onTouchStart = (e) => {
    touch.current.x = e.touches[0].clientX;
    touch.current.y = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30)
      go(dx < 0 ? 1 : -1);
  };

  const current = images[idx] || FALLBACK;
  const title = property?.title || property?.name || "İşletme";
  const arrowsDisabled = total <= 1;

  return (
    <>
      <style>{pageCss}</style>

      {/* Hero / Slider */}
      <div
        className="hero"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={heroWrap}
      >
        <button
          type="button"
          onClick={() => setOpenLB(true)}
          aria-label="Görseli büyüt"
          style={zoomBtn}
        >
          Büyüt 🔍
        </button>

        {/* İstersen yeni sekmede açma kalsın */}
        <a
          href={current}
          target="_blank"
          rel="noopener noreferrer"
          className="hero-link"
          aria-label="Görseli yeni sekmede aç"
        >
          <Img
            src={current}
            alt={title}
            ctx={{ applyId }}
            width={1400}
            loading="eager"
            fetchPriority="high"
          />
        </a>

        <button
          type="button"
          aria-label="Önceki"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          style={navBtnStyle("left", arrowsDisabled)}
          disabled={arrowsDisabled}
        >
          ‹
        </button>

        <button
          type="button"
          aria-label="Sonraki"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          style={navBtnStyle("right", arrowsDisabled)}
          disabled={arrowsDisabled}
        >
          ›
        </button>

        <div aria-hidden="true" style={counterPill}>
          {idx + 1}/{total}
        </div>
      </div>

      {/* Thumbnail’lar */}
      {total > 1 && (
        <div className="thumbnails-container" aria-label="Galeri küçük resimler">
          {images.map((p, i) => {
            const active = i === idx;
            return (
              <button
                key={`${p}-${i}`}
                type="button"
                onClick={() => setIdx(i)}
                aria-current={active ? "true" : "false"}
                aria-pressed={active}
                aria-label={`Görsel ${i + 1}`}
                className={`thumb-btn ${active ? "active" : ""}`}
              >
                <Img
                  src={p}
                  alt={`foto ${i + 1}`}
                  ctx={{ applyId }}
                  width={360}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Başlık */}
      <div style={{ marginTop: 8, padding: "0 8px" }}>
        <h2 style={{ margin: "8px 0 4px", fontSize: 22, fontWeight: 800 }}>
          {title}
        </h2>
      </div>

      {openLB && (
        <Lightbox
          images={images}
          index={idx}
          onClose={() => setOpenLB(false)}
          onStep={(n) => setIdx(n)}
        />
      )}
    </>
  );
}

/* ============================ Styles / Helpers ============================ */

const pageCss = `
  .hero { height: 300px; }
  @media (min-width: 640px) { .hero { height: 420px; } }

  .hero-link{
    display:block;
    width:100%;
    height:100%;
  }

  .thumbnails-container {
    display:flex;
    gap:10px;
    padding:12px 0;
    overflow-x:auto;
    scrollbar-width:none;
  }
  .thumbnails-container::-webkit-scrollbar { display:none; }

  .thumb-btn{
    flex-shrink:0;
    width: clamp(72px, 22vw, 90px);
    height: clamp(52px, 16vw, 64px);
    border-radius:10px;
    overflow:hidden;
    border:1px solid #e5e7eb;
    padding:0;
    cursor:pointer;
    background:#fff;
    transition: border-color .2s, transform .12s ease;
    outline:none;
  }
  .thumb-btn.active{
    border:3px solid #111827;
    transform: translateY(-1px);
  }

  @media (min-width:768px){
    .thumbnails-container{
      flex-wrap:wrap;
      overflow-x:visible;
      padding:12px 8px;
    }
  }
`;

const heroWrap = {
  position: "relative",
  borderRadius: 16,
  overflow: "hidden",
  background: "#efe9e2",
};

const zoomBtn = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 6,
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.1)",
  background: "rgba(255,255,255,.92)",
  padding: "6px 12px",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 6px 18px rgba(0,0,0,.10)",
};

const counterPill = {
  position: "absolute",
  bottom: 12,
  right: 12,
  zIndex: 6,
  background: "rgba(0,0,0,.5)",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 999,
  padding: "4px 10px",
  fontWeight: 800,
  color: "#fff",
  fontSize: 13,
};

function navBtnStyle(side, disabled = false) {
  const size = "clamp(32px, 7vw, 36px)";
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 8,
    width: size,
    height: size,
    borderRadius: "clamp(10px, 2vw, 12px)",
    border: "1px solid rgba(0,0,0,0.1)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
    cursor: disabled ? "not-allowed" : "pointer",
    zIndex: 5,
    pointerEvents: disabled ? "none" : "auto",
    display: "grid",
    placeItems: "center",
    fontSize: "clamp(16px, 4vw, 20px)",
    lineHeight: 1,
    opacity: disabled ? 0 : 1,
    transition: "opacity .2s",
  };
}
