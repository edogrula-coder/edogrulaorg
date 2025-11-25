// backend/routes/admin.featured.js — PRO / LIVE READY (Featured modeline uyumlu + legacy tolerant)
import express from "express";
import mongoose from "mongoose";
import Business from "../models/Business.js";
import Featured from "../models/Featured.js"; // ✅ artık gerçek modeli kullan

const adminFeaturedRouter = express.Router();
const publicFeaturedRouter = express.Router();

const { Types } = mongoose;

/* ---------------- utils ---------------- */

const escapeRx = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseListParams(req, { defLimit = 20, maxLimit = 200 } = {}) {
  const limit = Math.max(1, Math.min(+req.query.limit || defLimit, maxLimit));
  const page = Math.max(1, +req.query.page || 1);
  const skip = (page - 1) * limit;

  const sort = {};
  const sortParam = String(req.query.sort || "order, -createdAt");
  for (const part of sortParam.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part.startsWith("-")) sort[part.slice(1)] = -1;
    else sort[part] = 1;
  }

  const dateFilter = {};
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  if (from || to) {
    dateFilter.createdAt = {};
    if (from && !isNaN(from)) dateFilter.createdAt.$gte = from;
    if (to && !isNaN(to)) dateFilter.createdAt.$lte = to;
  }

  return { limit, page, skip, sort, dateFilter };
}

function pickImage(b) {
  return (
    b?.coverImage ||
    b?.coverUrl ||
    b?.imageUrl ||
    (Array.isArray(b?.images) && (b.images[0]?.url || b.images[0])) ||
    (Array.isArray(b?.photos) && (b.photos[0]?.url || b.photos[0])) ||
    (Array.isArray(b?.gallery) && b.gallery[0]) ||
    ""
  );
}

// Legacy status -> yeni şemadaki active + tarih penceresi mantığına map
function statusToActive(status) {
  const s = String(status || "").toLowerCase();
  if (!s || s === "all") return null;
  if (s === "active") return { active: true };
  if (["draft", "archived", "hidden"].includes(s)) return { active: false };
  // scheduled/expired filtreleri tarih üzerinden yapılacak
  return null;
}

function buildStatusWindowFilter(status) {
  const s = String(status || "").toLowerCase();
  const now = new Date();
  if (s === "scheduled") {
    return {
      active: true,
      startAt: { $gt: now },
    };
  }
  if (s === "expired") {
    return {
      active: true,
      endAt: { $lt: now },
    };
  }
  return {};
}

// req.body legacy -> Featured payload normalize
function normalizeFeaturedPayload(body = {}) {
  const payload = { ...body };

  // business id (yeni/legacy)
  payload.business =
    payload.business ||
    payload.businessId ||
    payload.business_id ||
    undefined;

  if (payload.business && typeof payload.business === "string") {
    if (!Types.ObjectId.isValid(payload.business)) payload.business = undefined;
    else payload.business = new Types.ObjectId(payload.business);
  }

  // place/type yeni alanlar; legacy “placement” gelirse type’a düşelim
  if (!payload.type && payload.placement) payload.type = payload.placement;
  if (payload.place) payload.place = String(payload.place).trim();
  if (payload.type) payload.type = String(payload.type).trim();

  // order
  if (payload.order != null) payload.order = Number(payload.order) || 0;

  // legacy status -> active + tarih
  if (payload.status) {
    const map = statusToActive(payload.status);
    if (map) payload.active = map.active;
  }

  // active
  if (payload.active != null) payload.active = Boolean(payload.active);

  // startAt/endAt
  if (payload.startAt) payload.startAt = new Date(payload.startAt);
  if (payload.endAt) payload.endAt = new Date(payload.endAt);

  // ters tarihleri düzelt (modelde de var ama burada da garanti)
  if (
    payload.startAt &&
    payload.endAt &&
    payload.endAt instanceof Date &&
    payload.startAt instanceof Date &&
    payload.endAt < payload.startAt
  ) {
    const tmp = payload.startAt;
    payload.startAt = payload.endAt;
    payload.endAt = tmp;
  }

  // strict schema dışı alanları DB’ye yazmayacağız ama response’ta türeteceğiz
  delete payload.title;
  delete payload.subtitle;
  delete payload.imageUrl;
  delete payload.href;
  delete payload.businessId;
  delete payload.businessName;
  delete payload.businessSlug;
  delete payload.placement;
  delete payload.status;

  return payload;
}

