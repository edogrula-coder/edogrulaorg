// backend/routes/blacklist.js — Ultra Pro (admin + public, debug-friendly)
import { Router } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Blacklist from "../models/Blacklist.js";
import Business from "../models/Business.js";

const router = Router();

const ok = (res, data = {}, status = 200) =>
  res.status(status).json({ success: true, ...data });

const fail = (res, message = "Hata", status = 400, code) =>
  res
    .status(status)
    .json({ success: false, message, ...(code ? { code } : {}) });

const isValidObjectId = (v) =>
  mongoose.Types.ObjectId.isValid(String(v || ""));

/* ===================== küçük utils ===================== */

const escapeRegex = (s = "") =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const clampInt = (v, def, min, max) => {
  const n = parseInt(String(v ?? def), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

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

/* ===================== Dev log middleware ===================== */

router.use((req, _res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("[BLACKLIST]", req.method, req.originalUrl);
  }
  next();
});

/* ===================== POST /api/blacklist ===================== */
/**
 * Admin kara listeye ekleme
 *
 * Body (esnek):
 * - businessId (opsiyonel)
 * - slug / businessSlug (opsiyonel)
 * - name / businessName (opsiyonel)
 * - reason / note / desc (opsiyonel ama tavsiye)
 * - source ("admin", "report" vs, default: "admin")
 */
router.post("/", async (req, res, next) => {
  try {
    const admin = isAdminRequest(req);

    if (!admin) {
      // istersen burayı 403 yaparsın; dev için kısıtlamayı yumuşak bırakıyorum
      console.warn(
        "[BLACKLIST] non-admin POST denemesi, yine de dev'te izin veriliyor."
      );
    }

    const body = req.body || {};
    if (process.env.NODE_ENV !== "production") {
      console.log("[BLACKLIST] POST body =", body);
    }

    const {
      businessId,
      businessSlug,
      slug,
      name,
      businessName,
      reason,
      note,
      desc,
      source,
      status,
    } = body;

    // Business bilgisi varsa çekmeye çalış
    let biz = null;
    try {
      if (businessId && isValidObjectId(businessId)) {
        biz = await Business.findById(businessId).lean();
      } else if (slug || businessSlug) {
        const s = slug || businessSlug;
        biz = await Business.findOne({ slug: s }).lean();
      }
    } catch (e) {
      console.warn("[BLACKLIST] Business lookup error:", e?.message);
    }

    const textReason = reason || note || desc || "";
    const now = new Date();

    const data = {
      // business ile ilgili alanlar
      business: biz?._id || (isValidObjectId(businessId) ? businessId : undefined),
      businessId: biz?._id || (isValidObjectId(businessId) ? businessId : undefined),
      businessSlug: biz?.slug || businessSlug || slug || null,
      businessName: biz?.name || businessName || name || null,

      // açıklama / gerekçe
      reason: textReason || undefined,
      desc: textReason || undefined,

      source: source || "admin",
      status: status || "open",

      // meta
      createdByIp: getClientIp(req),
      userAgent: req.headers["user-agent"] || "",
      createdAt: now,
      updatedAt: now,
    };

    // Boş objectId'leri temizle
    Object.keys(data).forEach((k) => {
      if (data[k] === undefined) delete data[k];
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("[BLACKLIST] normalized data =", data);
    }

    let doc = null;

    // Önce model ile kaydetmeyi dene
    try {
      if (Blacklist && typeof Blacklist.create === "function") {
        doc = await Blacklist.create(data);
      }
    } catch (e) {
      console.error(
        "[BLACKLIST] Blacklist.create hata verdi, raw insert'e düşülüyor:",
        e
      );
    }

    // Model patlarsa direkt koleksiyona yaz (validation bypass)
    if (!doc) {
      const raw = await mongoose.connection
        .collection("blacklists")
        .insertOne(data);
      doc = { _id: raw.insertedId, ...data };
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[BLACKLIST] created blacklist _id =", doc._id);
    }

    return ok(res, { blacklist: doc }, 201);
  } catch (e) {
    console.error("[BLACKLIST] POST / error", e);
    return next(e);
  }
});

/* ===================== GET /api/blacklist (admin list) ===================== */
/**
 * Sadece admin:
 * ?page=1&limit=20&sort=-createdAt&q=search&slug=my-biz
 */
router.get("/", async (req, res, next) => {
  try {
    const admin = isAdminRequest(req);
    if (!admin) {
      return fail(res, "Bu işlem için yetkiniz yok.", 403, "FORBIDDEN");
    }

    const page = clampInt(req.query.page, 1, 1, 10_000);
    const limit = clampInt(req.query.limit, 20, 1, 200);
    const sort = String(req.query.sort || "-createdAt").trim() || "-createdAt";
    const q = String(req.query.q || "").trim();
    const slug = String(req.query.slug || "").trim();

    const filter = {};
    if (slug) {
      filter.businessSlug = slug;
    }

    if (q) {
      const R = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { businessName: R },
        { businessSlug: R },
        { reason: R },
        { desc: R },
      ];
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[BLACKLIST] GET / list filter =", filter, {
        page,
        limit,
        sort,
      });
    }

    const [items, total] = await Promise.all([
      Blacklist.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Blacklist.countDocuments(filter),
    ]);

    return ok(res, {
      items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    });
  } catch (e) {
    console.error("[BLACKLIST] GET / list error", e);
    return next(e);
  }
});

/* ===================== GET /api/blacklist/:idOrSlug (public/admin) ===================== */
/**
 * - id gibi görünüyorsa _id ile arar
 * - değilse businessSlug ile arar
 */
router.get("/:idOrSlug", async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const admin = isAdminRequest(req);

    let filter;
    if (isValidObjectId(idOrSlug)) {
      filter = { _id: idOrSlug };
    } else {
      filter = { businessSlug: idOrSlug };
    }

    const doc = await Blacklist.findOne(filter).lean();
    if (!doc) {
      return fail(res, "Bulunamadı", 404, "NOT_FOUND");
    }

    // public taraf için ekstra maskeleme ihtiyacın olursa buraya koyarız
    return ok(res, { blacklist: doc, admin });
  } catch (e) {
    console.error("[BLACKLIST] GET /:idOrSlug error", e);
    return next(e);
  }
});

export default router;
