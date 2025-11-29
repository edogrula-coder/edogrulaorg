// src/pages/admin/Dashboard.jsx — Ultra Pro v6 (Layout + düzgün tablo hizası)
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

/* ======================= NAV CONFIG ======================= */
const NAV = [
  { to: "/admin/businesses", label: "İşletmeler", icon: "📋", sub: "Kayıtlı işletme listesi" },
  { to: "/admin/applications", label: "Başvurular", icon: "📝", sub: "Yeni doğrulama talepleri" },
  { to: "/admin/archive", label: "Arşiv", icon: "📂", sub: "Eski & kapatılan dosyalar" },
  { to: "/admin/reports", label: "İhbarlar", icon: "⚠️", sub: "Kullanıcı ihbar kayıtları" },
  { to: "/admin/blacklist", label: "Blacklist", icon: "⛔", sub: "Riskli / engelli kayıtlar" },
  { to: "/admin/featured", label: "Öne Çıkanlar", icon: "⭐", sub: "Vitrin ve promosyonlar" },
];

export default function Dashboard() {
  const location = useLocation();
  const [theme, setTheme] = useState("light");

  /* ======================= ACTIVE LABEL ======================= */
  const activeLabel = useMemo(() => {
    const found = NAV.find((n) => location.pathname.startsWith(n.to));
    return found?.label || "Panel";
  }, [location.pathname]);

  /* ======================= ENV BADGE ======================= */
  const envLabel = useMemo(() => {
    try {
      const mode = import.meta?.env?.MODE || "development";
      if (mode === "production") return "CANLI PANEL";
      if (mode === "staging") return "STAGING";
      return "TEST PANEL";
    } catch {
      return "PANEL";
    }
  }, []);

  /* ======================= THEME ======================= */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("adminTheme");
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("adminTheme", theme);
    } catch {}
  }, [theme]);

  /* ======================= LAYOUT ======================= */
  return (
    <div className="AdminRoot">
      <style>{GLOBAL_CSS}</style>

      {/* HEADER */}
      <header className="AdminHeader">
        <div className="AdminHeaderLeft">
          <a href="/" className="AdminBrand">
            <div className="AdminLogoWrap">
              <img
                src="/logo-edogrula.png"
                alt="E-Doğrula"
                className="AdminLogo"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            </div>
            <div>
              <div className="BrandTitle">E-Doğrula Admin</div>
              <div className="BrandSub">Yönetim &amp; Doğrulama Paneli</div>
            </div>
          </a>
        </div>

        <div className="HeaderRight">
          <span className="EnvBadge">{envLabel}</span>

          <button
            type="button"
            className="GhostBtn ThemeBtn"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Aydınlık tema" : "Karanlık tema"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          <span className="AdminBadge">ADMIN</span>
          <a href="/logout" className="GhostBtn LogoutBtn">
            Çıkış
          </a>
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="AdminShell">
        {/* SIDEBAR */}
        <nav className="AdminNav">
          <div className="NavSectionTitle">Genel</div>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={false}
              className={({ isActive }) => `NavItem ${isActive ? "Active" : ""}`}
            >
              <span className="NavIcon">{n.icon}</span>
              <div className="NavTextBlock">
                <span className="NavLabel">{n.label}</span>
                {n.sub && <span className="NavSub">{n.sub}</span>}
              </div>
            </NavLink>
          ))}
        </nav>

        {/* CONTENT */}
        <main className="AdminMain">
          <div className="AdminMainInner">
            <div className="ContentHeader">
              <div>
                <div className="ContentTag">
                  <span>YÖNETİM</span>
                  <span>•</span>
                  <span>PANEL</span>
                </div>
                <h1 className="ContentTitle">{activeLabel}</h1>
              </div>

              <div className="ContentPathWrap">
                <div className="ContentPathLabel">AKTİF ROTA</div>
                <div className="ContentPath">{location.pathname}</div>
              </div>
            </div>

            {/* İçerik kartı */}
            <div className="ContentShell">
              <div className="ContentCard">
                {/* Bu sarmalayıcı tabloyu kaydırabilir yapıyor, CSV vb. butonlara dokunmuyor */}
                <div className="ContentInnerScroll">
                  <Outlet />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ===========================================================
   ====================== GLOBAL CSS ==========================
   =========================================================== */

