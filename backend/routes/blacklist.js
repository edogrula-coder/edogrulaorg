// backend/routes/businesses.js — ULTRA PRO / LIVE READY (public search/filter + admin CRUD)
import express from "express";
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import Business from "../models/Business.js";
import Blacklist from "../models/Blacklist.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* --------------------------------- utils --------------------------------- */
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const isObjId = (v) => mongoose.isValidObjectId(String(v || ""));
const toArray = (v) =>
  (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

const escapeRegex = (s = "") =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const safeRegex = (input, maxLen = 80) => {
  const s = clean(String(input || "")).slice(0, maxLen);
  if (!s) return null;
  return new RegExp(escapeRegex(s), "i");
};

// güvenli sayı (virgüllü stringleri de çevirir)
const toNum = (v, def = 0) => {
  if (v == null) return def;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : def;
};

/* ------------ slug (TR fix + ascii) ------------ */
function slugifyTR(s = "") {
  const map = {
    ş: "s", Ş: "s",
    ı: "i", İ: "i",
    ğ: "g", Ğ: "g",
    ü: "u", Ü: "u",
    ö: "o", Ö: "o",
    ç: "c", Ç: "c",
  };
  return String(s)
    .replace(/[ŞşİıĞğÜüÖöÇç]/g, (ch) => map[ch] || ch)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ------------ instagram normalize ------------ */
const normHandle = (h = "") =>
  clean(h).replace(/^@+/, "").toLowerCase();

const normIgUrl = (u = "", handle = "") => {
  const s = clean(u);
  if (!s && handle) return `https://instagram.com/${normHandle(handle)}`;
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;

  const m = s.match(/(instagram\.com|instagr\.am)\/([^/?#]+)/i);
  if (m && m[2]) return `https://instagram.com/${normHandle(m[2])}`;

  return `https://instagram.com/${normHandle(s)}`;
};

/* ------------ phone normalize (E.164 TR default) ------------ */
function normPhone(raw) {
  const s = clean(raw);
  if (!s) return "";
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid()) return p.number; // +90...
  } catch {}
  return s.replace(/[^\d+]/g, "");
}

/* -------------------------- classify incoming query ----------------------- */
function classifyQuery(qRaw = "", hintedType = "") {
  const q = clean(qRaw);
  if (!q) return { ok: false, reason: "empty" };

  const igUrlRe =
    /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/([A-Za-z0-9._]{1,30})(\/)?(\?.*)?$/i;
  const igUserRe = /^@?([A-Za-z0-9._]{1,30})$/;
  const phoneRe = /^\+?[0-9 ()\-\.]{10,20}$/;
  const siteRe =
    /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([:/?#].*)?$/i;

  const type = String(hintedType || "").toLowerCase();

  if (type === "ig_url" && igUrlRe.test(q)) {
    const username = q.replace(igUrlRe, "$4");
    return { ok: true, type: "ig_url", value: `https://instagram.com/${username}`, username };
  }
  if (type === "ig_username" && igUserRe.test(q)) {
    const username = q.replace(/^@/, "");
    return { ok: true, type: "ig_username", value: username, username };
  }
  if (type === "phone" && phoneRe.test(q)) {
    const e164 = normPhone(q);
    return { ok: true, type: "phone", value: e164 };
  }
  if (type === "website" && siteRe.test(q)) {
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    return { ok: true, type: "website", value: url };
  }

  // Otomatik
  if (igUrlRe.test(q)) {
    const username = q.replace(igUrlRe, "$4");
    return { ok: true, type: "ig_url", value: `https://instagram.com/${username}`, username };
  }
  if (siteRe.test(q)) {
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    return { ok: true, type: "website", value: url };
  }
  if (phoneRe.test(q)) {
    const e164 = normPhone(q);
    return { ok: true, type: "phone", value: e164 };
  }
  if (igUserRe.test(q)) {
    const username = q.replace(/^@/, "");
    return { ok: true, type: "ig_username", value: username, username };
  }

  return { ok: true, type: "text", value: q };
}

/* ----------------------------- tiny in-memory cache ----------------------------- */
const CACHE_TTL = Number(process.env.BUSINESS_SEARCH_TTL_MS || 15_000);
const _cache = new Map();
const cacheKey = (q, type, limit) => `search|${type}|${q}|${limit}`;

function cacheGet(key) {
  const rec = _cache.get(key);
  if (!rec) return null;
  if (Date.now() - rec.ts > CACHE_TTL) {
    _cache.delete(key);
    return null;
  }
  return rec.data;
}
function cacheSet(key, data) {
  _cache.set(key, { ts: Date.now(), data });
}

/* ------------------------------ PUBLIC: /filter ------------------------------ */
/**
 * GET /api/businesses/filter
 * Query:
 *  - address=Sapanca
 *  - type=bungalov (bungalov|bungalow)
 *  - onlyVerified=true|false
 *  - sort=rating|reviews
 *  - page, perPage
 */
router.get("/filter", async (req, res) => {
  try {
    const {
      address = "",
      type = "",
      onlyVerified = "false",
      sort = "rating",
      page = "1",
      perPage = "20",
    } = req.query;

    const filter = {};

    const rxAddr = safeRegex(address);
    if (rxAddr) filter.address = { $regex: rxAddr };

    const t = clean(type).toLowerCase();
    if (t) {
      if (t === "bungalov") {
        filter.$or = [
          { type: { $regex: /bungalov/i } },
          { type: { $regex: /bungalow/i } },
        ];
      } else {
        filter.type = { $regex: safeRegex(t) };
      }
    }

    if (String(onlyVerified).toLowerCase() === "true") {
      filter.verified = true;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(perPage, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const projection = {
      name: 1, slug: 1, verified: 1, address: 1,
      phone: 1, website: 1, handle: 1,
      instagramUsername: 1, instagramUrl: 1,
      type: 1, summary: 1, description: 1, gallery: 1,
      rating: 1, reviewsCount: 1,
      google: 1, googleRating: 1, googleReviewsCount: 1,
    };

    const [rows, total] = await Promise.all([
      Business.find(filter).select(projection).skip(skip).limit(limitNum).lean(),
      Business.countDocuments(filter),
    ]);

    const items = rows.map((b) => {
      const g = b.google || {};
      const googleRating = toNum(b.googleRating ?? g.rating ?? g.ratingValue);
      const googleReviewsCount = toNum(
        b.googleReviewsCount ??
          g.user_ratings_total ??
          g.reviewsCount ??
          g.reviewCount
      );

      const gallery = Array.isArray(b.gallery) ? b.gallery.slice(0, 5) : [];
      const photo = gallery[0] || null;

      return {
        _id: b._id,
        slug: b.slug || String(b._id),
        name: b.name || "İsimsiz İşletme",
        verified: !!b.verified,
        address: b.address || "",
        phone: b.phone || "",
        website: b.website || "",
        instagramUsername: b.instagramUsername || b.handle || "",
        instagramUrl: b.instagramUrl || "",
        type: b.type || "Bungalov",
        gallery,
        photo,
        summary: clean(b.summary) || clean(b.description) || "",
        rating: toNum(b.rating),
        reviewsCount: toNum(b.reviewsCount),
        googleRating,
        googleReviewsCount,
      };
    });

    const score = (x) =>
      x.rating > 0 ? x.rating : x.googleRating > 0 ? x.googleRating : 0;
    const rev = (x) =>
      x.reviewsCount > 0
        ? x.reviewsCount
        : x.googleReviewsCount > 0
        ? x.googleReviewsCount
        : 0;

    items.sort((a, b) =>
      sort === "reviews" ? rev(b) - rev(a) : score(b) - score(a)
    );

    return res.json({ items, total, page: pageNum, perPage: limitNum });
  } catch (err) {
    console.error("filter_error", err);
    return res.status(500).json({ success: false, error: "filter_failed" });
  }
});

/* ------------------------------ PUBLIC: /search ------------------------------ */
router.get("/search", async (req, res) => {
  try {
    const raw = clean(req.query.q || "");
    const hintedType = clean(req.query.type || "");
    const limit = Math.max(1, Math.min(+req.query.limit || 10, 25));

    const cls = classifyQuery(raw, hintedType);
    if (!cls.ok) {
      return res.json({
        success: true,
        status: "not_found",
        reason: cls.reason,
        businesses: [],
      });
    }

    const key = cacheKey(cls.value, cls.type, limit);
    const cached = cacheGet(key);
    if (cached) return res.json(cached);

    const qText = clean(cls.value || "");
    const qSlug = slugifyTR(qText);
    const qHandle = normHandle(cls.username || qText);

    const rxAny = safeRegex(qText, 120);
    const rxSlugExact = qSlug ? new RegExp(`^${escapeRegex(qSlug)}$`, "i") : null;
    const rxHandleExact = qHandle ? new RegExp(`^${escapeRegex(qHandle)}$`, "i") : null;
    const rxIgUser = qHandle ? new RegExp(`^@?${escapeRegex(qHandle)}$`, "i") : null;

    const phone = cls.type === "phone" ? normPhone(qText) : "";

    const or = [
      rxAny ? { name: rxAny } : null,
      rxSlugExact ? { slug: rxSlugExact } : null,
      rxHandleExact ? { handle: rxHandleExact } : null,
      rxIgUser ? { instagramUsername: rxIgUser } : null,
    ].filter(Boolean);

    if (cls.type === "ig_url" || cls.type === "website" || cls.type === "text") {
      if (rxAny) or.push({ instagramUrl: rxAny }, { website: rxAny });
    }

    if (cls.type === "phone") {
      if (phone) or.push({ phone: new RegExp(escapeRegex(phone), "i") });
      const digits = phone.replace(/\D/g, "");
      if (digits) or.push({ phone: new RegExp(digits.slice(-10)) });
    }

    const verified = await Business.find({ $or: or }).limit(limit).lean();

    if (verified.length) {
      const payload = {
        success: true,
        status: "verified",
        business: verified[0],
        businesses: verified,
      };
      cacheSet(key, payload);
      return res.json(payload);
    }

    const blOr = [
      rxAny ? { name: rxAny } : null,
      rxIgUser ? { instagramUsername: rxIgUser } : null,
      rxAny ? { instagramUrl: rxAny } : null,
      phone ? { phone: new RegExp(escapeRegex(phone), "i") } : null,
    ].filter(Boolean);

    const black = blOr.length ? await Blacklist.findOne({ $or: blOr }).lean() : null;
    if (black) {
      const payload = { success: true, status: "blacklist", business: black };
      cacheSet(key, payload);
      return res.json(payload);
    }

    const payload = { success: true, status: "not_found", businesses: [] };
    cacheSet(key, payload);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Search error",
      error: err.message,
    });
  }
});

/* ------------------------------ PUBLIC: by-slug ------------------------------ */
router.get("/by-slug/:slug", async (req, res) => {
  try {
    const slug = slugifyTR(req.params.slug || "");
    if (!slug) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Geçersiz slug",
      });
    }

    const business = await Business.findOne({ slug }).lean();
    if (!business) {
      return res.status(404).json({ success: true, status: "not_found" });
    }

    return res.json({ success: true, status: "verified", business });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Detail error",
      error: err.message,
    });
  }
});

