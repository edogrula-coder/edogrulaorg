// src/main.jsx
import "./api/axios-boot";
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  Link,
  useLocation,
  Navigate,
} from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

/* ===================== Lazy pages ===================== */
const Login = React.lazy(() => import("./pages/Login"));
const Search = React.lazy(() => import("./pages/Search"));
const Apply = React.lazy(() => import("./pages/Apply"));
const Report = React.lazy(() => import("./pages/Report"));
const BusinessProfile = React.lazy(() => import("./pages/BusinessProfile"));
const VerifyEmail = React.lazy(() => import("./pages/VerifyEmail"));
const Results = React.lazy(() => import("./pages/Results"));
const SapancaBungalov = React.lazy(() => import("./pages/SapancaBungalov"));
const BlacklistProfile = React.lazy(() => import("./pages/BlacklistProfile"));
const KVKK = React.lazy(() => import("./pages/KVKK"));
const SSS = React.lazy(() => import("./pages/SSS"));
const Hakkimizda = React.lazy(() => import("./pages/Hakkimizda"));

const AdminContent = React.lazy(() => import("./pages/AdminContent"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Businesses = React.lazy(() => import("./pages/Businesses"));
const Applications = React.lazy(() => import("./pages/Applications"));
const Archive = React.lazy(() => import("./pages/Archive"));
const Reports = React.lazy(() => import("./pages/Reports.page"));
const Blacklist = React.lazy(() => import("./pages/Blacklist"));
const Featured = React.lazy(() => import("./pages/Featured"));
const Supw = React.lazy(() => import("./pages/Supw"));

/* ===================== Asset normalize ===================== */
function normalizeAssetPath(p) {
  if (!p) return p;
  const s0 = String(p).trim();
  if (/^(https?:)?\/\//i.test(s0) || /^(data|blob):/i.test(s0)) return s0;
  if (s0.startsWith("/")) return s0.replace(/\/{2,}/g, "/");
  if (/^\/\/uploads\//i.test(s0)) return s0.replace(/^\/\//, "/");
  if (/^uploads\//i.test(s0)) return "/" + s0.replace(/^\/+/, "");
  return s0;
}
function normalizeBackgroundImage(el) {
  if (!el || !el.style) return;
  const bg = el.style.backgroundImage || "";
  if (!bg) return;
  const m = bg.match(/url\((['"]?)(.+?)\1\)/i);
  if (!m) return;
  const orig = m[2];
  const fixed = normalizeAssetPath(orig);
  if (fixed && fixed !== orig) el.style.backgroundImage = `url(${fixed})`;
}
function normalizeElementAndDescendants(root) {
  if (!root || !(root instanceof Element)) return;
  if (root.tagName === "IMG") {
    const orig = root.getAttribute("src");
    const fixed = normalizeAssetPath(orig);
    if (fixed && fixed !== orig) root.setAttribute("src", fixed);
  }
  normalizeBackgroundImage(root);
  root.querySelectorAll("img[src]").forEach((img) => {
    const o = img.getAttribute("src");
    const f = normalizeAssetPath(o);
    if (f && f !== o) img.setAttribute("src", f);
  });
  root.querySelectorAll("[style*='background']").forEach((el) =>
    normalizeBackgroundImage(el)
  );
}
function useLiveAssetFix() {
  React.useEffect(() => {
    requestAnimationFrame(() => normalizeElementAndDescendants(document.body));
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes") {
          const el = m.target;
          if (m.attributeName === "src" && el.tagName === "IMG") {
            const o = el.getAttribute("src");
            const f = normalizeAssetPath(o);
            if (f && f !== o) el.setAttribute("src", f);
          } else if (m.attributeName === "style") {
            normalizeBackgroundImage(el);
          }
        } else if (m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === 1) normalizeElementAndDescendants(node);
          });
        }
      }
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "style"],
    });
    return () => obs.disconnect();
  }, []);
}

/* ===================== UX helpers ===================== */
function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            fontFamily: "Segoe UI, system-ui, -apple-system, Arial, sans-serif",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h2 style={{ color: "#c0392b", marginBottom: 8 }}>
            Beklenmeyen bir hata oluştu
          </h2>
          <p style={{ margin: "4px 0 16px" }}>
            Sayfayı yenilemeyi deneyebilir veya birazdan tekrar gelebilirsiniz.
          </p>
          <Link to="/" style={{ color: "#2980b9", fontWeight: 600 }}>
            Ana Sayfa
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}

