// backend/routes/businesses.js — Public + Legacy Admin (Ultra Pro, phones-safe, live-ready + smart search)
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import Business from "../models/Business.js";
import Blacklist from "../models/Blacklist.js";

const router = express.Router();

/* --------------------------------- utils --------------------------------- */
const clean = (v) => (typeof v === "string" ? v.trim() : "");
const isObjId = (s) => mongoose.isValidObjectId(String(s || ""));
const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
const escapeRegex = (s = "") =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// rakam kırpıcı
const digitsOnly = (s = "") => String(s).replace(/\D/g, "");

// "+905069990554", "0506 999 05 54", "5069990554" -> "5069990554" (son 10)
const normalizePhoneDigitsTR = (raw = "") => {
  const d = digitsOnly(raw);
  if (!d) return "";
  if (d.length >= 10) return d.slice(-10);
  return d;
};

// "5069990554" -> 5\D*0\D*6\D*9...
const buildLoosePhoneRegex = (digits = "") => {
  const d = digitsOnly(digits);
  if (!d) return null;
  if (d.length < 7) return null;
  const pattern = d
    .split("")
    .map((ch) => escapeRegex(ch))
    .join("\\D*");
  return new RegExp(pattern, "i");
};

// hostCore ("kulesapanca") -> k[-_\s]*u[-_\s]*l[-_\s]*e...
// böylece "Kule Sapanca", "kule-sapanca" gibi varyantları yakalar
const buildLooseNameRegexFromHostCore = (hostCore = "") => {
  const core = String(hostCore || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!core || core.length < 4) return null;
  const pattern = core
    .split("")
    .map((ch) => escapeRegex(ch))
    .join("[-_\\s]*");
  return new RegExp(pattern, "i");
};

// "kulesapanca.com", "www.kulesapanca.com", "https://www.kulesapanca.com/x" -> "kulesapanca.com"
const extractHost = (raw = "") => {
  let s = clean(raw);
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
};

// ReDoS + aşırı uzun query koruması
const safeRegex = (input, maxLen = 120) => {
  const s = clean(String(input || "")).slice(0, maxLen);
  if (!s) return null;
  return new RegExp(escapeRegex(s), "i");
};

// güvenli sayı
const toNum = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/* ------------ slug helpers (TR uyumlu) ------------ */
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

/* ------------ instagram helpers (admin.js ile uyumlu) ------------ */
const cleanUsername = (u = "") =>
  String(u || "").trim().replace(/^@+/, "").toLowerCase();

const normHandle = (h = "") => cleanUsername(h);