/* ------------------------------ PUBLIC: handle ------------------------------ */
router.get("/handle/:handle", async (req, res) => {
  try {
    const handle = normHandle(req.params.handle || "");
    if (!handle) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Geçersiz handle",
      });
    }

    const rxHandleExact = new RegExp(`^${escapeRegex(handle)}$`, "i");

    const business = await Business.findOne({
      $or: [
        { handle: rxHandleExact },
        { instagramUsername: new RegExp(`^@?${escapeRegex(handle)}$`, "i") },
      ],
    }).lean();

    if (!business) {
      return res.status(404).json({ success: true, status: "not_found" });
    }

    return res.json({ success: true, status: "verified", business });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Detail error",
      error: err.message,
    });
  }
});

/* ------------------------------ PUBLIC: get by id/slug/handle ------------------------------ */
router.get("/:id", async (req, res) => {
  try {
    const idOrKey = clean(req.params.id || "");

    if (isObjId(idOrKey)) {
      const b = await Business.findById(idOrKey).lean();
      if (b) {
        return res.json({ success: true, status: "verified", business: b });
      }
    }

    const slug = slugifyTR(idOrKey);
    const handle = normHandle(idOrKey);
    const rxHandleExact = handle ? new RegExp(`^${escapeRegex(handle)}$`, "i") : null;

    const b2 = await Business.findOne({
      $or: [
        slug ? { slug } : null,
        rxHandleExact ? { handle: rxHandleExact } : null,
        rxHandleExact
          ? { instagramUsername: new RegExp(`^@?${escapeRegex(handle)}$`, "i") }
          : null,
      ].filter(Boolean),
    }).lean();

    if (b2) {
      return res.json({ success: true, status: "verified", business: b2 });
    }

    if (isObjId(idOrKey)) {
      const bl = await Blacklist.findById(idOrKey).lean();
      if (bl) {
        return res.json({ success: true, status: "blacklist", business: bl });
      }
    }

    return res.status(404).json({
      success: true,
      status: "not_found",
      message: "İşletme bulunamadı",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Detail error",
      error: err.message,
    });
  }
});

