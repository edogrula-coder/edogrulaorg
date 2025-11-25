// backend/routes/content.js — Articles + Pages (Ultra Pro, live-ready, legacy-safe)
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Article from "../models/Article.js";
import Page from "../models/Page.js";

const router = express.Router();

/* ----------------------------- utils (legacy-safe) ----------------------------- */
const clean = (v) => (typeof v === "string" ? v.trim() : "");
const escapeRegex = (s = "") =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ReDoS + aşırı uzun query koruması
const safeRegex = (input, maxLen = 120) => {
  const s = clean(String(input || "")).slice(0, maxLen);
  if (!s) return null;
  return new RegExp(escapeRegex(s), "i");
};

const isObjId = (s) => mongoose.isValidObjectId(String(s || ""));

// TR uyumlu slug
function slugifyTR(s = "") {
  const map = {
    ş: "s", Ş: "s",
    ı: "i", İ: "i",
    ğ: "g", Ğ: "g",
    ü: "u", Ü: "u",
    ö: "o", Ö: "o",
    ç: "c", Ç: "c",
  };
  return String(s || "")
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
const makeSlug = (str = "") => slugifyTR(str) || "";

/* ------------------------------ admin guard (same as businesses.js) ------------------------------ */
function requireAdmin(req, res, next) {
  try {
    const needed = process.env.ADMIN_KEY;
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    // JWT role admin
    if (bearer) {
      try {
        const dec = jwt.verify(bearer, process.env.JWT_SECRET || "change_me");
        if (dec?.role === "admin" || dec?.isAdmin === true) return next();
      } catch {}
    }

    // ADMIN_KEY
    const sent = req.headers["x-admin-key"] || bearer;
    if (needed && sent && String(sent) === String(needed)) return next();

    return res.status(401).json({ success: false, message: "Yetkisiz" });
  } catch {
    return res.status(401).json({ success: false, message: "Yetkilendirme hatası" });
  }
}

/* ===================== PUBLIC ===================== */

/**
 * Featured articles
 * GET /api/content/articles/featured?place=...&limit=3
 */
router.get("/articles/featured", async (req, res) => {
  try {
    const { place = "", limit = "3" } = req.query;

    const q = { status: "published", pinned: true };

    const rxPlace = safeRegex(place);
    if (rxPlace) q.place = { $regex: rxPlace };

    const lim = Math.min(12, Math.max(1, parseInt(limit, 10) || 3));

    const items = await Article.find(q)
      .sort({ order: 1, datePublished: -1, _id: -1 })
      .limit(lim)
      .lean();

    res.json({
      success: true,
      items: items.map((a) => ({
        id: a._id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        image: a.coverImage || "",
        to: `/blog/${a.slug}`,
        datePublished: a.datePublished || a.createdAt,
        dateModified: a.dateModified || a.updatedAt,
      })),
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: "featured_failed",
      error: e.message,
    });
  }
});

/**
 * Public article fetch
 * GET /api/content/article/by-slug/:slug
 */
router.get("/article/by-slug/:slug", async (req, res) => {
  try {
    const slug = makeSlug(req.params.slug || "");
    if (!slug) {
      return res.status(400).json({ success: false, message: "invalid_slug" });
    }

    const art = await Article.findOne({ slug, status: "published" }).lean();
    if (!art) return res.status(404).json({ success: false, message: "not_found" });

    res.json({ success: true, article: art });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: "article_fetch_failed",
      error: e.message,
    });
  }
});

/**
 * Public page fetch (KVKK vb.)
 * GET /api/content/page/by-slug/:slug
 */
router.get("/page/by-slug/:slug", async (req, res) => {
  try {
    const slug = makeSlug(req.params.slug || "");
    if (!slug) {
      return res.status(400).json({ success: false, message: "invalid_slug" });
    }

    const page = await Page.findOne({ slug, status: "published" }).lean();
    if (!page) return res.status(404).json({ success: false, message: "not_found" });

    res.json({ success: true, page });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: "page_fetch_failed",
      error: e.message,
    });
  }
});

/* ===================== ADMIN (CRUD) ===================== */

/* --------------------- Articles --------------------- */
/**
 * GET /api/content/articles?q=&place=&status=&page=&limit=&sort=
 * sort default: -updatedAt
 */
