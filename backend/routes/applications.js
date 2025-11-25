// backend/routes/admin/applications.js — PRO / LIVE READY (VerificationRequest-first)
import express from "express";
import mongoose from "mongoose";
import Business from "../../models/Business.js";
import { requireAdmin } from "../_helpers/requireAdmin.js";

// modelleri direkte import etmek yerine dinamik seçiyoruz
// (aynı collection'a iki farklı schema ile bağlanma riskini azaltır)
const APPLY_MODEL_CANDIDATES = ["VerificationRequest", "ApplyRequest"];

function pickModel(list = []) {
  for (const n of list) if (mongoose.models[n]) return mongoose.models[n];
  return null;
}

async function getApplyModel() {
  let M = pickModel(APPLY_MODEL_CANDIDATES);
  if (M) return M;

  try {
    await import("../../models/VerificationRequest.js");
    M = pickModel(APPLY_MODEL_CANDIDATES);
    if (M) return M;
  } catch {}

  try {
    await import("../../models/ApplyRequest.js");
    M = pickModel(APPLY_MODEL_CANDIDATES);
    if (M) return M;
  } catch {}

  return pickModel(APPLY_MODEL_CANDIDATES);
}

async function getLegacyApplyModel() {
  // primary VerificationRequest ise legacy ApplyRequest’i fallback olarak kullan
  try {
    await import("../../models/ApplyRequest.js");
    return mongoose.models.ApplyRequest || null;
  } catch {
    return mongoose.models.ApplyRequest || null;
  }
}

async function getLegacyVerificationModel() {
  try {
    await import("../../models/VerificationRequest.js");
    return mongoose.models.VerificationRequest || null;
  } catch {
    return mongoose.models.VerificationRequest || null;
  }
}

const router = express.Router();

/* ========== Helpers ========== */

/**
 * "appl_65f0..." gibi id gelirse prefix'i atıp gerçek ObjectId'yi döndürür
 */
function normalizeId(id) {
  if (!id) return id;
  const s = String(id);
  if (s.includes("_")) {
    const parts = s.split("_");
    return parts[parts.length - 1];
  }
  return s;
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

/**
 * Sağdaki "Belgeler & Görseller" kutusu için eski özet bilgisi
 */
function buildLegacySummary(doc) {
  if (!doc) return { docCount: 0, imageCount: 0, folder: undefined };

  const docs = Array.isArray(doc.docs) ? doc.docs : [];
  const images = Array.isArray(doc.images) ? doc.images : [];

  return {
    docCount:
      typeof doc.docCount === "number" ? doc.docCount : docs.length || 0,
    imageCount:
      typeof doc.imageCount === "number" ? doc.imageCount : images.length || 0,
    folder: doc.folder || undefined,
  };
}

/**
 * Apply/Verification dokümanından galeriye gidecek görsel path'lerini çıkarır.
 * Sadece görsel benzeri alanlara bakar.
 */
function extractImagePaths(app) {
  if (!app) return [];
  const raw =
    (Array.isArray(app.images) ? app.images : []) ||
    (Array.isArray(app.gallery) ? app.gallery : []) ||
    (Array.isArray(app.photos) ? app.photos : []) ||
    [];

  const out = [];
  for (const v of raw) {
    if (!v) continue;
    if (typeof v === "string") out.push(v);
    else if (typeof v === "object") {
      const s = v.url || v.path || v.href || v.src || v.location;
      if (s) out.push(String(s));
    }
  }
  return [...new Set(out)];
}

/**
 * Başvuru dokümanını Business.upsertByNaturalKeys için payload'a çevirir.
 * (Business.fromPayload içinde normalize ediliyor)
 */
function buildBusinessPayloadFromApp(app) {
  const images = extractImagePaths(app);

  return {
    name:
      app.name ||
      app.businessName ||
      app.legalName ||
      app.tradeTitle ||
      "İsimsiz İşletme",
    type: app.type,
    slug: app.slug,
    instagramUsername: app.instagramUsername || app.instagram,
    instagram: app.instagram, // legacy destek
    instagramUrl: app.instagramUrl || app.instagram,
    phone:
      app.phone ||
      app.phoneMobile ||
      app.phoneMobil ||
      app.phoneFixed ||
      app.landline,
    email: app.email,
    website: app.website,
    address: app.address,
    city: app.city,
    district: app.district,
    desc: app.note || app.description,
    images, // -> Business.gallery (virtual images/photos ile uyumlu)
    verified: true,
    status: "approved",
  };
}

/**
 * Create / update için body'den güvenli alanları seçer.
 * Yeni + legacy alanları birlikte taşıyoruz ki model pre-save normalize etsin.
 */
function pickApplicationFields(payload = {}) {
  const name =
    payload.name ||
    payload.businessName ||
    payload.legalName ||
    payload.tradeTitle ||
    "";

  const igUrl =
    payload.instagramUrl ||
    (typeof payload.instagram === "string" && /^https?:\/\//i.test(payload.instagram)
      ? payload.instagram
      : "") ||
    payload.instagram ||
    "";

  return {
    // yeni alanlar
    name,
    tradeTitle: payload.tradeTitle || payload.legalName,
    type: payload.type,
    instagramUsername: payload.instagramUsername,
    instagramUrl: igUrl,
    phone: payload.phone || payload.phoneMobile || payload.phoneMobil,
    landline: payload.landline || payload.phoneFixed,
    city: payload.city,
    district: payload.district,
    address: payload.address,
    email: payload.email,
    website: payload.website,
    note: payload.note,
    status: payload.status || "pending",

    // legacy alanlar (geriye dönük uyum)
    businessName: payload.businessName,
    legalName: payload.legalName,
    phoneMobile: payload.phoneMobile || payload.phone || payload.phoneMobil,
    phoneFixed: payload.phoneFixed || payload.landline,
    instagram: payload.instagram,
  };
}

/**
 * Liste / CSV için filtreleri kurar.
 */
function buildFilterFromQuery(query) {
  const filter = {};
  const { status, q, from, to } = query || {};

  if (status && status !== "all") filter.status = status;

  const qStr = String(q || "").trim();
  if (qStr) {
    const rx = safeRegex(qStr);
    const or = [];

    if (isObjectIdLike(qStr)) {
      or.push({ _id: new mongoose.Types.ObjectId(qStr) });
    }

    if (rx) {
      or.push(
        { applicantName: rx },
        { fullName: rx },
        { name: rx },
        { tradeTitle: rx },
        { businessName: rx },
        { legalName: rx },
        { instagram: rx },
        { instagramUsername: rx },
        { instagramUrl: rx },
        { email: rx },
        { phoneMobile: rx },
        { phoneFixed: rx },
        { phone: rx },
        { landline: rx },
        { slug: rx },
        { city: rx },
        { district: rx },
        { address: rx }
      );
    }

    if (or.length) filter.$or = or;
  }

  const fromStr = String(from || "").trim();
  const toStr = String(to || "").trim();

  let fromDate = null;
  let toDate = null;

  if (fromStr) {
    const d = new Date(fromStr);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      fromDate = d;
    }
  }
  if (toStr) {
    const d = new Date(toStr);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      toDate = d;
    }
  }

  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = fromDate;
    if (toDate) filter.createdAt.$lte = toDate;
  }

  return filter;
}

