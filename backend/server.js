// backend/server.js — Ultra Pro Final + Upload + /api/api uyumluluk + DEBUG LOG
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import http from "http";
import https from "https";
import fs from "fs";

import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import applyRoutes from "./routes/apply.js";
import reportRoutes from "./routes/report.js";
import reviewsRoutes from "./routes/reviews.js";
import exploreRoutes from "./routes/explore.js";
import adminRoutes from "./routes/admin.js";
import blacklistRoutes from "./routes/blacklist.js";
import googleRoutes from "./routes/google.js";
import knowledgeRoutes from "./routes/knowledge.js";
import { publicFeaturedRouter } from "./routes/admin.featured.js";
import devSupwRoutes from "./routes/dev.supw.js";
import cmsRouter from "./routes/cms.js";

// ⬇️ Upload router: /api/uploads/business + /api/admin/uploads/business
import uploadRoutes from "./routes/upload.js";

import User from "./models/User.js";
import { authenticate, requireAdmin } from "./middleware/auth.js";

/* =====================================================
   ENV / CONSTANTS
===================================================== */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isVercel = Boolean(process.env.VERCEL);
const isProd = process.env.NODE_ENV === "production" || isVercel;

const PORT = Number(process.env.PORT || 5000);
const ENABLE_SSL =
  String(process.env.ENABLE_SSL || "").toLowerCase() === "true";

const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const GIT_COMMIT = process.env.GIT_COMMIT || null;

/* =====================================================
   ASSET_BASE & UPLOADS_DIR
===================================================== */

// STATIC URL PREFIX (FRONTEND İÇİN HEP /uploads KALACAK)
const ASSET_BASE = "/uploads";

// GERÇEK FİZİKSEL DİZİN
// - Local: <project-root>/uploads
// - Vercel/Render (read-only FS): /tmp/uploads
const UPLOADS_DIR = isVercel
  ? path.join("/tmp", "uploads")
  : path.join(process.cwd(), "uploads");

try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("[uploads] klasör oluşturulamadı:", e.message);
}

// Ortak router'lar için env'e de yaz (report.js, upload.js vs)
process.env.ASSET_BASE = process.env.ASSET_BASE || ASSET_BASE;
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR || UPLOADS_DIR;

/* =====================================================
   BUSINESS_PHOTOS (Google Places / Excel ile indirilenler)
===================================================== */

// Bu fotoğraflar repo içinde backend/business_photos klasöründe duruyor.
// Read-only statik asset: Vercel'de de Render'da da __dirname üzerinden erişilir.
const BUSINESS_PHOTOS_DIR = path.join(__dirname, "business_photos");

// 💬 Boot log
console.log("📦 [BOOT] ASSET_BASE =", ASSET_BASE);
console.log("📦 [BOOT] UPLOADS_DIR =", UPLOADS_DIR);
console.log("📦 [BOOT] BUSINESS_PHOTOS_DIR =", BUSINESS_PHOTOS_DIR);
console.log("📦 [BOOT] NODE_ENV =", process.env.NODE_ENV, "isProd =", isProd);

/* =====================================================
   MongoDB
===================================================== */

mongoose.set("strictQuery", true);
mongoose.set("autoIndex", !isProd);

async function connectMongo() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI tanımlı değil!");
    return;
  }
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });
  console.log("✅ MongoDB bağlı");
}

/* =====================================================
   EXPRESS BOOTSTRAP
===================================================== */

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

