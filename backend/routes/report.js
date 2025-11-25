// backend/routes/report.js — Ultra Pro (live-ready, verify-token guarded, safe uploads)
import { Router } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import Report from "../models/Report.js";

const router = Router();
const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

const ok = (res, data = {}, status = 200) =>
  res.status(status).json({ success: true, ...data });

const fail = (res, message = "Hata", status = 400, code) =>
  res.status(status).json({ success: false, message, ...(code ? { code } : {}) });

/* ===================== küçük utils ===================== */
const escapeRegex = (s = "") =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const safeName = (name = "file") =>
  String(name)
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, 80);

const clampInt = (v, def, min, max) => {
  const n = parseInt(String(v ?? def), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

/* ===================== Admin tespiti ===================== */
/**
 * - x-admin-key == ADMIN_KEY
 * - Authorization: Bearer <jwt> (payload.role === "admin")
 * - ?admin=1 (dev kısayolu)
 */
function isAdminRequest(req) {
  try {
    const adminKey = req.headers["x-admin-key"];
    const needKey = process.env.ADMIN_KEY;
    if (needKey && String(adminKey) === String(needKey)) return true;

    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (bearer && process.env.JWT_SECRET) {
      const payload = jwt.verify(bearer, process.env.JWT_SECRET);
      if (payload?.role === "admin" || payload?.isAdmin === true) return true;
    }
  } catch {
    // sessiz düş
  }
  const q = req.query.admin;
  if (q === "1" || q === "true") return true;
  return false;
}

/* ===================== Dev log ===================== */
router.use((req, _res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("[REPORT]", req.method, req.originalUrl);
  }
  next();
});

/* ===================== Upload config ===================== */
// uploads/report altında tut
const UPLOADS_ROOT =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const UPLOADS_DIR = path.join(UPLOADS_ROOT, "report");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ASSET_BASE =
  (process.env.ASSET_BASE || "/uploads").replace(/\/+$/, "") || "/uploads";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MAX_FILES = clampInt(process.env.REPORT_MAX_FILES, 10, 1, 20);
const MAX_SIZE = clampInt(process.env.REPORT_MAX_MB, 10, 1, 25) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || "";
    const base = safeName(path.basename(file.originalname || "file", ext));
    const uniq = `${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    cb(null, `report_${uniq}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    const mt = (file.mimetype || "").toLowerCase();
    if (!ALLOWED_MIME.has(mt)) {
      return cb(new Error("BAD_FILE_TYPE"));
    }
    cb(null, true);
  },
});

/* ===================== Helpers ===================== */
const getClientIp = (req) => {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) {
    return xf.split(",")[0].trim();
  }
  return (
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    ""
  );
};

// Verify token guard:
// - Header: x-verify-token
// - JWT_SECRET varsa doğrular (sub: "email-verify")
// - Secret yoksa sadece varlık kontrolü (dev uyumluluk)
function requireVerifyToken(req, res, next) {
  const vt = String(req.headers["x-verify-token"] || "").trim();
  if (!vt) {
    return fail(
      res,
      "Doğrulama gerekli. Lütfen e-posta doğrulamasını tamamlayın.",
      401,
      "VERIFY_REQUIRED"
    );
  }

  const secret = process.env.JWT_SECRET;
  if (secret) {
    try {
      const payload = jwt.verify(vt, secret);
      if (payload?.sub !== "email-verify") {
        return fail(res, "Doğrulama tokeni geçersiz.", 401, "VERIFY_INVALID");
      }
      req.verifyPayload = payload;
    } catch {
      return fail(res, "Doğrulama tokeni süresi dolmuş veya geçersiz.", 401, "VERIFY_INVALID");
    }
  }

  req.verifyToken = vt;
  next();
}

/* ===================== POST /api/report ===================== */
/**
 * Public ihbar oluşturma
 * Body: multipart/form-data
 * - name, instagramUsername, instagramUrl, phone, desc
 * - reporterEmail, reporterName, reporterPhone (opsiyonel)
 * - consent ("true"), policyVersion, userAgent
 * - evidence: dosyalar
 */