function buildSort(sortParam) {
  const s = String(sortParam || "-createdAt");
  if (s === "createdAt") return { createdAt: 1 };
  if (s === "-createdAt") return { createdAt: -1 };
  if (s === "updatedAt") return { updatedAt: 1 };
  if (s === "-updatedAt") return { updatedAt: -1 };
  return { createdAt: -1 };
}

async function findByIdWithFallback(id) {
  const Primary = await getApplyModel();
  const LegacyApply = await getLegacyApplyModel();
  const LegacyVR = await getLegacyVerificationModel();

  let doc = Primary ? await Primary.findById(id) : null;
  if (doc) return { doc, source: Primary?.modelName === "VerificationRequest" ? "verification" : "apply", Model: Primary };

  // fallback 1
  if (LegacyApply && LegacyApply !== Primary) {
    doc = await LegacyApply.findById(id);
    if (doc) return { doc, source: "apply", Model: LegacyApply };
  }

  // fallback 2
  if (LegacyVR && LegacyVR !== Primary) {
    doc = await LegacyVR.findById(id);
    if (doc) return { doc, source: "verification", Model: LegacyVR };
  }

  return { doc: null, source: null, Model: null };
}

/* ========== Routes ========== */

/**
 * Liste: GET /api/admin/applications
 */
router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply) {
      return res.json({ applications: [], total: 0, page: 1, pages: 1, limit: 20 });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limitRaw = parseInt(req.query.limit || "20", 10);
    const limit = Math.min(Math.max(limitRaw || 20, 1), 200);
    const sort = buildSort(req.query.sort);

    const filter = buildFilterFromQuery(req.query);

    const total = await Apply.countDocuments(filter);
    const docs = await Apply.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const applications = docs.map((d) => {
      const json = Apply.hydrate(d).toJSON();
      json._source = Apply.modelName === "VerificationRequest" ? "verification" : "apply";
      json._legacy = buildLegacySummary(d);
      return json;
    });

    const pages = Math.max(1, Math.ceil((total || 0) / limit));

    return res.json({ applications, total, page, pages, limit });
  } catch (err) {
    next(err);
  }
});

/**
 * CSV export: GET /api/admin/applications/export.csv
 */