// response’a legacy alanları geri ekle (frontend kırılmasın)
async function shapeLegacy(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };

  let b = null;
  if (o.business && Types.ObjectId.isValid(o.business)) {
    b = await Business.findById(o.business).lean();
  }

  const businessName = b?.name || "";
  const businessSlug = b?.slug || "";
  const imageUrl = b ? pickImage(b) : "";

  // legacy alanlar
  o.businessId = o.business;
  o.businessName = businessName;
  o.businessSlug = businessSlug;
  o.title = businessName || o.place || "Featured";
  o.subtitle = o.type || "";
  o.placement = o.type || "home";
  o.imageUrl = imageUrl;
  o.href = businessSlug ? `/isletme/${businessSlug}` : "";

  // legacy status üret
  const now = new Date();
  let status = o.active ? "active" : "draft";
  if (o.active && o.startAt && now < new Date(o.startAt)) status = "scheduled";
  if (o.active && o.endAt && now > new Date(o.endAt)) status = "expired";
  o.status = status;

  return o;
}

/* ---------------- Admin: list ---------------- */
adminFeaturedRouter.get("/", async (req, res) => {
  try {
    const { limit, page, skip, sort, dateFilter } = parseListParams(req);
    const filter = { ...dateFilter };

    // q araması: business üzerinden yapalım (legacy’de title vs vardı)
    if (req.query.q) {
      const q = String(req.query.q).trim();
      const rx = new RegExp(escapeRx(q), "i");
      // businessName/slug’ı aramak için join yapacağız
      const bizIds = await Business.find({
        $or: [{ name: rx }, { slug: rx }, { instagramUsername: rx }, { phone: rx }],
      }).select("_id").lean();

      filter.$or = [
        { place: rx },
        { type: rx },
        { business: { $in: bizIds.map(x => x._id) } },
      ];
    }

    // legacy status filtrelerini destekle
    if (typeof req.query.status === "string" && req.query.status !== "all") {
      Object.assign(filter, buildStatusWindowFilter(req.query.status));
      const map = statusToActive(req.query.status);
      if (map) Object.assign(filter, map);
    }

    // yeni place/type filtreleri + legacy placement
    if (typeof req.query.place === "string" && req.query.place !== "all") {
      filter.place = String(req.query.place).trim();
    }
    const typeParam = req.query.type || req.query.placement;
    if (typeof typeParam === "string" && typeParam !== "all") {
      filter.type = String(typeParam).trim();
    }

    const [items, total] = await Promise.all([
      Featured.find(filter).sort(sort).skip(skip).limit(limit),
      Featured.countDocuments(filter),
    ]);

    const shaped = await Promise.all(items.map(shapeLegacy));

    res.json({
      success: true,
      featured: shaped,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    });
  } catch (e) {
    console.error("admin featured list error:", e);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

/* ---------------- Admin: create (esnek) ---------------- */
adminFeaturedRouter.post("/", async (req, res) => {
  try {
    let payload = normalizeFeaturedPayload(req.body);

    // business zorunlu
    if (!payload.business) {
      return res.status(400).json({ success: false, message: "businessId/business gerekli" });
    }

    // order yoksa otomatik
    if (payload.order == null) {
      const max = await Featured.findOne({}, { order: 1 }).sort({ order: -1 }).lean();
      payload.order = (max?.order || 0) + 1;
    }

    const doc = await Featured.create(payload);
    const shaped = await shapeLegacy(doc);

    res.status(201).json({ success: true, item: shaped });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ success: false, message: "Bu featured zaten var" });
    }
    console.error("admin featured create error:", e);
    res.status(500).json({ success: false, message: "Kaydedilemedi" });
  }
});

