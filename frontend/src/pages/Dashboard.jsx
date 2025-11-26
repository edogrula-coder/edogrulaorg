// src/pages/admin/Dashboard.jsx — Ultra Pro v5 (Kurumsal Panel Layout)
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

/* ======================= NAV CONFIG ======================= */
const NAV = [
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

  /* ======================= ACTIVE LABEL ======================= */
  const activeLabel = useMemo(() => {
    const found = NAV.find((n) => location.pathname.startsWith(n.to));
    return found?.label || "Panel";
  }, [location.pathname]);

  /* ======================= THEME ======================= */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("adminTheme");
      if (["dark", "light"].includes(saved)) setTheme(saved);
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
        <a href="/" className="AdminBrand">
          <img
            src="/logo-edogrula.png"
            alt="E-Doğrula"
            className="AdminLogo"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div>
            <div className="BrandTitle">E-Doğrula Admin</div>
            <div className="BrandSub">Yönetim Paneli</div>
          </div>
        </a>

        <div className="HeaderRight">
          <button
            type="button"
            className="GhostBtn ThemeBtn"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
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
      <div className="AdminLayout">
        {/* SIDEBAR */}
        <nav className="AdminNav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={false}
              className={({ isActive }) =>
                `NavItem ${isActive ? "Active" : ""}`
              }
            >
              <span className="NavIcon">{n.icon}</span>
              <span className="NavLabel">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* CONTENT */}
        <main className="AdminContent">
          <div className="ContentHeader">
            <h1 className="ContentTitle">{activeLabel}</h1>
            <div className="ContentPath">{location.pathname}</div>
          </div>

          {/* İçerik kartı */}
          <div className="ContentCard">
            <Outlet />
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
/* ROOT */
:root {
  --bg:#f6f7fb;
  --card:#ffffff;
  --fg:#111827;
  --border:#e5e7eb;
  --brand:#111827;
  --muted:#6b7280;
  --chip:#f3f4f6;
  --radius-lg:14px;
}

:root[data-theme="dark"] {
  --bg:#0b1220;
  --card:#0f172a;
  --fg:#e5e7eb;
  --border:#243244;
  --brand:#e5e7eb;
  --muted:#9ca3af;
}

/* RESET */
* { box-sizing:border-box; }
body { margin:0; }

/* ROOT WRAPPER */
.AdminRoot {
  min-height:100vh;
  background:var(--bg);
  color:var(--fg);
  font-family:Inter, system-ui, sans-serif;
}

/* ======================== HEADER ======================== */

.AdminHeader {
  position:sticky;
  top:0;
  z-index:40;
  width:100%;
  padding:12px 24px;
  background:var(--card);
  border-bottom:1px solid var(--border);
  display:flex;
  justify-content:space-between;
  align-items:center;
  backdrop-filter:blur(8px) saturate(130%);
}

.AdminBrand {
  display:flex;
  align-items:center;
  gap:10px;
  text-decoration:none;
  color:inherit;
}
.AdminLogo {
  height:36px;
  width:36px;
  object-fit:contain;
}
.BrandTitle {
  font-weight:900;
  font-size:16px;
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

/* ======================== LEFT NAV ======================== */

.AdminLayout {
  display:grid;
  grid-template-columns:260px 1fr;
  gap:20px;
  width:100%;
  max-width:1500px;
  margin:20px auto;
  padding:0 20px;
}

.AdminNav {
  background:var(--card);
  border:1px solid var(--border);
  border-radius:var(--radius-lg);
  padding:12px;
  display:flex;
  flex-direction:column;
  gap:6px;
  height:fit-content;
  position:sticky;
  top:80px;
}

.NavItem {
  display:flex;
  align-items:center;
  gap:12px;
  padding:12px;
  border-radius:12px;
  text-decoration:none;
  color:var(--fg);
  transition:.15s;
  border:1px solid transparent;
}

.NavItem:hover {
  background:color-mix(in srgb, var(--card), var(--bg) 20%);
  border-color:var(--border);
}
.NavItem.Active {
  background:var(--brand);
  color:white;
  border-color:var(--brand);
  box-shadow:0 8px 18px rgba(0,0,0,.18);
}

.NavIcon {
  width:22px;
  text-align:center;
}

/* ======================== CONTENT ======================== */

.AdminContent {
  min-width:0;
}

.ContentHeader {
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:14px;
}

.ContentTitle {
  margin:0;
  font-size:22px;
  font-weight:900;
}

.ContentPath {
  font-size:12px;
  padding:6px 10px;
  border:1px dashed var(--border);
  border-radius:999px;
  color:var(--muted);
}

.ContentCard {
  background:var(--card);
  border:1px solid var(--border);
  border-radius:var(--radius-lg);
  padding:16px;
  box-shadow:0 12px 30px rgba(0,0,0,.06);

  /* EN ÖNEMLİ KISIM → Tablo taşması bitiyor */
  overflow-x:auto;
  overflow-y:visible;
}

/* ======================== GHOST BUTTONS ======================== */

.GhostBtn {
  background:var(--card);
  border:1px solid var(--border);
  padding:8px 12px;
  border-radius:10px;
  cursor:pointer;
  transition:.15s;
}
.GhostBtn:hover {
  border-color:#c8ced6;
}
.ThemeBtn {
  width:40px;
  height:40px;
  font-size:18px;
}

/* ADMIN BADGE */
.AdminBadge {
  padding:5px 10px;
  border-radius:20px;
  background:var(--chip);
  border:1px solid var(--border);
  font-size:11px;
  font-weight:900;
}

/* MOBILE */
@media(max-width:960px){
  .AdminLayout {
    grid-template-columns:1fr;
  }
  .AdminNav {
    flex-direction:row;
    overflow-x:auto;
    top:70px;
  }
  .NavItem {
    min-width:max-content;
  }
}
`;