const normIgUrl = (u = "", handle = "") => {
  const s = clean(String(u || ""));
  if (!s && handle) return `https://instagram.com/${cleanUsername(handle)}`;
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;

  const m = s.match(/(instagram\.com|instagr\.am)\/([^/?#]+)/i);
  if (m && m[2]) return `https://instagram.com/${cleanUsername(m[2])}`;

  return `https://instagram.com/${cleanUsername(s)}`;
};

// phone (E.164, TR varsayılan)
function normPhone(raw) {
  const s = clean(raw);
  if (!s) return "";
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid()) return p.number; // +90...
  } catch {}
  return s.replace(/[^\d+]/g, "");
}

/* ------------ media helpers (R2 + uploads → absolute URLs) ------------ */
const MEDIA_BASE =
  process.env.R2_PUBLIC_BASE_URL ||
  process.env.R2_BUCKET_URL ||
  process.env.PUBLIC_BASE_URL ||
  process.env.SERVER_URL ||
  "";

function absUrl(u = "") {
  const raw = String(u || "").trim();
  if (!raw) return "";

  // tam URL veya data:
  if (/^data:/i.test(raw)) return raw;
  if (/^(?:https?:)?\/\//i.test(raw)) return raw;

  const base = (MEDIA_BASE || "").replace(/\/+$/, "");

  // kökten başlayan path
  if (raw.startsWith("/")) {
    if (!base) return raw;
    return `${base}${raw}`;
  }

  // uploads / images vb.
  if (/^(uploads?|images?|files?|public\/uploads)\b/i.test(raw)) {
    const normalized = raw.replace(/^\/+/, "");
    if (!base) return `/${normalized}`;
    return `${base}/${normalized}`;
  }

  // sadece dosya adı
  if (/\.(?:jpe?g|png|webp|avif|gif)$/i.test(raw) && !raw.includes("/")) {
    const normalized = `uploads/${raw}`;
    if (!base) return `/${normalized}`;
    return `${base}/${normalized}`;
  }

  // generic relative
  if (base) {
    try {
      return new URL(raw, base + "/").toString();
    } catch {
      /* ignore */
    }
  }

  return raw;
}

/**
 * Medya normalize: galleryAbs / cover / image / photo gibi alanları
 * tek bir diziye toplar ve ilk elemanı "photo" olarak döner.
 * Önce R2 / mutlak URL içeren alanlar, sonra eski gallery/filename'ler.
 */
function buildGalleryAndPhoto(b = {}) {
  const set = new Set();

  const push = (val) => {
    if (!val) return;

    if (Array.isArray(val)) {
      val.forEach(push);
      return;
    }

    if (typeof val === "string") {
      let s = val.trim();
      if (!s) return;

      // JSON array string ise
      if (
        (s.startsWith("[") && s.endsWith("]")) ||
        (s.startsWith('"') && s.endsWith('"'))
      ) {
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) {
            parsed.forEach(push);
            return;
          }
        } catch {
          /* ignore */
        }
      }

      // virgül / satır / ; ile ayrılmış ise
      if (/[,\n;]/.test(s)) {
        s
          .split(/[,\n;]/)
          .map((x) => x.trim())
          .filter(Boolean)
          .forEach(push);
        return;
      }

      set.add(absUrl(s));
      return;
    }

    if (typeof val === "object") {
      const keys = [
        "url",
        "src",
        "path",
        "image",
        "imageUrl",
        "href",
        "secure_url",
      ];
      for (const k of keys) {
        if (val[k]) push(val[k]);
      }
      if (Array.isArray(val.items)) val.items.forEach(push);
    }
  };

  // 1) Önce güvenilir / mutlak URL taşıyan alanlar (R2 & cover)
  push(b.galleryAbs);
  push(b.coverImage);
  push(b.coverUrl);
  push(b.cover);
  push(b.image);
  push(b.imageUrl);
  push(b.featuredImage);
  push(b.photo);

  // 2) Eski / relatif alanlar en sona (photo_1.jpg vs.)
  push(b.gallery);
  push(b.photos);
  push(b.images);
  push(b.media);
  push(b.pictures);

  let all = Array.from(set).filter(Boolean);

  const isDefault = (url) => {
    const s = String(url || "").toLowerCase();
    return (
      s.includes("/defaults/edogrula-default") ||
      s.includes("edogrula-default.webp") ||
      s.includes("/defaults/edogrula")
    );
  };

  const filtered = all.filter((u) => !isDefault(u));
  const gallery = filtered.length ? filtered : all;
  const photo = gallery[0] || null;

  return { gallery, photo };
}

function hydrateBusinessMediaPlain(b) {
  const media = buildGalleryAndPhoto(b || {});
  return {
    ...b,
    gallery: media.gallery,
    galleryAbs: media.gallery,
    photo: media.photo,
  };
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
    return {
      ok: true,
      type: "ig_url",
      value: `https://instagram.com/${username}`,
      username,
    };
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

  // otomatik fallback
  if (igUrlRe.test(q)) {
    const username = q.replace(igUrlRe, "$4");
    return {
      ok: true,
      type: "ig_url",
      value: `https://instagram.com/${username}`,
      username,
    };
  }
  if (igUserRe.test(q)) {
    const username = q.replace(/^@/, "");
    return { ok: true, type: "ig_username", value: username, username };
  }
  if (siteRe.test(q)) {
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    return { ok: true, type: "website", value: url };
  }
  if (phoneRe.test(q)) {
    const e164 = normPhone(q);
    return { ok: true, type: "phone", value: e164 };
  }

  return { ok: true, type: "text", value: q };
}

/* ----------------------------- tiny in-memory cache ----------------------------- */
const CACHE_TTL = Number(process.env.BUSINESS_SEARCH_TTL_MS || 15_000); // 15 sn
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

/* ---------------------------------- admin auth --------------------------------- */
function requireAdmin(req, res, next) {
  try {
    const needed = process.env.ADMIN_KEY;

    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (bearer) {
      try {
        const dec = jwt.verify(bearer, process.env.JWT_SECRET || "change_me");
        if (dec?.role === "admin" || dec?.isAdmin === true) return next();
      } catch {}
    }

    const sent = req.headers["x-admin-key"] || bearer;
    if (needed && sent && String(sent) === String(needed)) return next();

    return res.status(401).json({ success: false, message: "Yetkisiz" });
  } catch {
    return res
      .status(401)
      .json({ success: false, message: "Yetkilendirme hatası" });
  }
}