/* ---------------- Admin: update ---------------- */
adminFeaturedRouter.patch("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Geçersiz id" });
    }

    const patch = normalizeFeaturedPayload(req.body);

    const updated = await Featured.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Bulunamadı" });

    const shaped = await shapeLegacy(updated);
    res.json({ success: true, item: shaped });
  } catch (e) {
    console.error("admin featured patch error:", e);
    res.status(500).json({ success: false, message: "Güncellenemedi" });
  }
});

/* ---------------- Admin: delete ---------------- */
adminFeaturedRouter.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Geçersiz id" });
    }
    await Featured.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (e) {
    console.error("admin featured delete error:", e);
    res.status(500).json({ success: false, message: "Silinemedi" });
  }
});

/* ---------------- Admin: bulk ops ---------------- */
adminFeaturedRouter.post("/bulk", async (req, res) => {
  try {
    const ids = (req.body.ids || [])
      .map((x) => String(x))
      .filter((x) => Types.ObjectId.isValid(x))
      .map((x) => new Types.ObjectId(x));

    if (!ids.length) return res.json({ success: true, updated: 0 });

    if (req.body.op === "active") {
      const value = Boolean(req.body.value);
      const r = await Featured.updateMany(
        { _id: { $in: ids } },
        { $set: { active: value } }
      );
      return res.json({ success: true, updated: r.modifiedCount || 0 });
    }

    if (req.body.op === "delete") {
      const r = await Featured.deleteMany({ _id: { $in: ids } });
      return res.json({ success: true, deleted: r.deletedCount || 0 });
    }

    res.status(400).json({ success: false, message: "Geçersiz işlem" });
  } catch (e) {
    console.error("admin featured bulk error:", e);
    res.status(500).json({ success: false, message: "Bulk işlem hatası" });
  }
});

/* ---------------- Admin: reorder (bulkWrite) ---------------- */
adminFeaturedRouter.post("/reorder", async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const ops = items
      .filter((it) => it?.id && Types.ObjectId.isValid(it.id))
      .map((it) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(it.id) },
          update: { $set: { order: Number(it.order || 0) } },
        },
      }));

    if (ops.length) await Featured.bulkWrite(ops, { ordered: false });

    res.json({ success: true });
  } catch (e) {
    console.error("admin featured reorder error:", e);
    res.status(500).json({ success: false, message: "Sıra kaydedilemedi" });
  }
});

/* ---------------- Public: list (aktif + zaman penceresi) ---------------- */
publicFeaturedRouter.get("/", async (req, res) => {
  try {
    const now = new Date();
    const filter = {
      active: true,
      $and: [
        { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
        { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
      ],
    };

    if (req.query.place) filter.place = String(req.query.place).trim();
    const typeParam = req.query.type || req.query.placement;
    if (typeParam) filter.type = String(typeParam).trim();

    const rows = await Featured.find(filter).sort({ order: 1, createdAt: -1 });
    const shaped = await Promise.all(rows.map(shapeLegacy));

    res.json({ success: true, items: shaped });
  } catch (e) {
    console.error("public featured list error:", e);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

/* ---------------- Public: CSV ---------------- */
publicFeaturedRouter.get("/export.csv", async (req, res) => {
  try {
    const rows = await Featured.find({}).sort({ order: 1, createdAt: -1 });
    const shaped = await Promise.all(rows.map(shapeLegacy));

    const keys = [
      "place","type","order","active","startAt","endAt",
      "businessId","businessSlug","businessName","title","subtitle","imageUrl","href","createdAt"
    ];

    const esc = (v) => `"${(v == null ? "" : String(v)).replace(/\"/g, '\"\"')}"`;
    const body = shaped.map(r => keys.map(k => esc(r[k])).join(";")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=featured.csv");
    res.send("\uFEFF" + keys.join(";") + "\n" + body + "\n");
  } catch (e) {
    console.error("public featured csv error:", e);
    res.status(500).json({ success: false });
  }
});

export { publicFeaturedRouter, adminFeaturedRouter };