const GLOBAL_CSS = `
/* ROOT THEME TOKENS */
:root {
  --bg:#f3f4f8;
  --bg-alt:#e5e7f3;
  --card:#ffffff;
  --fg:#0f172a;
  --border:#e2e8f0;
  --brand:#111827;
  --brand-soft:#eef2ff;
  --muted:#6b7280;
  --chip:#f3f4f6;
  --radius-lg:18px;
  --radius-md:12px;
  --radius-sm:8px;
  --shadow-soft:0 18px 45px rgba(15,23,42,.10);
  --shadow-subtle:0 1px 3px rgba(15,23,42,.06);
}

:root[data-theme="dark"] {
  --bg:#020617;
  --bg-alt:#020617;
  --card:#020617;
  --fg:#e5e7eb;
  --border:#1f2933;
  --brand:#f9fafb;
  --brand-soft:#020617;
  --muted:#9ca3af;
  --chip:#020617;
  --shadow-soft:0 18px 55px rgba(0,0,0,.65);
  --shadow-subtle:0 1px 3px rgba(15,23,42,.6);
}

/* RESET */
* { box-sizing:border-box; }
html, body { margin:0; padding:0; }
body {
  background:var(--bg);
  color:var(--fg);
  font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;
}

/* ======================== ROOT WRAPPER ======================== */

.AdminRoot {
  min-height:100vh;
  background:
    radial-gradient(circle at top left, rgba(129,140,248,0.16), transparent 55%),
    radial-gradient(circle at bottom right, rgba(56,189,248,0.14), transparent 55%),
    var(--bg);
  color:var(--fg);
}

/* ======================== HEADER ======================== */

.AdminHeader {
  position:sticky;
  top:0;
  z-index:40;
  width:100%;
  padding:10px 28px;
  background:rgba(255,255,255,0.86);
  border-bottom:1px solid rgba(226,232,240,0.8);
  display:flex;
  justify-content:space-between;
  align-items:center;
  backdrop-filter:blur(18px) saturate(150%);
  box-shadow:var(--shadow-subtle);
}

:root[data-theme="dark"] .AdminHeader {
  background:rgba(15,23,42,0.92);
  border-bottom:1px solid rgba(15,23,42,0.9);
}

.AdminHeaderLeft {
  display:flex;
  align-items:center;
  gap:14px;
}

.AdminBrand {
  display:flex;
  align-items:center;
  gap:12px;
  text-decoration:none;
  color:inherit;
}

.AdminLogoWrap {
  height:40px;
  width:40px;
  border-radius:16px;
  background:var(--brand-soft);
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 10px 30px rgba(15,23,42,.12);
}

.AdminLogo {
  height:26px;
  width:26px;
  object-fit:contain;
}

.BrandTitle {
  font-weight:900;
  font-size:16px;
  letter-spacing:.02em;
}

.BrandSub {
  font-size:12px;
  opacity:.7;
  margin-top:2px;
}

.HeaderRight {
  display:flex;
  gap:10px;
  align-items:center;
}

/* ENV + ADMIN BADGES */

.EnvBadge {
  padding:5px 10px;
  border-radius:999px;
  font-size:11px;
  font-weight:700;
  letter-spacing:.03em;
  text-transform:uppercase;
  background:linear-gradient(135deg,#22c55e,#16a34a);
  color:white;
  box-shadow:0 12px 30px rgba(34,197,94,.35);
}

.AdminBadge {
  padding:5px 10px;
  border-radius:999px;
  background:var(--chip);
  border:1px solid var(--border);
  font-size:11px;
  font-weight:800;
}

/* ======================== LAYOUT ======================== */

.AdminShell {
  display:grid;
  grid-template-columns:260px minmax(0,1fr);
  gap:22px;
  width:100%;
  max-width:1500px;
  margin:22px auto 28px;
  padding:0 22px;
}

/* SIDEBAR */

.AdminNav {
  background:var(--card);
  border:1px solid var(--border);
  border-radius:var(--radius-lg);
  padding:14px 10px;
  display:flex;
  flex-direction:column;
  gap:4px;
  height:fit-content;
  position:sticky;
  top:86px;
  box-shadow:var(--shadow-soft);
}

.NavSectionTitle {
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:.14em;
  color:var(--muted);
  padding:4px 10px 6px;
}

.NavItem {
  display:flex;
  align-items:flex-start;
  gap:10px;
  padding:10px 11px;
  border-radius:14px;
  text-decoration:none;
  color:var(--fg);
  transition:
    background-color .16s ease,
    border-color .16s ease,
    box-shadow .16s ease,
    transform .08s ease;
  border:1px solid transparent;
}

.NavItem:hover {
  background:rgba(148,163,184,0.08);
  border-color:rgba(148,163,184,0.5);
  transform:translateY(-1px);
}

.NavItem.Active {
  background:var(--brand);
  color:white;
  border-color:transparent;
  box-shadow:0 14px 35px rgba(15,23,42,.45);
  transform:translateY(-1px);
}

.NavItem.Active .NavSub {
  color:rgba(249,250,251,0.8);
}

.NavIcon {
  width:22px;
  text-align:center;
  font-size:18px;
  margin-top:2px;
}

.NavTextBlock {
  display:flex;
  flex-direction:column;
}

.NavLabel {
  font-size:13px;
  font-weight:700;
}

.NavSub {
  font-size:11px;
  margin-top:2px;
  color:var(--muted);
}

/* ======================== MAIN CONTENT ======================== */

.AdminMain {
  min-width:0;
}

.AdminMainInner {
  min-width:0;
}

.ContentHeader {
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  margin-bottom:14px;
  gap:12px;
  flex-wrap:wrap;
}

.ContentTag {
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:.14em;
  color:var(--muted);
  padding:3px 10px;
  border-radius:999px;
  border:1px solid rgba(148,163,184,0.45);
  background:rgba(255,255,255,0.5);
}

:root[data-theme="dark"] .ContentTag {
  background:rgba(15,23,42,0.7);
}

.ContentTitle {
  margin:4px 0 0;
  font-size:24px;
  font-weight:900;
  letter-spacing:.01em;
}

.ContentPathWrap {
  display:flex;
  flex-direction:column;
  align-items:flex-end;
  gap:4px;
}

.ContentPathLabel {
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.16em;
  color:var(--muted);
}

.ContentPath {
  font-size:12px;
  padding:6px 12px;
  border:1px dashed var(--border);
  border-radius:999px;
  color:var(--muted);
  max-width:260px;
  text-overflow:ellipsis;
  overflow:hidden;
  white-space:nowrap;
}

/* İç kart kabuğu */

.ContentShell {
  border-radius:var(--radius-lg);
  background:radial-gradient(circle at top left, rgba(148,163,184,0.16), transparent 60%), var(--card);
  padding:1px;
  box-shadow:var(--shadow-soft);
}

.ContentCard {
  background:var(--card);
  border-radius:var(--radius-lg);
  padding:18px 18px 16px 18px;
  border:1px solid rgba(148,163,184,0.18);
  box-shadow:var(--shadow-subtle);
  /* Sadece hafif taşma kontrolü, scroll ContentInnerScroll'da */
  overflow-y:visible;
}

/* Sadece Outlet içeriği için yatay scroll;
   tablo hizasını bozmayalım diye tüm stil buraya */
.ContentInnerScroll {
  width:100%;
  overflow-x:auto;
}

/* ======================== TABLO HİZASI ======================== */
/* Mevcut table yapına dokunmadan, sadece okunabilirlik + son kolon hizası */

.ContentInnerScroll table {
  width:100%;
  border-collapse:collapse;
}

.ContentInnerScroll thead th,
.ContentInnerScroll tbody td {
  padding:10px 12px;
}

/* Son kolon (İşlem) için sabit genişlik + ortalama hizalama */
.ContentInnerScroll thead th:last-child,
.ContentInnerScroll tbody td:last-child {
  text-align:center;
  min-width:130px;
  white-space:nowrap;
}

/* ======================== BUTTONLAR ======================== */

.GhostBtn {
  background:var(--card);
  border:1px solid var(--border);
  padding:8px 12px;
  border-radius:12px;
  cursor:pointer;
  font-size:12px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  transition:
    background-color .16s ease,
    border-color .16s ease,
    box-shadow .16s ease,
    transform .08s ease;
}

.GhostBtn:hover {
  border-color:#cbd5e1;
  background:rgba(248,250,252,0.95);
  transform:translateY(-1px);
  box-shadow:0 10px 25px rgba(15,23,42,.12);
}

:root[data-theme="dark"] .GhostBtn:hover {
  background:rgba(15,23,42,0.9);
}

.ThemeBtn {
  width:40px;
  height:40px;
  font-size:18px;
  padding:0;
}

.LogoutBtn {
  font-weight:600;
}

/* ======================== RESPONSIVE ======================== */

@media(max-width:1100px){
  .AdminShell {
    grid-template-columns:220px minmax(0,1fr);
  }
}

@media(max-width:900px){
  .AdminShell {
    grid-template-columns:1fr;
  }
  .AdminNav {
    position:static;
    flex-direction:row;
    overflow-x:auto;
    padding:10px;
  }
  .NavItem {
    min-width:max-content;
  }
  .ContentHeader {
    align-items:flex-start;
  }
  .ContentPathWrap {
    align-items:flex-start;
  }
}

@media(max-width:640px){
  .AdminHeader {
    padding:8px 14px;
  }
  .AdminShell {
    padding:0 12px;
  }
  .ContentCard {
    padding:14px;
  }
}
`;
