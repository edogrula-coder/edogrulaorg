// backend/routes/admin.js — Admin API (PRO / LIVE READY, models-uyumlu)
import express from "express";
import mongoose from "mongoose";
import path from "path";
import multer from "multer";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* ====================== Upload / Media Helpers ====================== */

const uploadDir =
  process.env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const original = file.originalname || "file";
    const ext = path.extname(original);
    const base = path
      .basename(original, ext)
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "")
      .toLowerCase();
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({ storage });

function applyCoverToBusinessDoc(doc, url) {
  if (!doc || !url) return doc;

  const schema = doc.constructor?.schema;

  // Önce kapak alanları
  if (schema?.path("coverImage")) {
    doc.coverImage = url;
  } else if (schema?.path("coverImageUrl")) {
    doc.coverImageUrl = url;
  } else {
    // Şema katı olsa bile çoğu durumda sorun çıkarmaz; fallback
    doc.coverImage = url;
  }

  // Olası galeri alanları
  const galleryFields = [
    "images",
    "gallery",
    "galleryImages",
    "documents",
    "docs",
    "files",
    "evidenceFiles",
  ];

  for (const f of galleryFields) {
    const p = schema?.path(f);
    if (!p) continue;

    if (!Array.isArray(doc[f])) {
      doc[f] = [];
    }
    if (!doc[f].includes(url)) {
      doc[f].push(url);
    }
  }

  return doc;
}

/* ====================== Helpers / Context ====================== */
function attachAdminContext(req, _res, next) {
  if (req.user) {
    req.admin = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    };
  }
  next();
}

const BUSINESS_MODEL_CANDIDATES = ["Business", "Company", "Listing"];
const APPLY_MODEL_CANDIDATES = [
  "VerificationRequest", // ✅ yeni ana modelin
  "ApplyRequest",
  "Application",
  "ApplicationRequest",
  "BusinessApply",
];

function pickModel(list = []) {
  for (const n of list) if (mongoose.models[n]) return mongoose.models[n];
  return null;
}

async function getBusinessModel() {
  let M = pickModel(BUSINESS_MODEL_CANDIDATES);
  if (M) return M;
  try {
    await import("../models/Business.js");
    return pickModel(BUSINESS_MODEL_CANDIDATES);
  } catch {}
  return pickModel(BUSINESS_MODEL_CANDIDATES);
}

async function getApplyModel() {
  let M = pickModel(APPLY_MODEL_CANDIDATES);
  if (M) return M;

  try {
    await import("../models/VerificationRequest.js");
    M = pickModel(APPLY_MODEL_CANDIDATES);
    if (M) return M;
  } catch {}

  try {
    await import("../models/ApplyRequest.js");
    M = pickModel(APPLY_MODEL_CANDIDATES);
    if (M) return M;
  } catch {}

  try {
    await import("../models/Application.js");
    M = pickModel(APPLY_MODEL_CANDIDATES);
    if (M) return M;
  } catch {}

  return pickModel(APPLY_MODEL_CANDIDATES);
}

function parseListParams(req, { defLimit = 50, maxLimit = 200 } = {}) {
  const limit = Math.max(1, Math.min(+req.query.limit || defLimit, maxLimit));
  const page = Math.max(1, +req.query.page || 1);
  const skip = (page - 1) * limit;

  const sort = {};
  const sortParam = String(req.query.sort || "-createdAt");
  for (const part of sortParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (part.startsWith("-")) sort[part.slice(1)] = -1;
    else sort[part] = 1;
  }

  let fields;
  if (req.query.fields) {
    fields = String(req.query.fields)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }

  const dateFilter = {};
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  if (from || to) {
    dateFilter.createdAt = {};
    if (from && !isNaN(from)) dateFilter.createdAt.$gte = from;
    if (to && !isNaN(to)) dateFilter.createdAt.$lte = to;
  }

  return { limit, page, skip, sort, fields, dateFilter };
}

const isObjectIdLike = (v) => mongoose.isValidObjectId(String(v));

function safeRegex(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  return new RegExp(
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i"
  );
}