router.get("/export.csv", requireAdmin, async (req, res, next) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply) return res.status(404).end();

    const sort = buildSort(req.query.sort);
    const filter = buildFilterFromQuery(req.query);

    const docs = await Apply.find(filter).sort(sort).lean();

    const header = [
      "id",
      "name",
      "tradeTitle",
      "phone",
      "email",
      "instagram",
      "city",
      "district",
      "status",
      "createdAt",
      "source",
    ];

    const lines = docs.map((d) => {
      const json = Apply.hydrate(d).toJSON();
      const row = [
        json._id,
        json.nameResolved || json.name || json.businessName || "",
        json.tradeTitleResolved || json.tradeTitle || json.legalName || "",
        json.phoneResolved || json.phone || "",
        json.email || "",
        json.instagramUrlResolved || json.instagramUrl || json.instagramUsername || "",
        json.cityResolved || json.city || "",
        json.districtResolved || json.district || "",
        json.status || "",
        json.createdAt ? new Date(json.createdAt).toISOString() : "",
        Apply.modelName === "VerificationRequest" ? "verification" : "apply",
      ];
      return row
        .map((v) => {
          const s = String(v ?? "");
          if (s.includes(";") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(";");
    });

    const csv = [header.join(";"), ...lines].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="applications.csv"'
    );
    return res.send("\uFEFF" + csv);
  } catch (err) {
    next(err);
  }
});

/**
 * Bulk işlemler: POST /api/admin/applications/bulk
 * Body: { ids:[], op:"status"|"delete", value?:string }
 */
router.post("/bulk", requireAdmin, async (req, res, next) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.status(404).json({ message: "Model yok" });

    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.map(normalizeId).filter(isObjectIdLike)
      : [];
    const op = String(req.body.op || "").toLowerCase();

    if (!ids.length || !op) {
      return res
        .status(400)
        .json({ message: "Geçersiz istek (ids / op eksik)." });
    }

    let result = {};

    if (op === "status") {
      const value = req.body.value || "pending";
      const r = await Apply.updateMany(
        { _id: { $in: ids } },
        { $set: { status: value } }
      );
      result = { matched: r.matchedCount, modified: r.modifiedCount };
    } else if (op === "delete") {
      const r = await Apply.deleteMany({ _id: { $in: ids } });
      result = { deleted: r.deletedCount };
    } else {
      return res.status(400).json({ message: "Bilinmeyen bulk işlemi." });
    }

    return res.json({ ok: true, op, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * Manuel başvuru oluşturma: POST /api/admin/applications
 */
router.post("/", requireAdmin, async (req, res, next) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.status(404).json({ message: "Model yok" });

    const safe = pickApplicationFields(req.body || {});
    const doc = await Apply.create(safe);

    const json = doc.toJSON();
    json._source = Apply.modelName === "VerificationRequest" ? "verification" : "apply";
    json._legacy = buildLegacySummary(json);

    return res.status(201).json({ application: json });
  } catch (err) {
    next(err);
  }
});

/**
 * Başvuru güncelleme: PATCH /api/admin/applications/:id
 */
router.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.status(404).json({ message: "Model yok" });

    const id = normalizeId(req.params.id);
    const safe = pickApplicationFields(req.body || {});

    const doc = await Apply.findByIdAndUpdate(
      id,
      { $set: safe },
      { new: true }
    ).lean();

    if (!doc) {
      return res.status(404).json({ message: "Başvuru bulunamadı" });
    }

    const json = Apply.hydrate(doc).toJSON();
    json._source = Apply.modelName === "VerificationRequest" ? "verification" : "apply";
    json._legacy = buildLegacySummary(doc);

    return res.json({ application: json });
  } catch (err) {
    next(err);
  }
});

/**
 * Başvuruyu silme: DELETE /api/admin/applications/:id
 */
router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const Apply = await getApplyModel();
    if (!Apply)
      return res.status(404).json({ message: "Model yok" });

    const id = normalizeId(req.params.id);
    const r = await Apply.findByIdAndDelete(id);

    if (!r) {
      return res.status(404).json({ message: "Başvuru bulunamadı" });
    }

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Başvuruyu onayla ve işletmeyi oluştur/güncelle:
 * POST /api/admin/applications/:id/approve
 */
router.post("/:id/approve", requireAdmin, async (req, res, next) => {
  try {
    const id = normalizeId(req.params.id);
    const { doc: app, source, Model } = await findByIdWithFallback(id);

    if (!app || !Model) {
      return res.status(404).json({ message: "Başvuru bulunamadı" });
    }

    const payload = buildBusinessPayloadFromApp(app);
    const business = await Business.upsertByNaturalKeys(payload);

    // status + link (if schema has)
    app.status = "approved";
    if (app.constructor?.schema?.path("business")) app.business = business._id;
    if (app.constructor?.schema?.path("businessId")) app.businessId = business._id;
    if (app.constructor?.schema?.path("reviewedAt")) app.reviewedAt = new Date();
    await app.save();

    return res.json({
      ok: true,
      source,
      businessId: business._id,
      business,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Detay: GET /api/admin/applications/:id
 */
router.get("/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = normalizeId(req.params.id);

    const { doc, source, Model } = await findByIdWithFallback(id);

    if (!doc || !Model) {
      return res.status(404).json({ message: "Başvuru bulunamadı" });
    }

    const json = Model.hydrate(doc).toJSON();
    json._source = source;
    json._legacy = buildLegacySummary(doc);

    return res.json({ application: json });
  } catch (err) {
    next(err);
  }
});

export default router;
