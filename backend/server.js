// backend/server.js — Ultra Pro Final (features preserved)
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

import User from "./models/User.js";
import { authenticate, requireAdmin } from "./middleware/auth.js";

/* =====================================================
   ENV / CONSTANTS
===================================================== */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isVercel = Boolean(process.env.VERCEL);
const isProd = process.env.NODE_ENV === "production" || isVercel;

const PORT = Number(process.env.PORT || 5000);
const ENABLE_SSL = String(process.env.ENABLE_SSL || "").toLowerCase() === "true";

const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const GIT_COMMIT = process.env.GIT_COMMIT || null;

/* =====================================================
   ASSET_BASE & UPLOADS_DIR (THE FIX)
===================================================== */

// STATIC URL PREFIX (HER ZAMAN /uploads OLMALI)
const ASSET_BASE = "/uploads";

// REAL PATH (LOCAL → uploads/, RENDER → /tmp/uploads)
const UPLOADS_DIR = isVercel
  ? path.join("/tmp", "uploads")
  : path.join(process.cwd(), "uploads");

// ensure directory exists
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("[uploads] klasör oluşturulamadı:", e.message);
}

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
  const rid = req.headers["x-request-id"] ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

/* Logger */
morgan.token("rid", (req) => req.id);
app.use(morgan(isProd ? "combined" : "dev"));

/* URL normalize */
app.use((req, res, next) => {
  req.url = req.url.replace(/\/{2,}/g, "/");
  next();
});

/* CORS */
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://edogrula.org",
  "https://www.edogrula.org",
  "https://edogrula-api.onrender.com",
];

app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
  })
);

/* Asset Base header */
app.use((req, res, next) => {
  res.setHeader("X-Asset-Base", ASSET_BASE);
  next();
});

/* =====================================================
   STATIC UPLOAD SERVE  (FINAL FIX)
===================================================== */
app.use(
  ASSET_BASE,
  express.static(UPLOADS_DIR, {
    etag: true,
    lastModified: true,
    maxAge: isProd ? "1d" : 0,
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

/* =====================================================
   ROUTES
===================================================== */

app.get("/", (req, res) =>
  res.json({
    success: true,
    message: "e-Doğrula API aktif 🚀",
    version: APP_VERSION,
    env: isProd ? "production" : "development",
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/apply", applyRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/blacklist", blacklistRoutes);
app.use("/api/featured", publicFeaturedRouter);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/cms", cmsRouter);

app.use("/api/admin", authenticate, requireAdmin, adminRoutes);

if (!isProd) app.use("/api/dev", devSupwRoutes);

/* 404 */
app.use((req, res) =>
  res.status(404).json({
    success: false,
    message: "Endpoint bulunamadı",
    path: req.originalUrl,
  })
);

/* Error handler */
app.use((err, req, res) => {
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
  await User.ensureAdminSeed();

  if (!isVercel) {
    http.createServer(app).listen(PORT, () =>
      console.log(`🚀 API ready → http://localhost:${PORT}`)
    );
  } else {
    console.log("⚙️ Vercel ortamı: server.listen yok.");
  }
}

boot();

export default app;
export { app };