router.post(
  "/",
  requireVerifyToken,
  upload.array("evidence", MAX_FILES),
  async (req, res, next) => {
    try {
      const { body } = req;
      const files = req.files || [];

      const evidenceFiles = files.map((f) => `${ASSET_BASE}/${f.filename}`);

      const payload = {
        ...body,
        evidenceFiles,
        createdByIp: body.createdByIp || getClientIp(req),
        userAgent: body.userAgent || req.headers["user-agent"],
        // opsiyonel: verify email payload'ını model isterse kullanabilir
        verifiedEmail: req.verifyPayload?.email || body.verifiedEmail,
      };

      const data = Report.fromPayload(payload);

      if (!data.consent) {
        return fail(
          res,
          "Yasal sorumluluk onayını işaretlemeniz gerekiyor.",
          400,
          "CONSENT_REQUIRED"
        );
      }

      if (!data.name || !data.desc) {
        return fail(
          res,
          "Lütfen işletme adı ve açıklama alanlarını doldurun.",
          400,
          "VALIDATION_ERROR"
        );
      }

      const doc = await Report.create(data);
      return ok(res, { id: doc._id, report: doc }, 201);
    } catch (err) {
      // Multer error mapping
      if (err?.code === "LIMIT_FILE_SIZE") {
        return fail(res, "Dosya boyutu çok büyük.", 413, "FILE_TOO_LARGE");
      }
      if (err?.code === "LIMIT_FILE_COUNT") {
        return fail(res, "Çok fazla dosya yüklendi.", 413, "TOO_MANY_FILES");
      }
      if (err?.code === "LIMIT_UNEXPECTED_FILE") {
        return fail(res, "Beklenmeyen dosya alanı.", 400, "UNEXPECTED_FILE");
      }
      if (String(err?.message || "").includes("BAD_FILE_TYPE")) {
        return fail(
          res,
          "Sadece JPG, PNG, WEBP veya PDF dosyaları yükleyebilirsiniz.",
          400,
          "BAD_FILE_TYPE"
        );
      }
      return next(err);
    }
  }
);

/* ===================== GET /api/report (admin) ===================== */
/**
 * Admin listeleme / filtreleme
 * ?page=1&limit=20&sort=-createdAt&status=open&q=search
 */
router.get("/", async (req, res, next) => {
  try {
    const admin = isAdminRequest(req);
    if (!admin) {
      return fail(res, "Bu işlem için yetkiniz yok.", 403, "FORBIDDEN");
    }

    const page = clampInt(req.query.page, 1, 1, 10_000);
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const sort = String(req.query.sort || "-createdAt").trim() || "-createdAt";
    const status = String(req.query.status || "").trim();
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (status) filter.status = status;

    if (q) {
      const R = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { name: R },
        { instagramUsername: R },
        { instagramUrl: R },
        { phone: R },
        { desc: R },
        { reporterEmail: R },
      ];
    }

    const [items, total] = await Promise.all([
      Report.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Report.countDocuments(filter),
    ]);

    return ok(res, {
      items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    });
  } catch (e) {
    return next(e);
  }
});

/* ===================== GET /api/report/:id ===================== */
/**
 * - Admin: tam detay
 * - Public: hassas izleri gizler
 */
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return fail(res, "Geçersiz id", 400, "INVALID_ID");
    }

    const admin = isAdminRequest(req);

    const doc = await Report.findById(id).lean();
    if (!doc) {
      return fail(res, "Bulunamadı", 404, "NOT_FOUND");
    }

    if (!admin) {
      delete doc.createdByIp;
      delete doc.userAgent;
      delete doc.reporterEmail;
      delete doc.reporterPhone;
    }

    return ok(res, { report: doc });
  } catch (e) {
    return next(e);
  }
});

export default router;
