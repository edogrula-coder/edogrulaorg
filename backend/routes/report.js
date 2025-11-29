// backend/routes/report.js — Ultra Pro (debug-friendly, verify optional in dev)
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
  res
    .status(status)
    .json({ success: false, message, ...(code ? { code } : {}) });

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
function isAdminRequest(req) {
  try {
    const adminKey = req.headers["x-admin-key"];
    const needKey = process.env.ADMIN_KEY;
    if (needKey && String(adminKey) === String(needKey)) return true;

    const bearer = (req.headers.authorization || "").replace(
      /^Bearer\s+/i,
      ""
    );
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
const MAX_SIZE =
  clampInt(process.env.REPORT_MAX_MB, 10, 1, 25) * 1024 * 1024;

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

/* ============ Verify token guard (DEV'te esnek) ============ */

const VERIFY_REQUIRED =
  String(process.env.REPORT_REQUIRE_VERIFY ?? "0").trim() === "1";

function requireVerifyToken(req, res, next) {
  const vt = String(req.headers["x-verify-token"] || "").trim();

  if (!vt) {
    if (!VERIFY_REQUIRED) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[REPORT] x-verify-token header YOK, fakat REPORT_REQUIRE_VERIFY != 1 → DEV MOD: izin verildi."
        );
      }
      return next();
    }
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
        return fail(
          res,
          "Doğrulama tokeni geçersiz.",
          401,
          "VERIFY_INVALID"
        );
      }
      req.verifyPayload = payload;
    } catch (e) {
      console.warn("[REPORT] verify token decode error:", e?.message);
      return fail(
        res,
        "Doğrulama tokeni süresi dolmuş veya geçersiz.",
        401,
        "VERIFY_INVALID"
      );
    }
  } else if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[REPORT] JWT_SECRET tanımlı değil, x-verify-token sadece varlık bazlı kabul ediliyor."
    );
  }

  req.verifyToken = vt;
  next();
}

/* ===================== POST /api/report ===================== */
/**
 * Public ihbar:
 * - JSON veya multipart/form-data
 * - evidence: dosya alanı (çoklu)
 */
router.post(
  "/",
  requireVerifyToken,
  upload.array("evidence", MAX_FILES),
  async (req, res, next) => {
    try {
      const { body } = req;
      const files = req.files || [];

      if (process.env.NODE_ENV !== "production") {
        console.log("[REPORT] POST hit; body.keys =", Object.keys(body || {}));
        console.log(
          "[REPORT] files count =",
          files.length,
          "UPLOADS_DIR =",
          UPLOADS_DIR
        );
      }

      const evidenceFiles = files.map((f) => `${ASSET_BASE}/${f.filename}`);

      const payload = {
        ...body,
        evidenceFiles,
        createdByIp: body.createdByIp || getClientIp(req),
        userAgent: body.userAgent || req.headers["user-agent"],
        verifiedEmail: req.verifyPayload?.email || body.verifiedEmail,
      };

      if (process.env.NODE_ENV !== "production") {
        console.log("[REPORT] normalized payload preview =", {
          ...payload,
          evidenceFilesCount: evidenceFiles.length,
        });
      }

      // fromPayload varsa kullan, yoksa raw fallback
      let data;
      try {
        if (typeof Report.fromPayload === "function") {
          data = Report.fromPayload(payload);
        } else {
          console.warn(
            "[REPORT] Report.fromPayload bulunamadı, raw payload'tan sade obje üretiliyor."
          );
          data = {
            name: payload.name,
            instagramUsername: payload.instagramUsername,
            instagramUrl: payload.instagramUrl,
            phone: payload.phone,
            desc: payload.desc,
            reporterEmail: payload.reporterEmail,
            reporterName: payload.reporterName,
            reporterPhone: payload.reporterPhone,
            consent:
              payload.consent === true ||
              payload.consent === "true" ||
              payload.consent === "1" ||
              payload.consent === 1,
            policyVersion: payload.policyVersion,
            evidenceFiles: payload.evidenceFiles || [],
            createdByIp: payload.createdByIp,
            userAgent: payload.userAgent,
            verifiedEmail: payload.verifiedEmail,
            status: "open",
          };
        }
      } catch (e) {
        console.error(
          "[REPORT] fromPayload hata verdi, raw payload kullanılacak:",
          e
        );
        data = {
          ...payload,
          consent:
            payload.consent === true ||
            payload.consent === "true" ||
            payload.consent === "1" ||
            payload.consent === 1,
        };
      }

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

      if (process.env.NODE_ENV !== "production") {
        console.log("[REPORT] created report _id =", doc._id);
      }

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
      console.error("[REPORT] POST / error", err);
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

    if (process.env.NODE_ENV !== "production") {
      console.log("[REPORT] GET / admin list filter =", filter, {
        page,
        limit,
        sort,
      });
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
    console.error("[REPORT] GET / admin list error", e);
    return next(e);
  }
});

/* ===================== DEV: hızlı test için seed ===================== */
/**
 * Sadece development'ta aktif.
 * GET /api/report/dev-seed?admin=1
 * → Mongo'ya 1 adet test raporu yazar.
 */
if (process.env.NODE_ENV !== "production") {
  router.get("/dev-seed", async (req, res, next) => {
    try {
      const doc = await Report.create({
        name: "Test İşletme (dev-seed)",
        instagramUsername: "testaccount",
        instagramUrl: "https://instagram.com/testaccount",
        phone: "0555 555 55 55",
        desc: "Bu kayıt sadece report hattını test etmek için eklendi.",
        consent: true,
        status: "open",
        createdByIp: getClientIp(req),
        userAgent: req.headers["user-agent"] || "",
        evidenceFiles: [],
      });

      console.log("[REPORT] DEV SEED created report _id =", doc._id);

      return ok(res, { report: doc }, 201);
    } catch (e) {
      console.error("[REPORT] DEV SEED error", e);
      return next(e);
    }
  });
}

/* ===================== GET /api/report/:id ===================== */
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
    console.error("[REPORT] GET /:id error", e);
    return next(e);
  }
});

export default router;