/* ------------------------------ PUBLIC: /filter ------------------------------ */
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

    const q = {};

    const rxAddr = safeRegex(address);
    if (rxAddr) q.address = { $regex: rxAddr };

    if (type) {
      const t = String(type).toLowerCase();
      if (t === "bungalov") {
        q.$or = [
          { type: { $regex: /bungalov/i } },
          { type: { $regex: /bungalow/i } },
        ];
      } else {
        const rxType = safeRegex(type);
        if (rxType) q.type = { $regex: rxType };
      }
    }

    if (String(onlyVerified).toLowerCase() === "true") q.verified = true;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(perPage, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const projection = [
      "name",
      "slug",
      "verified",
      "address",
      "phone",
      "website",
      "handle",
      "instagramUsername",
      "instagramUrl",
      "type",
      "summary",
      "description",
      "rating",
      "reviewsCount",
      "gallery",
      "galleryAbs",
      "photos",
      "images",
      "media",
      "cover",
      "coverImage",
      "coverUrl",
      "image",
      "imageUrl",
      "featuredImage",
      "photo",
      "google",
      "google_rate",
      "google_rating",
      "googleReviewsCount",
      "google_reviews",
      "google_reviews_count",
    ].join(" ");

    const [rows, total] = await Promise.all([
      Business.find(q).select(projection).skip(skip).limit(limitNum).lean(),
      Business.countDocuments(q),
    ]);

    const items = rows.map((b) => {
      const googleRating = toNum(
        b.googleRating ??
          b.google_rate ??
          b.google_rating ??
          b?.google?.rating ??
          0
      );

      const googleReviewsCount = toNum(
        b.googleReviewsCount ??
          b.google_reviews_count ??
          b.google_reviews ??
          b?.google?.reviewsCount ??
          b?.google?.user_ratings_total ??
          0
      );

      const media = buildGalleryAndPhoto(b);
      const gallery = media.gallery.slice(0, 5);
      const photo = media.photo;

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
        galleryAbs: gallery,
        photo,
        summary: b.summary || b.description || "",
        rating: toNum(b.rating),
        reviewsCount: toNum(b.reviewsCount),
        googleRating,
        googleReviewsCount,
      };
    });

    const score = (x) => (x.rating > 0 ? x.rating : x.googleRating || 0);
    const rev = (x) =>
      x.reviewsCount > 0 ? x.reviewsCount : x.googleReviewsCount || 0;

    items.sort((a, b) =>
      sort === "reviews" ? rev(b) - rev(a) : score(b) - score(a)
    );

    return res.json({ items, total, page: pageNum, perPage: limitNum });
  } catch (err) {
    console.error("filter_error", err);
    return res.status(500).json({
      error: "filter_failed",
      message: err.message,
    });
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

    const valueText = clean(cls.value || raw) || raw;
    const host = extractHost(valueText || raw);
    const hostCore = host ? host.split(".")[0] : "";

    // isim / slug / handle için kullanılacak base anahtar
    let nameKey = "";
    if ((cls.type === "ig_url" || cls.type === "ig_username") && cls.username) {
      nameKey = cls.username;
    } else if (cls.type === "website" && hostCore) {
      nameKey = hostCore;
    } else {
      nameKey = valueText;
    }
    nameKey = clean(nameKey);

    const rxName =
      nameKey && nameKey.length >= 2 ? safeRegex(nameKey, 80) : null;
    const rxHostCoreName =
      hostCore && hostCore.length >= 4
        ? buildLooseNameRegexFromHostCore(hostCore)
        : null;

    const slugKey = nameKey ? makeSlug(nameKey) : "";
    const rxSlugExact = slugKey
      ? new RegExp(`^${escapeRegex(slugKey)}$`, "i")
      : null;

    const handleKey = cls.username
      ? normHandle(cls.username)
      : nameKey
      ? normHandle(nameKey)
      : "";
    const rxHandleExact = handleKey
      ? new RegExp(`^${escapeRegex(handleKey)}$`, "i")
      : null;
    const rxIgUser = handleKey
      ? new RegExp(`^@?${escapeRegex(handleKey)}$`, "i")
      : null;

    const rxUrl = valueText ? safeRegex(valueText, 140) : null;
    const hostRegex = host
      ? new RegExp(escapeRegex(host).replace(/\./g, "\\."), "i")
      : null;

    const phoneDigits = normalizePhoneDigitsTR(valueText || raw);
    const phoneLooseRegex =
      phoneDigits && phoneDigits.length >= 7
        ? buildLoosePhoneRegex(phoneDigits)
        : null;

    console.log("[BUSINESSES_SEARCH] incoming", {
      raw,
      hintedType,
      cls,
      valueText,
      host,
      hostCore,
      nameKey,
      phoneDigits,
    });

    const cache_key = cacheKey(valueText || raw, cls.type, limit);
    const cached = cacheGet(cache_key);
    if (cached) return res.json(cached);

    /* -------- VERIFIED (Business) filtreleri -------- */
    const orVerified = [];

    if (rxName) {
      orVerified.push({ name: rxName });
      orVerified.push({ address: rxName });
      orVerified.push({ summary: rxName });
      orVerified.push({ description: rxName });
    }

    if (rxHostCoreName) {
      orVerified.push({ name: rxHostCoreName });
      orVerified.push({ slug: rxHostCoreName });
    }

    if (rxSlugExact) {
      orVerified.push({ slug: rxSlugExact });
    }

    if (rxHandleExact) {
      orVerified.push({ handle: rxHandleExact });
    }
    if (rxIgUser) {
      orVerified.push({ instagramUsername: rxIgUser });
    }

    if (rxUrl) {
      orVerified.push({ instagramUrl: rxUrl });
      orVerified.push({ website: rxUrl });
    }
    if (hostRegex) {
      orVerified.push({ website: hostRegex });
    }

    if (phoneLooseRegex) {
      orVerified.push({ phone: phoneLooseRegex });
      orVerified.push({ phones: phoneLooseRegex }); // olası array field
    }

    const verifiedFilter = orVerified.length ? { $or: orVerified } : null;

    /* -------- BLACKLIST filtreleri -------- */
    const orBlack = [];

    if (rxName) {
      orBlack.push({ name: rxName });
      orBlack.push({ address: rxName });
    }
    if (rxHostCoreName) {
      orBlack.push({ name: rxHostCoreName });
    }
    if (rxIgUser) {
      orBlack.push({ instagramUsername: rxIgUser });
    }

    if (rxUrl) {
      orBlack.push({ instagramUrl: rxUrl });
      orBlack.push({ website: rxUrl });
    }
    if (hostRegex) {
      orBlack.push({ website: hostRegex });
    }

    if (phoneLooseRegex) {
      orBlack.push({ phone: phoneLooseRegex });
      orBlack.push({ phones: phoneLooseRegex });
    }

    const blackFilter = orBlack.length ? { $or: orBlack } : null;

    const [black, verifiedRaw] = await Promise.all([
      blackFilter ? Blacklist.findOne(blackFilter).lean() : null,
      verifiedFilter
        ? Business.find(verifiedFilter).limit(limit).lean()
        : [],
    ]);

    let payload;

    // kara liste her zaman öncelikli
    if (black) {
      payload = {
        success: true,
        status: "blacklist",
        business: black,
      };
      console.log("[BUSINESSES_SEARCH] result BLACKLIST", {
        id: black._id?.toString?.(),
      });
    } else if (verifiedRaw && verifiedRaw.length) {
      const verified = verifiedRaw.map(hydrateBusinessMediaPlain);
      payload = {
        success: true,
        status: "verified",
        business: verified[0],
        businesses: verified,
      };
      console.log("[BUSINESSES_SEARCH] result VERIFIED", {
        count: verified.length,
        firstId: verified[0]?._id?.toString?.(),
      });
    } else {
      payload = {
        success: true,
        status: "not_found",
        businesses: [],
      };
      console.log("[BUSINESSES_SEARCH] result NOT_FOUND");
    }

    cacheSet(cache_key, payload);
    return res.json(payload);
  } catch (err) {
    console.error("[BUSINESSES_SEARCH] ERROR", err);
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
    const slug = makeSlug(req.params.slug || "");
    if (!slug) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Geçersiz slug",
      });
    }

    const businessRaw = await Business.findOne({ slug }).lean();
    if (!businessRaw)
      return res.status(404).json({ success: true, status: "not_found" });

    const business = hydrateBusinessMediaPlain(businessRaw);

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