/* -------------------------------- ADMIN CRUD -------------------------------- */
const protectAdmin = [authenticate, requireAdmin];

/** allow-list: admin tarafı rastgele alan yazamasın */
const ALLOWED_ADMIN_KEYS = new Set([
  "name","title","slug","address","desc","summary",
  "type","kind","city","district","il","ilce",
  "verified","status","featured","score","tags","source",
  "website","email","phone","phones",
  "instagram","instagramUrl","instagramUsername","handle",
  "coverImage","coverImageUrl","images","gallery","documents","docs","files",
  "google","googleRating","googleReviewsCount",
]);

function pickAdminPayload(body = {}) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (ALLOWED_ADMIN_KEYS.has(k)) out[k] = v;
  }

  // name/title -> slug fallback
  const baseName = clean(out.name || out.title);
  if (!out.slug && baseName) out.slug = slugifyTR(baseName);

  // instagram normalize
  const igUser = normHandle(out.instagramUsername || out.handle || out.instagram);
  if (igUser) {
    out.instagramUsername = `@${igUser}`;
    out.handle = igUser;
    if (!out.instagramUrl) out.instagramUrl = normIgUrl("", igUser);
  } else {
    if (out.instagramUrl) out.instagramUrl = normIgUrl(out.instagramUrl);
    if (out.handle) out.handle = normHandle(out.handle);
    if (out.instagramUsername) out.instagramUsername = `@${normHandle(out.instagramUsername)}`;
  }

  // phones normalize
  if (out.phone) out.phone = normPhone(out.phone);
  if (out.phones) out.phones = toArray(out.phones).map(normPhone).filter(Boolean);

  // media caps (live safety)
  if (out.gallery) out.gallery = toArray(out.gallery).slice(0, 12);
  if (out.images) out.images = toArray(out.images).slice(0, 12);

  return out;
}

