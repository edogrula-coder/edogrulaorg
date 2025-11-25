// frontend/src/pages/Search.jsx

import React, { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  FaInstagram,
  FaWhatsapp,
  FaMagnifyingGlass,
  FaXmark,
  FaTag,
  FaPhone,
  FaGlobe,
  FaLocationDot,
  FaTriangleExclamation,
  FaCircleInfo,
  FaLink,
} from "react-icons/fa6";

/* ================== CONSTANTS ================== */
const API_BASE_RAW = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
// VITE_API_URL '/api' ile gelmişse köke indir (çift /api engeli)
const API_ROOT = API_BASE_RAW.replace(/\/api(?:\/v\d+)?$/i, "");
const STATUS = {
  VERIFIED: "verified",
  BLACKLIST: "blacklist",
  NOT_FOUND: "not_found",
  ERROR: "error",
};

/* ================== API INSTANCE ================== */
const api = axios.create({
  baseURL: API_ROOT || undefined,
  withCredentials: true,
  timeout: 12000,
  headers: { Accept: "application/json" },
});

/* ================== HELPER FUNCTIONS ================== */
function normalizePhoneTR(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("90")) return `+${digits}`;
  if (digits.startsWith("0")) return `+90${digits.slice(1)}`;
  if (digits.length === 10) return `+90${digits}`;
  if (digits.startsWith("9") && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}
const looksLikePhoneDigits = (s) => {
  const d = String(s || "").replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13;
};
const isIgHandle = (s) =>
  /^[a-z0-9._]{1,30}$/i.test(s) && /[a-z]/i.test(s); // en az bir harf şartı -> @0543... telefon sanılsın

function classifyQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) return { ok: false, reason: "empty" };

  const noAt = q.replace(/^@+/, ""); // baştaki @ sadece görsel; sınıflandırmada dikkate alma

  // 1) Instagram URL
  const igUrlRe =
    /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/([A-Za-z0-9._]{1,30})(\/)?(\?.*)?$/i;
  if (igUrlRe.test(noAt)) {
    const username = noAt.replace(igUrlRe, "$4");
    const pretty = `https://instagram.com/${username}`;
    return { ok: true, type: "ig_url", value: username, username, pretty };
  }

  // 2) Telefon (başındaki '@' silinse bile)
  if (looksLikePhoneDigits(noAt)) {
    const e164 = normalizePhoneTR(noAt);
    return { ok: true, type: "phone", value: e164, pretty: e164 };
  }

  // 3) Domain/Website
  const siteRe = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([:\/?#].*)?$/i;
  if (siteRe.test(noAt)) {
    const url = /^https?:\/\//i.test(noAt) ? noAt : `https://${noAt}`;
    let host = noAt;
    try {
      host = new URL(url).hostname.replace(/^www\./i, "");
    } catch {}
    // Backend'e host gönder, kullanıcıya güzel URL göster
    return { ok: true, type: "website", value: host, pretty: url };
  }

  // 4) Instagram kullanıcı adı (en az bir harf içeren)
  if (isIgHandle(noAt)) {
    return { ok: true, type: "ig_username", value: noAt, username: noAt, pretty: `@${noAt}` };
  }

  return {
    ok: false,
    reason:
      "Lütfen Instagram kullanıcı adı, Instagram URL’si, telefon numarası veya web sitesi girin.",
  };
}

function useQueryQ() {
  const loc = useLocation();
  return new URLSearchParams(loc.search).get("q") || "";
}

/* ================== MAIN PAGE COMPONENT ================== */
export default function Search() {
  const navigate = useNavigate();
  const qParam = useQueryQ();

  const [query, setQuery] = useState(qParam);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  const controllerRef = useRef(null);

  // Theme Management
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    const root = document.documentElement;
    const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const mode = saved === "system" ? (sysDark ? "dark" : "light") : saved;
    root.dataset.theme = mode;
  }, []);

  // Offline/Online Status
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Sync URL query param with state
  useEffect(() => {
    if (qParam && qParam !== query) setQuery(qParam);
  }, [qParam]);

  const updateURL = useCallback(
    (cls) => {
      const pretty = cls.pretty || cls.value;
      navigate({ search: `?q=${encodeURIComponent(pretty)}` }, { replace: true });
    },
    [navigate]
  );

  const doSearch = useCallback(
    async (raw) => {
      const cls = classifyQuery(raw ?? query);
      if (!cls.ok) {
        setResult({ status: STATUS.ERROR });
        setShowModal(true);
        return;
      }
      updateURL(cls);

      controllerRef.current?.abort?.();
      controllerRef.current = new AbortController();

      try {
        setLoading(true);
        const { data } = await api.get(
          "/api/businesses/search", // baseURL kökte; burada /api ile daima doğru
          {
            params: { q: cls.value, type: cls.type },
            signal: controllerRef.current.signal,
          }
        );
        setResult(data && typeof data === "object" ? data : { status: STATUS.ERROR });
        setShowModal(true);
      } catch (e) {
        if (axios.isCancel?.(e)) return;
        setResult({ status: STATUS.ERROR });
        setShowModal(true);
      } finally {
        setLoading(false);
      }
    },
    [query, updateURL]
  );

  useEffect(() => {
    return () => controllerRef.current?.abort?.();
  }, []);

  const onKeyDown = (e) => e.key === "Enter" && doSearch();

  return (
    <div style={styles.page}>
      <style>{globalCSS}</style>
      <PageHeader navigate={navigate} />

      {offline && (
        <div role="status" style={styles.offline}>
          Şu an çevrimdışısın — sonuçlar güncellenemeyebilir.
        </div>
      )}

      <main style={styles.center}>
        <img src="/logo.png" alt="E-Doğrula" style={styles.logo} />
        <div className="stack">
          <SearchBar
            query={query}
            setQuery={setQuery}
            onKeyDown={onKeyDown}
            doSearch={doSearch}
            loading={loading}
            offline={offline}
          />
          <div style={styles.quickRow}>
            <button
              className="ghost-pill"
              onClick={() => navigate("/sapanca-bungalov-evleri")}
              title="Sapanca bungalov evleri"
            >
              Sapanca bungalov evleri
            </button>
          </div>
        </div>
        <HowToUseCard />
      </main>

      <PageFooter />

      {showModal && (
        <ResultModal onClose={() => setShowModal(false)}>
          <ResultCard result={result} />
        </ResultModal>
      )}
    </div>
  );
}