/* ------------------------------ PUBLIC: by-handle ------------------------------ */
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

    const businessRaw = await Business.findOne({
      $or: [
        { handle: rxHandleExact },
        { instagramUsername: new RegExp(`^@?${escapeRegex(handle)}$`, "i") },
      ],
    }).lean();

    if (!businessRaw)
      return res.status(404).json({ success: true, status: "not_found" });

    const business = hydrateBusinessMediaPlain(businessRaw);

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
    const id = String(req.params.id || "").trim();

    if (isObjId(id)) {
      const b = await Business.findById(id).lean();
      if (b) {
        const business = hydrateBusinessMediaPlain(b);
        return res.json({
          success: true,
          status: "verified",
          business,
        });
      }
    }

    const slug = makeSlug(id);
    const handle = normHandle(id);
    const rxHandleExact = handle
      ? new RegExp(`^${escapeRegex(handle)}$`, "i")
      : null;

    const b2raw = await Business.findOne({
      $or: [
        slug ? { slug } : null,
        rxHandleExact ? { handle: rxHandleExact } : null,
        rxHandleExact
          ? { instagramUsername: new RegExp(`^@?${escapeRegex(handle)}$`, "i") }
          : null,
      ].filter(Boolean),
    }).lean();

    if (b2raw) {
      const business = hydrateBusinessMediaPlain(b2raw);
      return res.json({
        success: true,
        status: "verified",
        business,
      });
    }

    if (isObjId(id)) {
      const bl = await Blacklist.findById(id).lean();
      if (bl) {
        return res.json({
          success: true,
          status: "blacklist",
          business: bl,
        });
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

/* -------------------------------- ADMIN: list (legacy) -------------------------------- */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(+req.query.limit || 50, 200));
    const page = Math.max(1, +req.query.page || 1);
    const skip = (page - 1) * limit;

    const sort = {};
    const sortParam = String(req.query.sort || "-createdAt");
    for (const part of sortParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      sort[part.startsWith("-") ? part.slice(1) : part] = part.startsWith("-")
        ? -1
        : 1;
    }

    let fields;
    if (req.query.fields) {
      fields = String(req.query.fields)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
    }

    const rx = safeRegex(req.query.q);
    const filter = rx
      ? {
          $or: [
            { name: rx },
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

/* ------------------------------- ADMIN: create (legacy) ------------------------------- */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const body = { ...(req.body || {}) };

    if (!body.slug && body.name) body.slug = makeSlug(body.name);
    if (body.slug) body.slug = makeSlug(body.slug);

    if (body.instagramUsername)
      body.instagramUsername = cleanUsername(body.instagramUsername);
    if (body.handle || body.instagramUsername)
      body.handle = cleanUsername(body.handle || body.instagramUsername);
    if (body.instagramUrl || body.handle || body.instagramUsername)
      body.instagramUrl = normIgUrl(
        body.instagramUrl || body.handle || body.instagramUsername
      );

    if (body.phone) body.phone = normPhone(body.phone);

    if (body.gallery) body.gallery = toArray(body.gallery).filter(Boolean);

    const created = await new Business(body).save();
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

/* ------------------------------- ADMIN: update (legacy, phones-safe) ------------------------------- */
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const doc = await Business.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const body = { ...(req.body || {}) };

    if (body.slug) body.slug = makeSlug(body.slug);
    else if (!doc.slug && body.name) body.slug = makeSlug(body.name);

    if (body.instagramUsername)
      body.instagramUsername = cleanUsername(body.instagramUsername);
    if (body.handle || body.instagramUsername)
      body.handle = cleanUsername(body.handle || body.instagramUsername);
    if (body.instagramUrl || body.handle || body.instagramUsername)
      body.instagramUrl = normIgUrl(
        body.instagramUrl || body.handle || body.instagramUsername
      );

    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      body.phone = normPhone(body.phone);
    }
    delete body.phones;

    if (Object.prototype.hasOwnProperty.call(body, "gallery")) {
      body.gallery = toArray(body.gallery).filter(Boolean);
    }

    const DENY_KEYS = new Set(["_id", "__v", "createdAt", "updatedAt"]);
    for (const [k, v] of Object.entries(body)) {
      if (DENY_KEYS.has(k)) continue;
      doc[k] = v;
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
    res.status(500).json({
      success: false,
      message: "Update failed",
      error: err.message,
    });
  }
});

/* ------------------------------- ADMIN: delete (legacy) ------------------------------- */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
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
