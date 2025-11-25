// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/**
 * Hedef normalizasyonu
 * - ":5000"             → "https://localhost:5000"
 * - "localhost:5000"    → "https://localhost:5000"
 * - "https://api.foo"   → "https://api.foo"
 * - "" (boş)            → "http://localhost:5000"
 * - ".../api" ile bitiyorsa → sonundaki "/api" kaldır (proxy'de çift /api olmasın)
 */
function normalizeTarget(raw) {
  const RAW = String(raw || "").trim();
  let t;
  if (!RAW) t = "https://localhost:5000";
  else if (/^https?:\/\//i.test(RAW)) t = RAW;
  else if (/^:\d+$/.test(RAW)) t = `https://localhost:${RAW.slice(1)}`;
  else t = `https://${RAW}`;

  t = t.replace(/\/+$/, "");    // sondaki slashları at
  t = t.replace(/\/api$/i, ""); // sonda /api varsa kaldır
  return t;
}

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // .env: VITE_API_URL = https://api.edogrula.org  (veya :5000 / localhost:5000 / https://api.../api)
  const targetOrigin = normalizeTarget(env.VITE_API_URL);

  /** Ortak proxy ayarları */
  const proxyCommon = {
    target: targetOrigin, // örn: http://localhost:5000 | https://api.edogrula.org
    changeOrigin: true,
    secure: false,        // self-signed veya HTTP backend için
    ws: true,
  };

  const proxy = {
    // Tüm backend API
    "/api": proxyCommon,

    // (İsteğe bağlı) img proxy’sini açıkça tanımlamak istersen:
    "/api/img": proxyCommon,

    // Statik upload'lar
    "/uploads": {
      ...proxyCommon,
      // Bozuk path’leri düzelt:
      //  - ters slashları / yap
      //  - /uploads/http(s)://uploads/... → /uploads/...
      rewrite: (p) =>
        p
          .replace(/\\+/g, "/")
          .replace(/^\/uploads\/https?:\/+uploads\//i, "/uploads/"),
    },
  };

  // Bilgi amaçlı (konsolda gör)
  console.log(`[vite] proxy target = ${targetOrigin}`);

  return defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy,
      headers: {
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    },
    // Vite 5'te preview.proxy desteklenir; dev ile port çakışmasın diye 4173
    preview: {
      host: true,
      port: 4173,
      strictPort: true,
      proxy,
      headers: {
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    },
    // build: { sourcemap: true }, // istersen aç
  });
};
