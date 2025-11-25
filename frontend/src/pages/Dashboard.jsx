// src/pages/admin/Dashboard.jsx — Ultra Pro Layout (v2.1)
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const nav = [
  { to: "/admin/businesses", label: "İşletmeler", icon: "📋" },
  { to: "/admin/applications", label: "Başvurular", icon: "📝" },
  { to: "/admin/archive", label: "Arşiv", icon: "📂" },
  { to: "/admin/reports", label: "İhbarlar", icon: "⚠️" },
  { to: "/admin/blacklist", label: "Blacklist", icon: "⛔" },
  { to: "/admin/featured", label: "Öne Çıkanlar", icon: "⭐" },
];

export default function Dashboard() {
  const location = useLocation();
  const [theme, setTheme] = useState("light");

  // aktif sayfa başlığı
  const activeLabel = useMemo(() => {
    const found = nav.find((n) => location.pathname.startsWith(n.to));
    return found?.label || "Panel";
  }, [location.pathname]);

  // theme restore
  useEffect(() => {
    try {
      const saved = window.localStorage?.getItem("adminTheme");
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {}
  }, []);

  // theme apply
  useEffect(() => {
    try {
      document.documentElement.dataset.theme = theme;
      window.localStorage?.setItem("adminTheme", theme);
    } catch {}
  }, [theme]);

  return (
    <div className="adminPage" style={st.page}>
      <style>{globalCSS}</style>

      <a href="#adminContent" className="skipLink">
        İçeriğe atla
      </a>

      {/* Header */}
      <header className="adminHeader" style={st.header}>
        <a href="/" style={st.brand} aria-label="E-Doğrula ana sayfa">
          <img
            src="/logo-edogrula.png"
            alt="E-Doğrula"
            style={st.logo}
            loading="lazy"
            decoding="async"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div>
            <div style={st.brandTitle}>E-Doğrula Admin</div>
            <div style={st.brandSub}>Yönetim Paneli</div>
          </div>
        </a>

        <div style={st.headerRight}>
          <button
            type="button"
            className="ghost themeBtn"
            aria-label="Tema değiştir"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Açık tema" : "Koyu tema"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          <span style={st.adminBadge}>ADMIN</span>
          <a href="/logout" className="ghost" style={st.logoutBtn}>
            Çıkış
          </a>
        </div>
      </header>

      <div className="adminLayout" style={st.layout}>
        {/* Sidebar / TopNav */}
        <nav className="adminNav" style={st.nav} aria-label="Admin navigasyon">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={false}
              className={({ isActive }) => `navItem ${isActive ? "active" : ""}`}
            >
              <span style={st.navIcon} aria-hidden>
                {n.icon}
              </span>
              <span style={st.navLabel}>{n.label}</span>
              <span className="navDot" aria-hidden />
            </NavLink>
          ))}
        </nav>

        {/* Content */}
        <main id="adminContent" className="adminContent" style={st.content}>
          <div className="contentHeader">
            <h1 className="contentTitle">{activeLabel}</h1>
            <div className="contentPath">{location.pathname}</div>
          </div>

          {/* 🔥 Burada yatay taşma fix'i var */}
          <div className="contentCard" style={st.contentCard}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

const st = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--fg)",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
  },

  header: {
    position: "sticky",
    top: 0,
    zIndex: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "var(--card)",
    borderBottom: "1px solid var(--border)",
    backdropFilter: "saturate(130%) blur(6px)",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "inherit",
  },
  logo: {
    height: 36,
    width: 36,
    objectFit: "contain",
  },
  brandTitle: { fontWeight: 900, fontSize: 16, letterSpacing: 0.2 },
  brandSub: { fontSize: 12, opacity: 0.7, marginTop: 1 },

  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  adminBadge: {
    fontSize: 11,
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: 999,
    background: "var(--chip)",
    border: "1px solid var(--border)",
    letterSpacing: 0.3,
  },
  logoutBtn: { fontWeight: 900 },

  layout: {
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    gap: 14,
    width: "min(1280px, 96vw)",
    margin: "14px auto 40px",
  },

  nav: {
    position: "sticky",
    top: 66,
    alignSelf: "start",
    display: "grid",
    gap: 8,
    padding: 10,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "0 12px 32px rgba(0,0,0,.05)",
    height: "fit-content",
  },
  navIcon: { fontSize: 18, width: 22, textAlign: "center" },
  navLabel: { fontWeight: 800, fontSize: 14 },

  content: { minWidth: 0 },

  // ✅ SAĞDAKİ BUTONLAR KIRPILMASIN DİYE
  contentCard: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    padding: 14,
    boxShadow: "0 16px 40px rgba(0,0,0,.06)",
    minHeight: "60vh",

    position: "relative",
    overflowX: "auto",
    overflowY: "visible",
  },
};