/* Request ID */
app.use((req, res, next) => {
  const rid =
    req.headers["x-request-id"] ||
    `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  req.id = rid;
  res.setHeader("X-Request-Id", rid);
  next();
});

/* Security */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
    hsts: isProd,
  })
);

app.use(compression());
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use(cookieParser());

/* Logger */
morgan.token("rid", (req) => req.id);
app.use(morgan(isProd ? "combined" : "dev"));

/* URL normalize (çifte / engelle) */
app.use((req, res, next) => {
  req.url = req.url.replace(/\/{2,}/g, "/");
  next();
});

/* CORS */
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://edogrula.org",
  "https://www.edogrula.org",
  "https://edogrula-api.onrender.com",
];

app.use(
  cors({
    origin: (origin, cb) =>
      cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
  })
);

/* Asset Base header (frontend bu header'dan /uploads bilgisini görebilir) */
app.use((req, res, next) => {
  res.setHeader("X-Asset-Base", ASSET_BASE);
  next();
});

/* =====================================================
   STATIC UPLOAD SERVE + BUSINESS_PHOTOS + DEBUG
===================================================== */

// /uploads/... → fiziksel UPLOADS_DIR içeriğini servis et
app.use(
  ASSET_BASE,
  (req, res, next) => {
    const fsPath = path.join(
      UPLOADS_DIR,
      String(req.url || "").replace(/^\/+/, "")
    );
    console.log(
      "📂 [STATIC UPLOAD]",
      req.method,
      req.originalUrl,
      "→",
      fsPath
    );
    next();
  },
  express.static(UPLOADS_DIR, {
    etag: true,
    lastModified: true,
    maxAge: isProd ? "1d" : 0,
  })
);

// /business_photos/... → backend/business_photos içeriğini servis et
// (repo içindeki read-only foto klasörü; Google Places / Excel script'in yazdığı)
app.use(
  "/business_photos",
  (req, res, next) => {
    const fsPath = path.join(
      BUSINESS_PHOTOS_DIR,
      String(req.url || "").replace(/^\/+/, "")
    );
    console.log(
      "📸 [STATIC BUSINESS_PHOTOS]",
      req.method,
      req.originalUrl,
      "→",
      fsPath
    );
    next();
  },
  express.static(BUSINESS_PHOTOS_DIR, {
    etag: true,
    lastModified: true,
    maxAge: isProd ? "7d" : 0,
  })
);

/* =====================================================
   DEBUG
===================================================== */

app.get("/debug/uploads", (req, res) => {
  try {
    const exists = fs.existsSync(UPLOADS_DIR);
    const files = exists ? fs.readdirSync(UPLOADS_DIR) : [];

    res.json({
      success: true,
      ASSET_BASE,
      UPLOADS_DIR,
      exists,
      fileCount: files.length,
      files,
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.get("/debug/business-photos", (req, res) => {
  try {
    const exists = fs.existsSync(BUSINESS_PHOTOS_DIR);
    const dirs = exists ? fs.readdirSync(BUSINESS_PHOTOS_DIR) : [];

    res.json({
      success: true,
      BUSINESS_PHOTOS_DIR,
      exists,
      entryCount: dirs.length,
      entries: dirs,
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* =====================================================
   ROOT PING
===================================================== */

app.get("/", (req, res) =>
  res.json({
    success: true,
    message: "e-Doğrula API aktif 🚀",
    version: APP_VERSION,
    git: GIT_COMMIT,
    env: isProd ? "production" : "development",
  })
);

/* =====================================================
   API ROUTER  (/api ve /api/api alias)
===================================================== */

const apiRouter = express.Router();

/* API level rate limit (özellikle prod için) */
if (isProd) {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    limit: 2000, // IP başına 15 dakikada 2000 istek
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
  });
  apiRouter.use(apiLimiter);
}

/* === DEBUG MIDDLEWARELERİ ===
   - Upload isteklerini
   - Admin/business patch & get isteklerini
   konsola basıyoruz.
*/
apiRouter.use((req, res, next) => {
  if (req.path.startsWith("/uploads")) {
    console.log(
      "🧵 [API UPLOAD]",
      req.method,
      req.originalUrl,
      "query=",
      req.query,
      "body.keys=",
      Object.keys(req.body || {})
    );
  }

  if (req.path.startsWith("/admin/businesses")) {
    console.log(
      "🏢 [API ADMIN/BUSINESSES]",
      req.method,
      req.originalUrl,
      "query=",
      req.query,
      "body.keys=",
      Object.keys(req.body || {})
    );
  }

  next();
});

// Basit health
apiRouter.get("/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Ana API’ler
apiRouter.use("/auth", authRoutes);
apiRouter.use("/businesses", businessRoutes);
apiRouter.use("/apply", applyRoutes);
apiRouter.use("/report", reportRoutes);
apiRouter.use("/reviews", reviewsRoutes);
apiRouter.use("/explore", exploreRoutes);
apiRouter.use("/google", googleRoutes);
apiRouter.use("/blacklist", blacklistRoutes); // public + admin logic
apiRouter.use("/featured", publicFeaturedRouter);
apiRouter.use("/knowledge", knowledgeRoutes);
apiRouter.use("/cms", cmsRouter);

// ⬇️ Upload rotaları doğrudan /api altına bağlanıyor:
// - POST /api/uploads/business
// - POST /api/admin/uploads/business
apiRouter.use(uploadRoutes);

// Admin kara liste alias: /api/admin/blacklist → blacklistRoutes
apiRouter.use(
  "/admin/blacklist",
  authenticate,
  requireAdmin,
  blacklistRoutes
);

// Admin korumalı genel router
apiRouter.use("/admin", authenticate, requireAdmin, adminRoutes);

// Dev util (sadece dev ortamında)
if (!isProd) {
  apiRouter.use("/dev", devSupwRoutes);
}

// Normal prefix
app.use("/api", apiRouter);
// Yanlış yazımları affeden alias → /api/api/...
app.use("/api/api", apiRouter);

/* =====================================================
   404 & ERROR HANDLER
===================================================== */

app.use((req, res) =>
  res.status(404).json({
    success: false,
    message: "Endpoint bulunamadı",
    path: req.originalUrl,
  })
);

// 4 argümanlı olmak zorunda
app.use((err, req, res, next) => {
  console.error("🔥 API error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "INTERNAL_ERROR",
    stack: isProd ? undefined : err.stack,
  });
});

/* =====================================================
   START
===================================================== */

async function boot() {
  await connectMongo();
  await User.ensureAdminSeed?.();

  if (!isVercel) {
    // Local / Render tarzı ortamlarda klasik listen
    http.createServer(app).listen(PORT, () =>
      console.log(`🚀 API ready → http://localhost:${PORT}`)
    );

    // İstersen SSL için ayrı bir blokta ENABLE_SSL'e göre https server da eklenebilir.
    if (ENABLE_SSL) {
      console.log("⚠️ ENABLE_SSL true ama SSL sertifika ayarları eklenmedi.");
    }
  } else {
    // Vercel: framework kendi server instance'ını oluşturuyor
    console.log("⚙️ Vercel ortamı: server.listen yok (edge/serverless).");
  }
}

boot();

export default app;
export { app };