router.get("/articles", requireAdmin, async (req, res) => {
  try {
    const { q = "", place = "", status = "", page = "1", limit = "50", sort = "-updatedAt" } = req.query;

    const filter = {};
    const rxQ = safeRegex(q);
    if (rxQ) {
      filter.$or = [{ title: rxQ }, { slug: rxQ }];
    }

    const rxPlace = safeRegex(place);
    if (rxPlace) filter.place = rxPlace;

    if (status) filter.status = String(status);

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    // sort=-createdAt,title → {createdAt:-1, title:1}
    const sortObj = {};
    for (const part of String(sort || "-updatedAt")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      sortObj[part.startsWith("-") ? part.slice(1) : part] = part.startsWith("-") ? -1 : 1;
    }

    const [items, total] = await Promise.all([
      Article.find(filter).sort(sortObj).skip((p - 1) * l).limit(l).lean(),
      Article.countDocuments(filter),
    ]);

    res.json({ success: true, items, total, page: p, limit: l });
  } catch (e) {
    res.status(500).json({ success: false, message: "articles_list_failed", error: e.message });
  }
});

router.post("/articles", requireAdmin, async (req, res) => {
  try {
    const body = { ...(req.body || {}) };

    if (!body.slug && body.title) body.slug = makeSlug(body.title);
    if (body.slug) body.slug = makeSlug(body.slug);

    const created = await new Article(body).save();
    res.status(201).json({ success: true, article: created.toObject() });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. slug)",
      });
    }
    res.status(500).json({ success: false, message: "article_create_failed", error: e.message });
  }
});

router.put("/articles/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!isObjId(id)) {
      return res.status(400).json({ success: false, message: "invalid_id" });
    }

    const body = { ...(req.body || {}) };

    if (!body.slug && body.title) body.slug = makeSlug(body.title);
    if (body.slug) body.slug = makeSlug(body.slug);

    body.dateModified = new Date();

    const DENY_KEYS = new Set(["_id", "__v", "createdAt", "updatedAt"]);
    DENY_KEYS.forEach((k) => delete body[k]);

    const up = await Article.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    }).lean();

    if (!up) return res.status(404).json({ success: false, message: "not_found" });

    res.json({ success: true, article: up });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. slug)",
      });
    }
    res.status(500).json({ success: false, message: "article_update_failed", error: e.message });
  }
});

router.delete("/articles/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!isObjId(id)) {
      return res.status(400).json({ success: false, message: "invalid_id" });
    }

    const del = await Article.findByIdAndDelete(id).lean();
    if (!del) return res.status(404).json({ success: false, message: "not_found" });

    res.json({ success: true, message: "deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: "article_delete_failed", error: e.message });
  }
});

/* --------------------- Pages --------------------- */
/**
 * GET /api/content/pages?q=&page=&limit=&sort=
 * sort default: -updatedAt
 */
router.get("/pages", requireAdmin, async (req, res) => {
  try {
    const { q = "", page = "1", limit = "50", sort = "-updatedAt" } = req.query;

    const rxQ = safeRegex(q);
    const filter = rxQ ? { $or: [{ title: rxQ }, { slug: rxQ }] } : {};

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const sortObj = {};
    for (const part of String(sort || "-updatedAt")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      sortObj[part.startsWith("-") ? part.slice(1) : part] = part.startsWith("-") ? -1 : 1;
    }

    const [items, total] = await Promise.all([
      Page.find(filter).sort(sortObj).skip((p - 1) * l).limit(l).lean(),
      Page.countDocuments(filter),
    ]);

    res.json({ success: true, items, total, page: p, limit: l });
  } catch (e) {
    res.status(500).json({ success: false, message: "pages_list_failed", error: e.message });
  }
});

router.post("/pages", requireAdmin, async (req, res) => {
  try {
    const body = { ...(req.body || {}) };

    if (!body.slug && body.title) body.slug = makeSlug(body.title);
    if (body.slug) body.slug = makeSlug(body.slug);

    const created = await new Page(body).save();
    res.status(201).json({ success: true, page: created.toObject() });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. slug)",
      });
    }
    res.status(500).json({ success: false, message: "page_create_failed", error: e.message });
  }
});

router.put("/pages/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!isObjId(id)) {
      return res.status(400).json({ success: false, message: "invalid_id" });
    }

    const body = { ...(req.body || {}) };

    if (!body.slug && body.title) body.slug = makeSlug(body.title);
    if (body.slug) body.slug = makeSlug(body.slug);

    const DENY_KEYS = new Set(["_id", "__v", "createdAt", "updatedAt"]);
    DENY_KEYS.forEach((k) => delete body[k]);

    const up = await Page.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    }).lean();

    if (!up) return res.status(404).json({ success: false, message: "not_found" });

    res.json({ success: true, page: up });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (örn. slug)",
      });
    }
    res.status(500).json({ success: false, message: "page_update_failed", error: e.message });
  }
});

router.delete("/pages/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!isObjId(id)) {
      return res.status(400).json({ success: false, message: "invalid_id" });
    }

    const del = await Page.findByIdAndDelete(id).lean();
    if (!del) return res.status(404).json({ success: false, message: "not_found" });

    res.json({ success: true, message: "deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: "page_delete_failed", error: e.message });
  }
});

export default router;
