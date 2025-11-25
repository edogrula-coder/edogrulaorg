// frontend/src/components/SafeImg.jsx — Ultra Pro (live-ready)
import React from "react";

/**
 * Güvenli, performanslı <img/> sarmalayıcı.
 *
 * Özellikler:
 * - URL temizleme: çift // gider, javascript: engeli, base ile birleştirme
 * - allowExternal=false iken mutlak URL’i güvenle bloklar
 * - Hata olduğunda tek seferlik fallback’a geçiş (loop yok)
 * - Lazy-loading + async decoding
 * - Blur-up (düşük çözünürlüklü önizleme) + iskelet shimmer
 * - CSS aspect-ratio ile kutu oranını koruma
 * - object-fit kontrolü, yuvarlak köşe, sınıf/stil geçişi
 * - srcSet normalize (relatif url’ler base ile birleşir)
 *
 * Props:
 *  - src: string
 *  - alt: string = ""
 *  - fallback: string = "/placeholder-image.webp"
 *  - base: string (opsiyonel, relatif path’leri bununla birleştirir)
 *  - allowExternal: boolean = true (http/https/data/blob izin ver)
 *  - blurSrc: string (opsiyonel)
 *  - aspectRatio: string | number (örn "16/9" ya da 1.5)
 *  - fit: "cover" | "contain" | "fill" | "none" | "scale-down" = "cover"
 *  - rounded: number | boolean = 12 (true → 12px, false/0 → yok)
 *  - className, style: wrapper’a uygulanır
 *  - imgClassName, imgStyle: direkt <img>’e uygulanır
 *  - loading, decoding: varsayılan "lazy" & "async"
 *  - onLoad, onError: img eventleri
 *  - ...rest: <img>’e iletilir (srcSet, sizes, width, height, ref dahil)
 */

ensureSafeImgKeyframes();

const SafeImg = React.forwardRef(function SafeImg(
  {
    src,
    alt = "",
    fallback = "/placeholder-image.webp",
    base = "",
    allowExternal = true,
    blurSrc,
    aspectRatio,
    fit = "cover",
    rounded = 12,
    className,
    style,
    imgClassName,
    imgStyle,
    loading = "lazy",
    decoding = "async",
    onLoad,
    onError,
    ...rest
  },
  ref
) {
  const safeSrc = React.useMemo(
    () => normalizeSrc(src, { base, allowExternal }),
    [src, base, allowExternal]
  );

  const safeFallback = React.useMemo(
    () => normalizeSrc(fallback, { base, allowExternal: true }),
    [fallback, base]
  );

  const [shownSrc, setShownSrc] = React.useState(
    safeSrc || safeFallback
  );
  const [didError, setDidError] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // src değiştiğinde state’i sıfırla
  React.useEffect(() => {
    setShownSrc(safeSrc || safeFallback);
    setDidError(false);
    setLoaded(false);
  }, [safeSrc, safeFallback]);

  const handleLoad = (e) => {
    setLoaded(true);
    onLoad?.(e);
  };

  const handleError = (e) => {
    if (!didError && shownSrc !== safeFallback) {
      setDidError(true);
      setShownSrc(safeFallback);
    }
    onError?.(e);
  };

  // rounded normalize
  const radius =
    typeof rounded === "boolean"
      ? rounded
        ? 12
        : 0
      : Math.max(0, Number(rounded) || 0);

  const wrapperStyle = {
    position: "relative",
    overflow: "hidden",
    borderRadius: radius,
    ...style,
    ...(aspectRatio
      ? {
          aspectRatio:
            typeof aspectRatio === "number"
              ? String(aspectRatio)
              : String(aspectRatio),
          width: wrapperHasWidth(style)
            ? style.width
            : "100%",
        }
      : {}),
  };

  const imageStyle = {
    width: "100%",
    height: "100%",
    objectFit: fit,
    display: "block",
    transition: "opacity .25s ease",
    opacity: loaded ? 1 : 0,
    ...imgStyle,
  };

  const normalizedBlur =
    blurSrc
      ? normalizeSrc(blurSrc, {
          base,
          allowExternal: true,
        })
      : "";

  const normalizedSrcSet = normalizeSrcSet(
    rest?.srcSet,
    { base, allowExternal }
  );

  return (
    <div className={className} style={wrapperStyle}>
      {/* Blur-up arkaplan */}
      {normalizedBlur && !loaded && (
        <img
          src={normalizedBlur}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit,
            filter: "blur(14px)",
            transform: "scale(1.06)",
            opacity: 0.6,
          }}
        />
      )}

      {/* Shimmer iskelet */}
      {!loaded && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,.05), rgba(0,0,0,.08), rgba(0,0,0,.05))",
            backgroundSize: "200% 100%",
            animation: "safeimg-sh 1.1s linear infinite",
          }}
        />
      )}

      {/* Gerçek görsel */}
      <img
        ref={ref}
        src={shownSrc}
        srcSet={normalizedSrcSet}
        alt={alt}
        loading={loading}
        decoding={decoding}
        onLoad={handleLoad}
        onError={handleError}
        className={imgClassName}
        style={imageStyle}
        {...rest}
      />
    </div>
  );
});

export default SafeImg;

/* -------------------- yardımcılar -------------------- */

let _safeImgKFInjected = false;

function ensureSafeImgKeyframes() {
  if (_safeImgKFInjected) return;
  _safeImgKFInjected = true;

  // SSR guard
  if (typeof document === "undefined") return;

  const id = "safeimg-keyframes";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    @keyframes safeimg-sh {
      0% { background-position: 0 0 }
      100% { background-position: 200% 0 }
    }
  `;
  document.head.appendChild(style);
}

function normalizeSrc(input, { base = "", allowExternal = true } = {}) {
  let s = (input ?? "").toString().trim();
  if (!s) return "";

  // Güvenlik: javascript: engeli
  if (/^javascript:/i.test(s)) return "";

  // protocol-relative //cdn.com/img.png
  if (/^\/\//.test(s)) {
    if (!allowExternal) return "";
    return `https:${s}`;
  }

  // Mutlak URL’ler
  if (/^(data:|blob:|https?:\/\/)/i.test(s)) {
    return allowExternal ? s : "";
  }

  // Baştaki fazla slash'ları tek slasha indir
  s = s.replace(/^\/+/, "/");
  if (!s.startsWith("/")) s = "/" + s;

  const b = (base || "").toString().trim();
  if (!b) return s;

  // base absolute veya relative olabilir
  const cleanedBase = b.replace(/\/+$/, "");
  return `${cleanedBase}${s}`;
}

function normalizeSrcSet(srcSet, { base = "", allowExternal = true } = {}) {
  if (!srcSet || typeof srcSet !== "string") return srcSet;

  // "url1 1x, url2 2x" gibi parçala
  const parts = srcSet
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (!parts.length) return srcSet;

  const normParts = parts.map((p) => {
    const [u, ...rest] = p.split(/\s+/);
    const nu = normalizeSrc(u, { base, allowExternal });
    return nu ? [nu, ...rest].join(" ") : "";
  }).filter(Boolean);

  return normParts.join(", ");
}

function wrapperHasWidth(st) {
  if (!st) return false;
  const w = st.width ?? st.maxWidth ?? st.minWidth;
  return !!w;
}