/* ================== SUB-COMPONENTS ================== */
const PageHeader = ({ navigate }) => (
  <nav style={styles.navWrap} aria-label="Üst menü">
    <div style={styles.navSpacer} />
    <div style={styles.navRight}>
      <button className="link ghost-pill" onClick={() => navigate("/apply")}>
        İşletmeni doğrula
      </button>
      <button className="link ghost-pill" onClick={() => navigate("/report")}>
        Şikayet et / Rapor et
      </button>
    </div>
  </nav>
);

const SearchBar = ({
  query,
  setQuery,
  onKeyDown,
  doSearch,
  loading,
  offline,
}) => (
  <div style={styles.searchBarWrap} role="search" className="glass">
    <span className="lead-icon" aria-hidden>
      <FaMagnifyingGlass />
    </span>
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder="Instagram kullanıcı adı, Instagram URL’si, telefon numarası veya web sitesi…"
      aria-label="Arama"
      style={styles.searchInput}
      inputMode="search"
    />
    {/* X (temizle) ve kopyalama/yapıştırma butonları kaldırıldı */}
    <button
      className={`btn primary ${loading ? "loading" : ""}`}
      onClick={() => doSearch()}
      disabled={loading || offline}
      aria-busy={loading}
      aria-label="Ara"
      title="Ara"
      style={styles.searchIconBtn}
    >
      {loading ? <LoadingDots /> : <FaMagnifyingGlass />}
    </button>
  </div>
);

const HowToUseCard = () => (
  <section style={styles.howtoCard} className="glass" aria-labelledby="howto-title">
    <header style={styles.howtoHeader} id="howto-title">
      E-Doğrula nasıl kullanılır?
    </header>
    <ul style={styles.howtoList}>
      <li>
        <span className="howto-icon">
          <FaInstagram />
        </span>
        Instagram kullanıcı adı yazın: <code>@edogrula</code> veya <code>edogrula</code>
      </li>
      <li>
        <span className="howto-icon">
          <FaLink />
        </span>
        Instagram profil linki girin: <code>https://instagram.com/edogrula</code>
      </li>
      <li>
        <span className="howto-icon">
          <FaPhone />
        </span>
        Telefon yazın: <code>+905069990554</code>
      </li>
      <li>
        <span className="howto-icon">
          <FaGlobe />
        </span>
        Web sitesi yazın: <code>edogrula.org</code> veya <code>https://edogrula.org</code>
      </li>
    </ul>
  </section>
);