function buildCommonSearch(q) {
  const s = String(q || "").trim();
  if (!s) return {};
  if (isObjectIdLike(s)) return { _id: new mongoose.Types.ObjectId(s) };
  const rx = safeRegex(s);
  return {
    $or: [
      { name: rx },
      { title: rx },
      { slug: rx },
      { phone: rx },
      { phones: rx }, // ✅ array alanını da yakala
      { email: rx },
      { instagramUsername: rx },
      { instagramUrl: rx },
      { website: rx },
      { address: rx },
      { desc: rx },
      { businessName: rx },
      { legalName: rx },
      { instagram: rx },
      { phoneMobile: rx },
    ].filter(Boolean),
  };
}

function buildApplySearch(q) {
  const s = String(q || "").trim();
  if (!s) return {};
  if (isObjectIdLike(s)) return { _id: new mongoose.Types.ObjectId(s) };
  const rx = safeRegex(s);
  return {
    $or: [
      { name: rx },
      { businessName: rx },
      { slug: rx },
      { email: rx },
      { phone: rx },
      { phoneMobile: rx },
      { instagram: rx },
      { instagramUsername: rx },
      { instagramUrl: rx },
      { city: rx },
      { district: rx },
    ].filter(Boolean),
  };
}

function toCSV(rows = []) {
  const BOM = "\uFEFF";
  if (!rows.length) return BOM + "id\n";
  const keySet = new Set(["_id"]);
  rows.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));
  const keys = Array.from(keySet);
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = keys.map(esc).join(";");
  const body = rows
    .map((row) => keys.map((k) => esc(k === "_id" ? row._id : row[k])).join(";"))
    .join("\n");
  return BOM + header + "\n" + body + "\n";
}

function parseIdsParam(idsParam) {
  if (!idsParam) return [];
  return String(idsParam)
    .split(",")
    .map((s) => s.trim())
    .filter(isObjectIdLike)
    .map((s) => new mongoose.Types.ObjectId(s));
}

/* ------------ allow-lists ------------ */
const ALLOWED_BUSINESS_UPDATE_KEYS = new Set([
  "status",
  "verified",
  "featured",
  "name",
  "title",
  "slug",
  "address",
  "desc",
  "website",
  "email",
  "phone",
  "phones",
  "phoneMobile",
  "instagram",
  "instagramUrl",
  "instagramUsername",
  "score",
  "tags",

  "city",
  "district",
  "il",
  "ilce",
  "type",
  "kind",
  "source",

  "coverImage",
  "coverImageUrl",
  "images",
  "gallery",
  "galleryImages",
  "documents",
  "docs",
  "files",
  "evidenceFiles",
]);

const ALLOWED_APPLICATION_UPDATE_KEYS = new Set([
  "status",
  "note",
  "name",
  "businessName",
  "slug",
  "email",
  "phone",
  "phoneMobile",
  "instagram",
  "instagramUsername",
  "instagramUrl",
  "city",
  "district",
  "address",
]);

function buildUpdateFromBody(body = {}, allowSet = new Set()) {
  const $set = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowSet.has(k)) $set[k] = v;
  }
  return Object.keys($set).length ? { $set } : null;
}