const globalCSS = `
:root{
  --bg:#f6f7fb; --card:#ffffff; --fg:#111827;
  --border:#e5e7eb; --chip:#f3f4f6;
  --r-lg:14px; --r-md:12px;
  --brand:#111827;
  --muted:#6b7280;
  --success:#22c55e;
}
:root[data-theme="dark"]{
  --bg:#0b1220; --card:#0f172a; --fg:#e5e7eb;
  --border:#243244; --chip:#0b1220;
  --brand:#e5e7eb;
  --muted:#9ca3af;
}

*{box-sizing:border-box}
a{color:inherit}
body{margin:0}

/* Skip link */
.skipLink{
  position:fixed; left:8px; top:-40px; z-index:9999;
  background:var(--brand); color:#fff; padding:8px 10px;
  border-radius:8px; text-decoration:none; font-weight:800; font-size:12px;
  transition:top .15s ease;
}
.skipLink:focus{top:8px}

/* Ghost buttons */
.ghost{
  background:var(--card); border:1px solid var(--border);
  border-radius:10px; padding:8px 10px; cursor:pointer;
  transition:border-color .15s ease, box-shadow .15s ease, background .15s ease, transform .05s ease;
  text-decoration:none; display:inline-flex; align-items:center; justify-content:center;
}
.ghost:hover{border-color:#c8ced6}
.ghost:active{transform:translateY(1px)}
.ghost:focus-visible{outline:2px solid var(--brand); outline-offset:2px}

.themeBtn{ width:36px; height:36px; font-size:16px; }

/* Nav Items */
.navItem{
  position:relative;
  display:flex; align-items:center; gap:10px;
  padding:10px 12px;
  border-radius:12px;
  text-decoration:none;
  border:1px solid transparent;
  color:var(--fg);
  background:transparent;
  transition:background .15s ease, border-color .15s ease, transform .05s ease;
}
.navItem:hover{
  background: color-mix(in srgb, var(--card) 90%, var(--bg));
  border-color: var(--border);
}
.navItem:active{transform:translateY(1px)}
.navItem.active{
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
  box-shadow: 0 10px 24px rgba(17,24,39,.25);
}
.navItem .navDot{
  margin-left:auto;
  width:8px; height:8px; border-radius:999px;
  background: transparent;
}
.navItem.active .navDot{ background:var(--success); }

/* Content header */
.contentHeader{
  display:flex; align-items:baseline; justify-content:space-between;
  padding:4px 2px 10px; margin-bottom:8px;
}
.contentTitle{
  margin:0; font-size:22px; font-weight:900; letter-spacing:.2px;
}
.contentPath{
  font-size:12px; color:var(--muted);
  padding:4px 8px; border:1px dashed var(--border); border-radius:999px;
}

/* Wide tables won't get clipped */
.contentCard{ width:100%; }

/* Layout responsiveness */
@media (max-width: 960px){
  .adminLayout{
    grid-template-columns: 1fr !important;
  }
  .adminNav{
    position:sticky !important;
    top:66px !important;
    display:flex !important;
    overflow-x:auto !important;
    gap:6px !important;
    padding:8px !important;
    border-radius:12px !important;
    scrollbar-width: thin;
  }
  .navItem{ min-width: max-content; }
  .contentHeader{ flex-direction:column; gap:6px; align-items:flex-start; }
}

/* nice scrollbar (webkit) */
.adminNav::-webkit-scrollbar{ height:8px; }
.adminNav::-webkit-scrollbar-thumb{
  background:color-mix(in srgb, var(--border) 70%, transparent);
  border-radius:999px;
}
`;