const PageFooter = () => (
  <footer style={styles.footer} aria-label="Alt menü">
    <div style={styles.footerLeft} className="glass">
      <a className="foot" href="/kvkk">
        kvkk
      </a>
      <a className="foot" href="/gizlilik">
        gizlilik sözleşmesi
      </a>
      <a className="foot" href="/hakkimizda">
        hakkımızda
      </a>
      {/* kariyer / iş birliği  -> SSS */}
      <a className="foot" href="/sss">
        sss
      </a>
    </div>
    <div style={styles.footerRight}>
      <a
        href="https://instagram.com/edogrula"
        target="_blank"
        rel="noreferrer noopener"
        className="fab ig"
        aria-label="Instagram"
        title="Instagram"
      >
        <FaInstagram />
      </a>
      <a
        href="https://wa.me/905069990554"
        target="_blank"
        rel="noreferrer noopener"
        className="fab wa"
        aria-label="WhatsApp"
        title="WhatsApp"
      >
        <FaWhatsapp />
      </a>
    </div>
  </footer>
);

/* ------ Doğrulanan için marka rozeti (logo) ------ */
function BrandBadgeIcon({ size = 96 }) {
  const [src, setSrc] = useState("/logo-badge.png"); // /public/logo-badge.png
  return (
    <img
      src={src}
      onError={() => setSrc("/logo.png")}
      alt="E-Doğrula"
      width={size}
      height={size}
      style={{ display: "block", width: size, height: size, objectFit: "contain" }}
    />
  );
}

function ResultModal({ children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onEsc);
      prev?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={styles.overlay}>
      <div role="dialog" aria-modal="true" tabIndex={-1} ref={ref} style={styles.modal} className="glass modal">
        <button onClick={onClose} aria-label="Kapat" className="btn subtle close-x">
          <FaXmark />
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}