/* Admin list */
router.get("/", ...protectAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(+req.query.limit || 50, 200));
    const page = Math.max(1, +req.query.page || 1);
    const skip = (page - 1) * limit;

    const sort = {};
    const sortParam = String(req.query.sort || "-createdAt");
    for (const part of sortParam.split(",").map((s) => s.trim()).filter(Boolean)) {
      sort[part.startsWith("-") ? part.slice(1) : part] = part.startsWith("-") ? -1 : 1;
    }

    const fields = req.query.fields
      ? String(req.query.fields).split(",").map((s) => s.trim()).filter(Boolean).join(" ")
      : null;

    const rx = safeRegex(req.query.q);
    const filter = rx
      ? {
          $or: [
            { name: rx },
            { title: rx },
            { slug: rx },
            { handle: rx },
            { instagramUsername: rx },
            { instagramUrl: rx },
            { phone: rx },
            { email: rx },
            { website: rx },
            { address: rx },
          ],
        }
      : {};

    const query = Business.find(filter).sort(sort).skip(skip).limit(limit).lean();
    if (fields) query.select(fields);

    const [items, total] = await Promise.all([
      query,
      Business.countDocuments(filter),
    ]);

    res.json({
      success: true,
      businesses: items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "List failed",
      error: err.message,
    });
  }
});

/* Admin create */
router.post("/", ...protectAdmin, async (req, res) => {
  try {
    const payload = pickAdminPayload(req.body);

    if (!payload.name && !payload.title) {
      return res.status(400).json({ success: false, message: "name/title gerekli" });
    }

    const created = await Business.create(payload);
    res.status(201).json({ success: true, business: created.toObject() });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. slug/instagramUsername/phone)",
      });
    }
    res.status(500).json({
      success: false,
      message: "Create failed",
      error: err.message,
    });
  }
});

/* Admin update */
router.put("/:id", ...protectAdmin, async (req, res) => {
  try {
    if (!isObjId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Geçersiz id" });
    }

    const payload = pickAdminPayload(req.body);

    const updated = await Business.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    res.json({ success: true, business: updated });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. slug/instagramUsername/phone)",
      });
    }
    res.status(500).json({
      success: false,
      message: "Update failed",
      error: err.message,
    });
  }
});

/* Admin delete */
router.delete("/:id", ...protectAdmin, async (req, res) => {
  try {
    if (!isObjId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Geçersiz id" });
    }

    const del = await Business.findByIdAndDelete(req.params.id).lean();
    if (!del) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Delete failed",
      error: err.message,
    });
  }
});

export default router;