/* ------------ slug helpers (TR fix + unique) ------------ */
function slugifyTR(s = "") {
  const map = {
    ş: "s",
    Ş: "s",
    ı: "i",
    İ: "i",
    ğ: "g",
    Ğ: "g",
    ü: "u",
    Ü: "u",
    ö: "o",
    Ö: "o",
    ç: "c",
    Ç: "c",
  };
  return String(s)
    .replace(/[ŞşİıĞğÜüÖöÇç]/g, (ch) => map[ch] || ch)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureUniqueSlug(Business, base) {
  const baseClean = slugifyTR(base) || "isletme";
  let slug = baseClean;
  let i = 1;
  while (await Business.exists({ slug })) {
    i += 1;
    slug = `${baseClean}-${i}`;
  }
  return slug;
}

function pickInitialBusinessStatus(Business) {
  const ev = Business?.schema?.path("status")?.enumValues || [];
  const preferred = ["approved", "active", "published", "enabled", "ok", "verified"];
  for (const k of preferred) if (ev.includes(k)) return k;
  return undefined;
}

/* ====================== Approval core ====================== */
const cleanUsername = (u = "") => {
  const x = String(u || "").trim().replace(/^@+/, "").toLowerCase();
  return x || null;
};

function normalizeInstagramFromBody(body = {}) {
  const out = { ...body };

  if (typeof out.instagramUsername === "string") {
    out.instagramUsername = cleanUsername(out.instagramUsername);
  }

  if (!out.instagramUsername && typeof out.instagramUrl === "string") {
    const m = String(out.instagramUrl).match(/instagram\.com\/([^/?#]+)/i);
    if (m && m[1]) out.instagramUsername = cleanUsername(m[1]);
  }

  if (!out.instagramUrl && typeof out.instagram === "string") {
    if (/^https?:\/\//i.test(out.instagram)) {
      out.instagramUrl = out.instagram;
    }
  }

  if (out.instagramUsername && !out.instagramUrl) {
    out.instagramUrl = `https://instagram.com/${out.instagramUsername}`;
  }

  return out;
}

async function upsertBusinessFromApplication(_req, appDoc) {
  const Business = await getBusinessModel();
  if (!Business) throw new Error("Business modeli yok");
  if (!appDoc) throw new Error("Başvuru yok");

  const linkedId =
    (appDoc.business && isObjectIdLike(appDoc.business) && appDoc.business) ||
    (appDoc.businessId && isObjectIdLike(appDoc.businessId) && appDoc.businessId);

  if (linkedId) {
    const linked = await Business.findById(linkedId).lean();
    if (linked) return { business: linked, created: false, updated: false };
  }

  const desiredName =
    (appDoc.businessName || appDoc.name || "").trim() || "İsimsiz İşletme";
  const desiredSlugBase = (
    appDoc.slug ||
    desiredName ||
    appDoc.instagramUsername ||
    "isletme"
  ).trim();

  const username = cleanUsername(appDoc.instagramUsername);

  const candidates = [];
  const slugCandidate = slugifyTR(desiredSlugBase);
  if (slugCandidate) candidates.push({ slug: slugCandidate }); // ✅ boş slug aramasını engelle
  if (username) candidates.push({ instagramUsername: username });
  if (appDoc.phone) candidates.push({ phone: appDoc.phone });

  const existing =
    candidates.length > 0
      ? await Business.findOne({ $or: candidates }).lean()
      : null;

  const initialStatus = pickInitialBusinessStatus(Business);
  const payload = {
    name: desiredName,
    title: desiredName,
    verified: true,
    createdFrom: "application",
    createdFromId: appDoc._id,
  };
  if (initialStatus) payload.status = initialStatus;

  if (appDoc.email) payload.email = appDoc.email;
  if (appDoc.phone) {
    payload.phone = appDoc.phone;
    payload.phoneMobile = appDoc.phone;
  }
  if (appDoc.website) payload.website = appDoc.website;
  if (appDoc.address) payload.address = appDoc.address;
  if (appDoc.note) payload.desc = appDoc.note;

  if (appDoc.instagram) {
    payload.instagram = appDoc.instagram;
    payload.instagramUrl = appDoc.instagram;
  } else if (username) {
    payload.instagramUrl = `https://instagram.com/${username}`;
  }
  if (username) payload.instagramUsername = username;

  if (existing) {
    const updated = await Business.findByIdAndUpdate(
      existing._id,
      { $set: payload },
      { new: true }
    ).lean();
    return { business: updated, created: false, updated: true };
  }

  const slug = await ensureUniqueSlug(Business, desiredSlugBase);
  try {
    const created = await Business.create({ ...payload, slug });
    return { business: created.toObject(), created: true, updated: false };
  } catch (e) {
    if (e?.code === 11000) {
      const fallbackSlug = await ensureUniqueSlug(
        Business,
        `${desiredSlugBase}-${Date.now().toString(36)}`
      );
      const payload2 = { ...payload, slug: fallbackSlug };
      if (!username) delete payload2.instagramUsername;
      const created = await Business.create(payload2);
      return { business: created.toObject(), created: true, updated: false };
    }
    throw e;
  }
}

async function approveApplicationAndCreateBusiness(req, appDoc) {
  const out = await upsertBusinessFromApplication(req, appDoc);

  const schema = appDoc?.constructor?.schema;
  const hasBusinessRef = !!schema?.path("business");
  const hasBusinessIdRef = !!schema?.path("businessId");
  const hasApprovedAt = !!schema?.path("approvedAt");
  const hasReviewedAt = !!schema?.path("reviewedAt");

  appDoc.status = "approved";
  if (hasApprovedAt) appDoc.approvedAt = new Date();
  if (hasReviewedAt) appDoc.reviewedAt = new Date();

  if (hasBusinessRef) appDoc.business = out.business._id;
  if (hasBusinessIdRef) appDoc.businessId = out.business._id;
  if (!hasBusinessRef && !hasBusinessIdRef) {
    appDoc.business = out.business._id;
    appDoc.businessId = out.business._id;
  }

  const un = cleanUsername(appDoc.instagramUsername);
  if (un) appDoc.instagramUsername = un;
  else appDoc.instagramUsername = undefined;

  await appDoc.save();
  return out;
}

/* ====================== Auth ====================== */
const protect = [authenticate, requireAdmin, attachAdminContext];

/* ====================== Routes ====================== */
// me
router.get("/me", ...protect, (req, res) => {
  res.json({ success: true, user: req.admin || null });
});

/* ---------------------- BUSINESSES ---------------------- */

// Liste (paginated)
router.get("/businesses", ...protect, async (req, res) => {
  try {
    const Business = await getBusinessModel();
    if (!Business)
      return res.json({
        success: true,
        businesses: [],
        items: [],
        total: 0,
        note: "Business modeli bulunamadı",
      });

    const { limit, page, skip, sort, fields, dateFilter } =
      parseListParams(req);
    let filter = { ...buildCommonSearch(req.query.q), ...dateFilter };

    const hasFilter =
      req.query.q ||
      req.query.status ||
      req.query.verified ||
      req.query.ids ||
      req.query.from ||
      req.query.to;
    if (!hasFilter) filter = {};

    const idList = parseIdsParam(req.query.ids);
    if (idList.length) filter._id = { $in: idList };

    if (typeof req.query.status === "string" && req.query.status !== "all") {
      filter.status = req.query.status;
    }
    if (typeof req.query.verified === "string") {
      const v = req.query.verified.toLowerCase();
      if (v === "true" || v === "false") filter.verified = v === "true";
    }

    const query = Business.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();
    if (fields) query.select(fields);

    const [items, total] = await Promise.all([
      query,
      Business.countDocuments(filter),
    ]);

    if (String(req.query.format || "").toLowerCase() === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=businesses.csv"
      );
      return res.send(toCSV(items));
    }

    res.json({
      success: true,
      businesses: items,
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Admin businesses list error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Tüm liste (capped)
router.get("/businesses/all", ...protect, async (req, res) => {
  try {
    const Business = await getBusinessModel();
    if (!Business)
      return res.json({
        success: true,
        businesses: [],
        items: [],
        total: 0,
        note: "Business modeli bulunamadı",
      });

    const { fields, sort } = parseListParams(req, {
      defLimit: 1000,
      maxLimit: 5000,
    });
    const limit = Math.min(+req.query.max || 2000, 5000);

    const query = Business.find({}).sort(sort).limit(limit).lean();
    if (fields) query.select(fields);

    const items = await query;
    res.json({
      success: true,
      businesses: items,
      items,
      total: items.length,
      capped: true,
      limit,
    });
  } catch (err) {
    console.error("Admin businesses all error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// CSV export
router.get("/businesses/export.csv", ...protect, async (req, res) => {
  try {
    const Business = await getBusinessModel();
    if (!Business) return res.status(404).end();

    const { sort, fields, dateFilter } = parseListParams(req, {
      defLimit: 1000,
      maxLimit: 5000,
    });
    let filter = { ...buildCommonSearch(req.query.q), ...dateFilter };
    const idList = parseIdsParam(req.query.ids);
    if (idList.length) filter._id = { $in: idList };

    const query = Business.find(filter).sort(sort).lean();
    if (fields) query.select(fields);
    const items = await query;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=businesses-export.csv"
    );
    return res.send(toCSV(items));
  } catch (err) {
    console.error("Admin businesses export error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Tekil getir (id veya slug)
router.get("/businesses/:idOrSlug", ...protect, async (req, res) => {
  try {
    const Business = await getBusinessModel();
    if (!Business)
      return res.status(404).json({ success: false, message: "Model yok" });

    const key = req.params.idOrSlug;
    const doc = isObjectIdLike(key)
      ? await Business.findById(key).lean()
      : await Business.findOne({ slug: key }).lean();

    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "Kayıt bulunamadı" });
    res.json({ success: true, business: doc });
  } catch (err) {
    console.error("Admin businesses get error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Yeni işletme oluştur (admin panelden)
router.post("/businesses", ...protect, async (req, res) => {
  try {
    const Business = await getBusinessModel();
    if (!Business)
      return res.status(404).json({ success: false, message: "Model yok" });

    const rawBody = req.body || {};
    const body = normalizeInstagramFromBody(rawBody);

    const desiredName =
      (body.name || body.title || "").trim() || "İsimsiz İşletme";
    const desiredSlugBase = (
      body.slug ||
      desiredName ||
      body.instagramUsername ||
      ""
    ).trim() || "isletme";

    const payload = {};
    for (const k of ALLOWED_BUSINESS_UPDATE_KEYS) {
      if (body[k] !== undefined) payload[k] = body[k];
    }
    payload.name = payload.name || desiredName;
    payload.title = payload.title || desiredName;

    payload.slug = await ensureUniqueSlug(Business, desiredSlugBase);

    if (!payload.status) {
      const initialStatus = pickInitialBusinessStatus(Business);
      if (initialStatus) payload.status = initialStatus;
    }

    const created = await Business.create(payload);
    res.json({ success: true, business: created.toObject() });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. slug/instagramUsername/phone)",
      });
    }
    console.error("Admin businesses create error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// İşletme güncelle (phones-safe, doc.save)
router.patch("/businesses/:idOrSlug", ...protect, async (req, res) => {
  try {
    const Business = await getBusinessModel();
    if (!Business)
      return res.status(404).json({ success: false, message: "Model yok" });

    const rawBody = req.body || {};
    const body = normalizeInstagramFromBody(rawBody);

    const key = req.params.idOrSlug;
    const filter = isObjectIdLike(key) ? { _id: key } : { slug: key };
    const doc = await Business.findOne(filter);
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "Kayıt bulunamadı" });

    let touched = false;

    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_BUSINESS_UPDATE_KEYS.has(k)) continue;
      if (k === "slug") continue;
      doc[k] = v;
      touched = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      const requestedSlug = String(body.slug || "").trim();
      if (requestedSlug && requestedSlug !== doc.slug) {
        doc.slug = await ensureUniqueSlug(Business, requestedSlug);
        touched = true;
      }
    }

    if (!doc.slug && (doc.name || doc.title)) {
      const base = doc.slug || doc.name || doc.title;
      doc.slug = await ensureUniqueSlug(Business, base);
      touched = true;
    }

    if (!touched) {
      return res
        .status(400)
        .json({ success: false, message: "Güncellenecek alan yok" });
    }

    await doc.save();
    res.json({ success: true, business: doc.toObject() });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. slug/instagramUsername/phone)",
      });
    }
    console.error("Admin businesses patch error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Kapak / görsel upload
router.post(
  "/businesses/:idOrSlug/cover",
  ...protect,
  upload.single("file"), // field name = "file"
  async (req, res) => {
    try {
      const Business = await getBusinessModel();
      if (!Business)
        return res.status(404).json({ success: false, message: "Model yok" });

      const key = req.params.idOrSlug;
      const filter = isObjectIdLike(key) ? { _id: key } : { slug: key };
      const doc = await Business.findOne(filter);
      if (!doc)
        return res
          .status(404)
          .json({ success: false, message: "Kayıt bulunamadı" });

      console.log("🏢 [API ADMIN/BUSINESSES] COVER upload", {
        idOrSlug: key,
        id: doc._id?.toString(),
        hasFile: !!req.file,
        file: req.file && {
          filename: req.file.filename,
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
      });

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "Dosya bulunamadı" });
      }

      const base = (process.env.ASSET_BASE || "/uploads").replace(/\/+$/, "");
      const url = `${base}/${req.file.filename}`;

      applyCoverToBusinessDoc(doc, url);
      await doc.save();

      res.json({
        success: true,
        business: doc.toObject(),
        file: {
          url,
          filename: req.file.filename,
        },
      });
    } catch (err) {
      console.error("Admin businesses cover error:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// Sil
router.delete("/businesses/:idOrSlug", ...protect, async (req, res) => {
  try {
    const Business = await getBusinessModel();
    if (!Business)
      return res.status(404).json({ success: false, message: "Model yok" });
    const key = req.params.idOrSlug;
    const filter = isObjectIdLike(key) ? { _id: key } : { slug: key };
    const out = await Business.findOneAndDelete(filter).lean();
    if (!out)
      return res
        .status(404)
        .json({ success: false, message: "Kayıt bulunamadı" });
    res.json({ success: true, deleted: out._id });
  } catch (err) {
    console.error("Admin businesses delete error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Toplu işlemler
router.post("/businesses/bulk", ...protect, async (req, res) => {
  try {
    const Business = await getBusinessModel();
    if (!Business)
      return res.status(404).json({ success: false, message: "Model yok" });

    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.filter(isObjectIdLike)
      : parseIdsParam(req.body.ids);
    if (!ids.length)
      return res
        .status(400)
        .json({ success: false, message: "ids gerekli" });

    const op = String(req.body.op || "").toLowerCase();
    const value = req.body.value;

    let update;
    if (op === "verify") update = { $set: { verified: true } };
    else if (op === "unverify") update = { $set: { verified: false } };
    else if (op === "status" && typeof value === "string") {
      update = { $set: { status: value } };
    } else if (op === "feature") update = { $set: { featured: true } };
    else if (op === "unfeature") update = { $set: { featured: false } };

    if (op === "delete") {
      const r = await Business.deleteMany({ _id: { $in: ids } });
      return res.json({
        success: true,
        op,
        deleted: r.deletedCount || 0,
      });
    }

    if (!update)
      return res
        .status(400)
        .json({ success: false, message: "Geçersiz işlem" });

    const r = await Business.updateMany({ _id: { $in: ids } }, update);
    res.json({
      success: true,
      op,
      matched: r.matchedCount || r.nMatched || 0,
      modified: r.modifiedCount || r.nModified || 0,
    });
  } catch (err) {
    console.error("Admin businesses bulk error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

/* ---------------------- APPLICATIONS ---------------------- */

// Liste
router.get("/applications", ...protect, async (req, res) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.json({
        success: true,
        items: [],
        total: 0,
        note: "Apply/VerificationRequest modeli bulunamadı",
      });

    const { limit, page, skip, sort, fields, dateFilter } =
      parseListParams(req);
    let filter = { ...buildApplySearch(req.query.q), ...dateFilter };

    if (typeof req.query.status === "string" && req.query.status !== "all") {
      filter.status = String(req.query.status).trim();
    }

    const query = Apply.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();
    if (fields) query.select(fields);

    const [items, total] = await Promise.all([
      query,
      Apply.countDocuments(filter),
    ]);

    res.json({
      success: true,
      items,
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("Admin applications list error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// CSV export
router.get("/applications/export.csv", ...protect, async (_req, res) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply) return res.status(404).end();
    const rows = await Apply.find({}).sort({ createdAt: -1 }).lean();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=applications.csv"
    );
    res.send(toCSV(rows));
  } catch (err) {
    console.error("Admin applications export error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Manuel başvuru ekleme
router.post("/applications", ...protect, async (req, res) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.status(404).json({ success: false, message: "Model yok" });

    const body = req.body || {};
    const payload = {
      name: body.name || "",
      businessName: body.businessName || "",
      email: body.email || "",
      phone: body.phone || body.phoneMobile || "",
      instagram: body.instagram || "",
      instagramUsername: cleanUsername(body.instagramUsername),
      instagramUrl: body.instagramUrl || "",
      slug: body.slug || "",
      note: body.note || "",
      status: body.status || "pending",
      source: body.source || "admin",
      city: body.city || "",
      district: body.district || "",
      address: body.address || "",
    };
    if (!payload.instagramUsername) delete payload.instagramUsername;

    const doc = await Apply.create(payload);
    res.json({ success: true, item: doc });
  } catch (err) {
    console.error("Admin applications create error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Tekil onay
router.post("/applications/:id/approve", ...protect, async (req, res) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.status(404).json({ success: false, message: "Model yok" });

    const appDoc = await Apply.findById(req.params.id);
    if (!appDoc)
      return res
        .status(404)
        .json({ success: false, message: "Kayıt bulunamadı" });

    const { business, created, updated } =
      await approveApplicationAndCreateBusiness(req, appDoc);

    res.json({
      success: true,
      application: {
        id: appDoc._id,
        status: appDoc.status,
        businessId: appDoc.businessId ?? appDoc.business ?? null,
      },
      business,
      created,
      updated,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. instagramUsername/slug/phone)",
      });
    }
    console.error("Admin applications approve error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Patch (status: approved ise otomatik onay)
router.patch("/applications/:id", ...protect, async (req, res) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.status(404).json({ success: false, message: "Model yok" });

    const update = buildUpdateFromBody(
      req.body,
      ALLOWED_APPLICATION_UPDATE_KEYS
    );
    if (!update)
      return res
        .status(400)
        .json({ success: false, message: "Güncellenecek alan yok" });

    let appDoc = await Apply.findById(req.params.id);
    if (!appDoc)
      return res
        .status(404)
        .json({ success: false, message: "Kayıt bulunamadı" });

    const prevStatus = appDoc.status;
    Object.assign(appDoc, update.$set || {});
    if (appDoc.instagramUsername) {
      appDoc.instagramUsername = cleanUsername(appDoc.instagramUsername);
    }
    await appDoc.save();

    if (appDoc.status === "approved" && prevStatus !== "approved") {
      await approveApplicationAndCreateBusiness(req, appDoc);
      appDoc = await Apply.findById(req.params.id).lean();
    } else {
      appDoc = appDoc.toObject();
    }

    res.json({ success: true, item: appDoc });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. instagramUsername/slug/phone)",
      });
    }
    console.error("Admin applications patch error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Silme
router.delete("/applications/:id", ...protect, async (req, res) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.status(404).json({ success: false, message: "Model yok" });
    const out = await Apply.findByIdAndDelete(req.params.id).lean();
    if (!out)
      return res
        .status(404)
        .json({ success: false, message: "Kayıt bulunamadı" });
    res.json({ success: true, deleted: out._id });
  } catch (err) {
    console.error("Admin applications delete error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// Toplu işlemler
router.post("/applications/bulk", ...protect, async (req, res) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.status(404).json({ success: false, message: "Model yok" });

    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.filter(isObjectIdLike)
      : parseIdsParam(req.body.ids);
    if (!ids.length)
      return res
        .status(400)
        .json({ success: false, message: "ids gerekli" });

    const op = String(req.body.op || "").toLowerCase();
    const value = req.body.value;

    if (op === "delete") {
      const r = await Apply.deleteMany({ _id: { $in: ids } });
      return res.json({
        success: true,
        op,
        deleted: r.deletedCount || 0,
      });
    }

    if (op === "approve") {
      const docs = await Apply.find({ _id: { $in: ids } });
      let created = 0,
        updated = 0,
        processed = 0;
      const results = [];

      for (const d of docs) {
        try {
          const out = await approveApplicationAndCreateBusiness(req, d);
          if (out.created) created += 1;
          if (out.updated) updated += 1;
          processed += 1;
          results.push({ id: d._id, ok: true, businessId: out.business._id });
        } catch (e) {
          results.push({ id: d._id, ok: false, error: e?.message || "error" });
        }
      }

      return res.json({
        success: true,
        op,
        processed,
        created,
        updated,
        results,
      });
    }

    let update2;
    if (op === "status" && typeof value === "string") {
      update2 = { $set: { status: value } };
    }
    if (!update2)
      return res
        .status(400)
        .json({ success: false, message: "Geçersiz işlem" });

    const r = await Apply.updateMany({ _id: { $in: ids } }, update2);
    res.json({
      success: true,
      op,
      matched: r.matchedCount || r.nMatched || 0,
      modified: r.modifiedCount || r.nModified || 0,
    });
  } catch (err) {
    console.error("Admin applications bulk error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

export default router;