function ResultCard({ result }) {
  const navigate = useNavigate();
  if (!result) return null;

  const header = (() => {
    switch (result.status) {
      case STATUS.VERIFIED:
        return { title: "Doğrulanmış İşletme", color: "var(--brand)", icon: <BrandBadgeIcon /> };
      case STATUS.BLACKLIST:
        return { title: "Olası Dolandırıcı İşletme", color: "#e74c3c", icon: <FaTriangleExclamation size={34} color="#fff" /> };
      case STATUS.NOT_FOUND:
        return { title: "Kayıt Bulunamadı", color: "#f39c12", icon: <FaCircleInfo size={34} color="#fff" /> };
      default:
        return { title: "Bir şeyler ters gitti", color: "#7f8c8d", icon: <FaCircleInfo size={34} color="#fff" /> };
    }
  })();

  const b = result.business || {};
  const slugOrId = b?.slug || b?._id;

  const profileUrl =
    result.status === STATUS.BLACKLIST ? `/kara-liste/${slugOrId}` : `/isletme/${slugOrId}`;

  const canOpenProfile = Boolean(slugOrId);

  const iconBackground =
    result.status === STATUS.VERIFIED
      ? "radial-gradient(60px 60px at 50% 50%, #3bb2e3 0%, #1a81c3 60%)"
      : result.status === STATUS.BLACKLIST
      ? "radial-gradient(60px 60px at 50% 50%, #ff6b6b 0%, #e74c3c 60%)"
      : "radial-gradient(60px 60px at 50% 50%, #f6c25b 0%, #f39c12 60%)";

  return (
    <div>
      <div style={{ textAlign: "center", marginTop: 8, marginBottom: 12 }}>
        <div style={{ ...styles.resultIcon, background: iconBackground }}>{header.icon}</div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: header.color, margin: 0 }}>
          {header.title}
        </h2>
      </div>

      {result.status === STATUS.VERIFIED && (
        <div style={styles.verifiedRow}>
          <div style={styles.verifiedLeft}>
            <div style={{ padding: "6px 6px 2px" }}>
              <Row icon={<FaTag />}>
                <b>{b.name}</b> {b.type ? `(${b.type})` : null}
              </Row>
              {b.phone && (
                <Row icon={<FaPhone />}>
                  <ContactLink href={`tel:${b.phone}`}>{b.phone}</ContactLink>
                </Row>
              )}
              {(b.instagramUrl || b.instagramUsername) && (
                <Row icon={<FaInstagram />}>
                  <ContactLink
                    href={b.instagramUrl || `https://instagram.com/${b.instagramUsername}`}
                    target="_blank"
                  >
                    {b.instagramUsername || b.instagramUrl}
                  </ContactLink>
                </Row>
              )}
              {b.website && (
                <Row icon={<FaGlobe />}>
                  <ContactLink
                    href={/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`}
                    target="_blank"
                  >
                    {b.website}
                  </ContactLink>
                </Row>
              )}
              {b.address && <Row icon={<FaLocationDot />}>{b.address}</Row>}
            </div>
          </div>
          <aside style={styles.verifyCtaCol}>
            <div style={styles.verifyCtaBox} className="glass">
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>İşletmeyi İncele</div>
              <p style={{ fontSize: 14, opacity: 0.85, margin: "0 0 10px 0" }}>
                Profil sayfasında belgeler, yorumlar ve tüm detayları görün.
              </p>
              <button
                className="btn success wide"
                onClick={() => canOpenProfile && navigate(profileUrl)}
                disabled={!canOpenProfile}
                style={styles.verifyBtn}
              >
                İşletmeyi İncele
              </button>
            </div>
          </aside>
        </div>
      )}

      {result.status === STATUS.BLACKLIST && (
        <div style={{ padding: "6px 6px 2px" }}>
          <Row icon={<FaTag />}>
            <b>{b.name || "—"}</b>
          </Row>
          {b.phone && (
            <Row icon={<FaPhone />}>
              {b.phone}
            </Row>
          )}
          {(b.instagramUrl || b.instagramUsername) && (
            <Row icon={<FaInstagram />}>
              <span style={{ color: "#e74c3c", fontWeight: 700 }}>
                {b.instagramUsername || b.instagramUrl}
              </span>
            </Row>
          )}
          {b.address && <Row icon={<FaLocationDot />}>{b.address}</Row>}
          <div className="warn-box">⚠️ Bu işletme kara listede. İşlem yapmadan önce dikkatli olun.</div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              className="btn danger"
              onClick={() => canOpenProfile && navigate(profileUrl)}
              disabled={!canOpenProfile}
              style={styles.profileBtn}
            >
              Profili Aç
            </button>
          </div>
        </div>
      )}

      {result.status === STATUS.NOT_FOUND && (
        <div style={{ textAlign: "center", color: "var(--fg-2)", padding: "8px 8px 2px" }}>
          Bu aradığınız işletme veri tabanımızda bulunamadı.
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
            <LinkButton to="/apply" color="var(--brand)">
              İşletmeni Doğrula
            </LinkButton>
            <LinkButton to="/report" color="#e74c3c">
              Dolandırıcılık İhbarı
            </LinkButton>
          </div>
        </div>
      )}

      {result.status === STATUS.ERROR && (
        <div style={{ textAlign: "center", color: "var(--fg-3)", paddingTop: 6 }}>
          Üzgünüz, bir hata oluştu. Lütfen tekrar deneyin.
        </div>
      )}
    </div>
  );
}

const Row = ({ icon, children }) => (
  <div style={styles.row}>
    <span style={{ width: 22, textAlign: "center" }}>{icon}</span>
    <div style={{ color: "var(--fg-2)" }}>{children}</div>
  </div>
);

const ContactLink = ({ href, target, children }) => (
  <a
    href={href}
    target={target}
    rel={target === "_blank" ? "noreferrer noopener" : undefined}
    style={styles.contactLink}
  >
    {children}
  </a>
);

function LinkButton({ to, color, children }) {
  const navigate = useNavigate();
  return (
    <button
      className="btn"
      onClick={() => navigate(to)}
      style={{ padding: "10px 14px", borderRadius: 10, background: color, color: "#fff", fontWeight: 800 }}
    >
      {children}
    </button>
  );
}

function LoadingDots() {
  return (
    <span className="dots">
      <i></i>
      <i></i>
      <i></i>
    </span>
  );
}

/* ================== STYLES ================== */
const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--fg)",
    fontFamily: "Roboto, Arial, sans-serif",
    position: "relative",
    overflowX: "hidden",
  },
  navWrap: {
    position: "fixed",
    top: 18,
    left: 20,
    right: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 30,
    pointerEvents: "none",
  },
  navSpacer: { pointerEvents: "none" },
  navRight: { display: "flex", gap: 12, alignItems: "center", pointerEvents: "auto" },
  offline: {
    position: "fixed",
    top: 64,
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--warn-bg)",
    border: "1px solid #ffd6ba",
    color: "#ad3b12",
    padding: "8px 12px",
    borderRadius: 12,
    zIndex: 25,
  },
  center: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: "clamp(16px, 14vh, 120px)",
    paddingBottom: 110,
  },
  logo: { width: 550, maxWidth: "85vw", height: "auto", marginBottom: 24 },
  searchBarWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "min(680px, 94vw)",
    margin: "0 auto 12px",
    padding: "6px 8px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "#fff",
  },
  quickRow: {
    width: "min(680px, 94vw)",
    margin: "0 auto 10px",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    padding: "0 18px",
    borderRadius: 999,
    border: "1px solid transparent",
    background: "transparent",
    fontSize: 16, // ⬅️ iOS odak zoomunu engeller
    outline: "none",
    color: "var(--fg)",
  },
  // Eski metinli buton yerine yuvarlak ikon buton
  searchIconBtn: {
    width: 42,
    height: 42,
    padding: 0,
    borderRadius: "50%",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtn: { height: 36, padding: "0 16px", borderRadius: 999, border: "none", fontWeight: 800 },
  howtoCard: {
    width: "min(680px, 94vw)",
    marginTop: 6,
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "#fff",
  },
  howtoHeader: { padding: "14px 16px", borderBottom: "1px solid var(--border)", fontWeight: 900, letterSpacing: 0.2, color: "var(--fg-2)" },
  howtoList: { listStyle: "none", padding: "10px 16px 14px", margin: 0, display: "grid", gap: 10, color: "var(--fg)" },
  footer: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    zIndex: 20,
    pointerEvents: "none",
  },
  footerLeft: {
    display: "flex",
    gap: 18,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    background: "#fff",
    border: "1px solid var(--border)",
    boxShadow: "0 6px 14px rgba(0, 0, 0, 0.06)",
    pointerEvents: "auto",
  },
  footerRight: { display: "flex", gap: 8, alignItems: "center", pointerEvents: "auto" },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(17,24,39,.45)",
    backdropFilter: "blur(3px)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    width: "100%",
    maxWidth: 680,
    border: "1px solid var(--border)",
    borderRadius: 22,
    padding: 22,
    position: "relative",
    color: "var(--fg)",
    background: "var(--card)",
  },
  verifiedRow: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginTop: 6 },
  verifiedLeft: { flex: "1 1 300px", minWidth: 260 },
  verifyCtaCol: { flex: "0 0 300px", minWidth: 260 },
  verifyCtaBox: { border: "1px solid var(--border)", borderRadius: 16, padding: 16 },
  toast: {
    position: "fixed",
    bottom: 92,
    left: "50%",
    transform: "translateX(-50%)",
    border: "1px solid var(--border)",
    padding: "8px 12px",
    borderRadius: 12,
    zIndex: 60,
    background: "#fff",
  },
  resultIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 96,
    height: 96,
    borderRadius: "50%",
    marginBottom: 10,
    color: "#fff",
    boxShadow: "0 18px 60px rgba(0,0,0,.25)",
  },
  row: { display: "flex", gap: 10, alignItems: "center", margin: "6px 0" },
  contactLink: { color: "var(--brand)", fontWeight: 600, textDecoration: "none" },
  verifyBtn: { width: "100%", borderRadius: 12, padding: "10px 12px", fontWeight: 900, opacity: 1, cursor: "pointer" },
  profileBtn: { padding: "10px 14px", borderRadius: 10, fontWeight: 800, opacity: 1, cursor: "pointer" },
};

const globalCSS = `@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap');
:root { --bg: #ffffff; --card:#ffffffcc; --fg:#202124; --fg-2:#3c4043; --fg-3:#5f6368; --border:#dadce0; --brand:#1a81c3; --muted:#f8f9fa; --warn-bg:#fff5ec; }
:root[data-theme="dark"]{ --bg: #0b1220; --card:#0f172acc; --fg:#e5e7eb; --fg-2:#cbd5e1; --fg-3:#94a3b8; --border:#24324499; --brand:#1a81c3; --muted:#142235cc; --warn-bg:#2b1b12; }
* { box-sizing: border-box; -webkit-text-size-adjust: 100%; }
html, body, #root { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); }
.stack { width: min(680px, 94vw); margin: 0 auto; }
.glass { backdrop-filter: blur(6px) saturate(120%); background: var(--card); box-shadow: 0 6px 14px rgba(0,0,0,.06); border: 1px solid var(--border); }
.lead-icon { margin-left:8px; display:flex; align-items:center; }
.lead-icon svg{ width:20px; height:20px; opacity:.9 }
.btn { transition: all .2s ease; cursor: pointer; }
.btn.primary { background: linear-gradient(90deg, var(--brand), #3ba8dc); color:#fff; font-weight:900; box-shadow: 0 10px 24px rgba(26,129,195,.25); }
.btn.primary:hover { transform: translateY(-1px); }
.btn.primary.loading { filter: saturate(.7); }
.btn.success { background: linear-gradient(90deg, var(--brand), #3ba8dc); color:#fff; }
.btn.danger  { background: linear-gradient(90deg, #ef4444, #dc2626); color:#fff; }
.btn.info    { background: linear-gradient(90deg, #0ea5e9, #38bdf8); }
.btn.subtle  { background: var(--muted); border:1px solid var(--border); }
.btn.wide    { width: 100%; }
.link { background: transparent; border: 0; color: var(--fg); font-weight: 800; cursor: pointer; }
.link:hover { text-decoration: underline; }
.ghost { background: transparent; color: var(--fg); border:1px solid var(--border); border-radius:999px; padding:8px 12px; cursor:pointer; }
.ghost.icon { width:40px; height:40px; display:flex; align-items:center; justify-content:center; }
.ghost.icon svg { width:18px; height:18px; }
.ghost.small { padding:6px 8px; border-radius:999px; font-weight:700; }
.ghost-pill { border-radius: 999px; padding: 8px 14px; }
.fab { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; font-weight: 900; color: #fff; text-decoration: none; box-shadow: 0 12px 28px rgba(0,0,0,.18); }
.fab.ig { background: linear-gradient(45deg,#fd1d1d,#fcb045); }
.fab.wa { background: #25D366; }
.fab svg{ width:16px; height:16px; }
.warn-box { margin-top:12px; background:var(--warn-bg); color:#c0392b; padding:10px 12px; border-radius:12px; font-weight:800; border:1px solid #fecaca; }
.modal.glass { border: 1px solid var(--border); }
.close-x { position:absolute; top:12px; right:12px; display:flex; align-items:center; justify-content:center; gap:6px; }
.dots { display:inline-flex; gap:6px; align-items:center; }
.dots i{ width:6px; height:6px; border-radius:50%; background:#fff; display:inline-block; animation: b 1s infinite ease-in-out; }
.dots i:nth-child(2){ animation-delay:.15s }
.dots i:nth-child(3){ animation-delay:.3s }
@keyframes b { 0%,80%,100%{ transform:scale(0.6); opacity:.7 } 40%{ transform:scale(1); opacity:1 } }
/* iOS/Safari odakta zoom’u engelle: tüm form kontrolleri 16px */
input, textarea, select, button { font-size:16px; }
input:focus { outline: none; box-shadow: 0 0 0 3px rgba(26,129,195,.15); }
.foot { color: var(--fg-2); text-decoration: none; font-weight:700; }
.foot:hover { text-decoration: underline; }
.howto-icon { width:20px; display:inline-flex; align-items:center; justify-content:center; margin-right:8px; opacity:.9; }
.howto-icon svg { width:16px; height:16px; }
code { background:#f1f3f4; padding:2px 6px; border-radius:6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
@media (max-width: 680px) {
  .ghost.icon { width:38px; height:38px; }
  .ghost.icon svg{ width:16px; height:16px; }
}
@media (prefers-reduced-motion: reduce){
  *{ transition:none!important; animation:none!important; }
}
`;