function NotFound() {
  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "20%",
        fontFamily: "Segoe UI, system-ui, -apple-system, Arial, sans-serif",
      }}
      role="alert"
      aria-live="assertive"
    >
      <h2 style={{ color: "#c0392b", marginBottom: 8 }}>
        404 - Sayfa Bulunamadı
      </h2>
      <p style={{ margin: "4px 0 16px" }}>Aradığınız sayfa mevcut değil.</p>
      <Link to="/" style={{ color: "#2980b9", fontWeight: 600 }}>
        Ana Sayfaya Dön
      </Link>
    </div>
  );
}

function RootLayout() {
  useLiveAssetFix();
  return (
    <>
      <ScrollToTop />
      <React.Suspense
        fallback={<div style={{ padding: 24, textAlign: "center" }}>Yükleniyor…</div>}
      >
        <Outlet />
      </React.Suspense>
    </>
  );
}

/* ===================== Basename ===================== */
const BASENAME =
  (import.meta.env.VITE_BASENAME ?? import.meta.env.BASE_URL ?? "/")
    .toString()
    .replace(/\/+$/, "") || "/";

/* ===================== Router ===================== */
const router = createBrowserRouter(
  [
    {
      path: "/",
      element: (
        <ErrorBoundary>
          <RootLayout />
        </ErrorBoundary>
      ),
      children: [
        // Public
        { index: true, element: <Search /> },
        { path: "apply", element: <Apply /> },
        { path: "report", element: <Report /> },
        { path: "ara", element: <Results /> },
        { path: "search", element: <Results /> },
        { path: "sapanca-bungalov-evleri", element: <SapancaBungalov /> },

        // Kara Liste — hem :id hem :slug destekli
        { path: "kara-liste/:id", element: <BlacklistProfile /> },
        { path: "kara-liste/:slug", element: <BlacklistProfile /> },

        { path: "business/:slug", element: <BusinessProfile /> },
        { path: "isletme/:slug", element: <BusinessProfile /> },
        { path: "b/:slug", element: <BusinessProfile /> },
        { path: "verify-email", element: <VerifyEmail /> },

        // Statik sayfalar — catch-all’dan önce
        { path: "kvkk", element: <KVKK /> },
        { path: "sss", element: <SSS /> },
        { path: "hakkimizda", element: <Hakkimizda /> },

        // Eski/alternatif bağlantılar
        { path: "kvk", element: <Navigate to="/kvkk" replace /> },
        { path: "hakkımızda", element: <Navigate to="/hakkimizda" replace /> },

        // SUPW
        { path: "supw", element: <Supw /> },

        // Admin
        { path: "admin/login", element: <Login /> },
        {
          path: "admin",
          element: <Dashboard />,
          children: [
            { index: true, element: <Navigate to="businesses" replace /> },
            { path: "businesses", element: <Businesses /> },
            { path: "applications", element: <Applications /> },
            { path: "archive", element: <Archive /> },
            { path: "reports", element: <Reports /> },
            { path: "blacklist", element: <Blacklist /> },
            { path: "featured", element: <Featured /> },
            { path: "*", element: <NotFound /> },
          ],
        },

        // Eski admin rota
        {
          path: "admin/dashboard",
          element: <Dashboard />,
          children: [
            { index: true, element: <Businesses /> },
            { path: "businesses", element: <Businesses /> },
            { path: "applications", element: <Applications /> },
            { path: "archive", element: <Archive /> },
            { path: "reports", element: <Reports /> },
            { path: "blacklist", element: <Blacklist /> },
            { path: "featured", element: <Featured /> },
          ],
        },

        // Geniş yakalayıcı — EN SONDA!
        { path: ":slug", element: <BusinessProfile /> },

        // 404
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  {
    basename: BASENAME === "/" ? undefined : BASENAME,
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }
);

/* ===================== Mount ===================== */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <RouterProvider
        router={router}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        fallbackElement={<div style={{ padding: 24, textAlign: "center" }}>Yükleniyor…</div>}
      />
    </HelmetProvider>
  </React.StrictMode>
);
