// backend/routes/explore.js — Pro sürüm (slug destekli + cache + facets) [LIVE READY]
import express from "express";
import Business from "../models/Business.js";

const router = express.Router();

/* -----------------------------------------------------------------------------
 * Config / Helpers
 * -------------------------------------------------------------------------- */
const EXPLR_TTL_MS = Number(process.env.EXPLORE_TTL_MS || 15_000); // 15s
const PLACEHOLDER_IMAGE_URL =
  (process.env.PLACEHOLDER_IMAGE_URL || "").trim() ||
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=800&auto=format&fit=crop";

/** Arama sırasında gürültü yaratan kelimeler */
const STOP_WORDS = new Set([
  // tr
  "ev","evleri","otel","otelleri","konaklama","bungalov","bungalovlar",
  "fiyat","fiyatları","fiyatlari","en","icin","için","ve","veya",
  "yakın","yakini","yakınında","nerede","yer","yerler","tesisi","tesisleri",
  "kamp","kamping","tatil","rezervasyon",
  // en
  "the","a","an","and","or","near","close","best","cheap","price",
  // semboller
  "&","-","–","|"
]);

const escapeRegex = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (s) => new RegExp(escapeRegex(s), "i");

function tokenize(raw = "") {
  return String(raw)
    .toLowerCase()
    .split(/\s+/)
    // unicode harf/rakam dışını temizle (Node 18+ güvenli)
    .map((t) => t.replace(/[^\p{L}\p{N}@._+-]+/gu, ""))
    .filter((t) => t && t.length > 2 && !STOP_WORDS.has(t));
}

function buildSnippet(b) {
  const features = Array.isArray(b.features)
    ? b.features.filter(Boolean).slice(0, 5).join(", ")
    : "";

  const first =
    (b.description && String(b.description).trim()) ||
    (b.summary && String(b.summary).trim()) ||
    (features && features) ||
    "";

  if (first) return first;

  const type = b.type ? String(b.type).trim() : "";
  const loc = [b.city, b.district].filter(Boolean).join(" / ");
  const typeText = type ? `${type} tesisi` : "işletme";
  return [typeText, loc].filter(Boolean).join(" • ");
}

function pickLocationHint(qRaw, docs) {
  if (/sapanca/i.test(qRaw)) return "Sapanca";
  if (docs?.[0]?.district) return docs[0].district;
  if (docs?.[0]?.city) return docs[0].city;
  return "";
}

// Varsayılan projection (hem aramada hem slug listesinde)
const DEFAULT_FIELDS = [
  "name","slug","gallery","description","summary","features","type",
  "city","district","instagramUsername","website","verified",
  "createdAt","address","phone","phones",
  "coverImage","coverUrl","imageUrl","images","photos"
].join(" ");

/* -----------------------------------------------------------------------------
 * Tiny in-memory cache (prodda Redis önerilir)
 * -------------------------------------------------------------------------- */
const _cache = new Map(); // key -> { ts, data }
const cacheKey = (qs) => `explore|${qs}`;

function cacheGet(key) {
  const v = _cache.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > EXPLR_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return v.data;
}
function cacheSet(key, data) {
  _cache.set(key, { ts: Date.now(), data });
}

/* -----------------------------------------------------------------------------
 * Ortak yardımcılar
 * -------------------------------------------------------------------------- */
function normalizeFieldsParam(fieldsParam, fallback = DEFAULT_FIELDS) {
  if (!fieldsParam) return fallback;
  return String(fieldsParam)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

function pickImage(b) {
  return (
    b.coverImage ||
    b.coverUrl ||
    b.imageUrl ||
    (Array.isArray(b.images) && (b.images[0]?.url || b.images[0])) ||
    (Array.isArray(b.photos) && (b.photos[0]?.url || b.photos[0])) ||
    (Array.isArray(b.gallery) && b.gallery[0]) ||
    PLACEHOLDER_IMAGE_URL
  );
}

function buildSlugFilter(slug) {
  const r = rx(slug);
  return {
    $or: [
      { collection: r },
      { collections: r },
      { category: r },
      { categories: r },
      { tags: r },
      { pageSlug: r },
      { section: r },
      { explore: r },
      { exploreKeys: r },
    ],
  };
}

async function handleSlugQuery(req, res, slug) {
  const limit = Math.max(1, Math.min(+req.query.limit || 500, 1000));
  const page = Math.max(1, +req.query.page || 1);
  const skip = (page - 1) * limit;
  const fields = normalizeFieldsParam(req.query.fields);

  // sort: varsayılan verified desc, createdAt desc
  const sort = {};
  const sortParam = String(req.query.sort || "-verified,-createdAt");
  for (const part of sortParam.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part.startsWith("-")) sort[part.slice(1)] = -1;
    else sort[part] = 1;
  }

  const filter = buildSlugFilter(slug);

  if (typeof req.query.verified === "string") {
    const v = req.query.verified.toLowerCase();
    if (v === "true" || v === "false") filter.verified = v === "true";
  }
  if (typeof req.query.status === "string" && req.query.status !== "all") {
    filter.status = req.query.status;
  }

  const key = cacheKey(
    JSON.stringify({
      kind: "slug",
      slug, page, limit, sort, fields,
      verified: req.query.verified || "",
      status: req.query.status || ""
    })
  );
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  const [docs, total] = await Promise.all([
    Business.find(filter)
      .select(fields)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Business.countDocuments(filter),
  ]);

  const items = docs.map((b) => ({ ...b, _image: pickImage(b) }));

  const payload = { success: true, slug, page, limit, total, items };
  cacheSet(key, payload);
  return res.json(payload);
}

/* -----------------------------------------------------------------------------
 * GET /api/explore (arama)
 * Ayrıca: /api/explore?slug=... gelirse otomatik slug listesine yönlendirir
 * -------------------------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    if (req.query.slug) {
      return await handleSlugQuery(req, res, String(req.query.slug || "").trim());
    }

    let qRaw = String(req.query.q || "").trim();

    // aşırı uzun / çöp query guard
    if (qRaw.length > 160) qRaw = qRaw.slice(0, 160);

    if (!qRaw) {
      return res.json({
        success: true,
        vertical: "web",
        query: "",
        location: "",
        page: 1,
        limit: 20,
        total: 0,
        places: [],
        results: [],
        suggestions: [],
        trending: [],
      });
    }

    const limit = Math.max(1, Math.min(+req.query.limit || 20, 50));
    const page = Math.max(1, +req.query.page || 1);
    const skip = (page - 1) * limit;

    const sort = {};
    const sortParam = String(req.query.sort || "-verified,-createdAt");
    for (const part of sortParam.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (part.startsWith("-")) sort[part.slice(1)] = -1;
      else sort[part] = 1;
    }

    const fields = normalizeFieldsParam(req.query.fields);

    const qsKey = JSON.stringify({
      kind: "search",
      qRaw, page, limit, sort, fields,
      city: req.query.city || "",
      district: req.query.district || "",
      verified: req.query.verified || "",
      status: req.query.status || "",
    });
    const cKey = cacheKey(qsKey);
    const cached = cacheGet(cKey);
    if (cached) return res.json(cached);

    const tokens = tokenize(qRaw);
    const digits = qRaw.replace(/\D/g, "");

    const andParts =
      tokens.length > 0
        ? tokens.map((t) => ({
            $or: [
              { name: rx(t) },
              { type: rx(t) },
              { handle: rx(t) },
              { instagramUsername: rx(t) },
              { address: rx(t) },
              { city: rx(t) },
              { district: rx(t) },
              { website: rx(t) },
              { tags: rx(t) },
              { categories: rx(t) },
            ],
          }))
        : [{
            $or: [
              { name: rx(qRaw) },
              { address: rx(qRaw) },
              { city: rx(qRaw) },
              { district: rx(qRaw) },
              { instagramUsername: rx(qRaw) },
              { type: rx(qRaw) },
              { website: rx(qRaw) },
              { tags: rx(qRaw) },
              { categories: rx(qRaw) },
            ],
          }];

    // Telefon ipucu (6+ hane) — phones-safe arama
    if (digits.length >= 6) {
      const rDigits = rx(digits);
      andParts.push({
        $or: [
          { phone: rDigits },
          { phones: rDigits },            // string[] ise
          { "phones.number": rDigits },   // subdoc[] ise
          { "phones.value": rDigits },    // farklı isim ihtimali
        ],
      });
    }

    const filter = { $and: andParts };

    if (req.query.city) filter.$and.push({ city: rx(req.query.city) });
    if (req.query.district) filter.$and.push({ district: rx(req.query.district) });

    if (typeof req.query.verified === "string") {
      const v = req.query.verified.toLowerCase();
      if (v === "true" || v === "false") filter.$and.push({ verified: v === "true" });
    }

    if (typeof req.query.status === "string" && req.query.status !== "all") {
      filter.$and.push({ status: req.query.status });
    }

    const [docs, total] = await Promise.all([
      Business.find(filter)
        .select(fields)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Business.countDocuments(filter),
    ]);

    const places = docs.slice(0, 8).map((b) => ({
      name: b.name,
      url: `/isletme/${b.slug || b._id}`,
      image: pickImage(b),
      slug: b.slug || String(b._id),
    }));

    const results = docs.map((b) => ({
      title: b.name,
      url: `/isletme/${b.slug || b._id}`,
      snippet: buildSnippet(b),
      breadcrumbs: [`edogrula.org › ${b.slug || b._id}`],
      slug: b.slug || String(b._id),
    }));

    const suggestions = [
      qRaw,
      ...(docs[0]?.city ? [`${docs[0].city} bungalov evleri`] : []),
      "instagram doğrulama",
      "işletme telefonu sorgula",
    ].filter(Boolean);

    const trending = [
      ...new Set(
        docs
          .map((d) => d.instagramUsername)
          .concat(
            docs
              .map((d) => d.website)
              .filter(Boolean)
              .map((w) => {
                try {
                  const url = /^https?:\/\//i.test(w) ? w : `https://${w}`;
                  return new URL(url).hostname.replace(/^www\./, "");
                } catch {
                  return null;
                }
              })
              .filter(Boolean)
          )
          .filter(Boolean)
      ),
    ].slice(0, 8);

    const location = pickLocationHint(qRaw, docs);

    const payload = {
      success: true,
      vertical: "lodging",
      query: qRaw,
      location,
      page,
      limit,
      total,
      places,
      results,
      suggestions,
      trending,
    };

    cacheSet(cKey, payload);
    return res.json(payload);
  } catch (e) {
    console.error("explore error:", e);
    return res.status(500).json({
      success: false,
      vertical: "web",
      query: String(req.query.q || ""),
      location: "",
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
      total: 0,
      places: [],
      results: [],
      suggestions: [],
      trending: [],
      message: "Explore error",
    });
  }
});

/* -----------------------------------------------------------------------------
 * (Opsiyonel) Facets: city/district dağılımı
 * GET /api/explore/facets?q=...
 * -------------------------------------------------------------------------- */
router.get("/facets", async (req, res) => {
  try {
    let qRaw = String(req.query.q || "").trim();
    if (qRaw.length > 160) qRaw = qRaw.slice(0, 160);

    const tokens = tokenize(qRaw);
    const digits = qRaw.replace(/\D/g, "");

    const andParts =
      tokens.length > 0
        ? tokens.map((t) => ({
            $or: [
              { name: rx(t) },
              { type: rx(t) },
              { handle: rx(t) },
              { instagramUsername: rx(t) },
              { address: rx(t) },
              { city: rx(t) },
              { district: rx(t) },
              { website: rx(t) },
            ],
          }))
        : [{
            $or: [
              { name: rx(qRaw) },
              { address: rx(qRaw) },
              { city: rx(qRaw) },
              { district: rx(qRaw) },
              { instagramUsername: rx(qRaw) },
              { type: rx(qRaw) },
              { website: rx(qRaw) },
            ],
          }];

    if (digits.length >= 6) {
      const rDigits = rx(digits);
      andParts.push({
        $or: [
          { phone: rDigits },
          { phones: rDigits },
          { "phones.number": rDigits },
          { "phones.value": rDigits },
        ],
      });
    }

    const filter = { $and: andParts };

    const [byCity, byDistrict] = await Promise.all([
      Business.aggregate([
        { $match: filter },
        { $group: { _id: "$city", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      Business.aggregate([
        { $match: filter },
        { $group: { _id: "$district", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
    ]);

    return res.json({
      success: true,
      facets: {
        city: byCity.filter((x) => x._id).map((x) => ({ value: x._id, count: x.count })),
        district: byDistrict.filter((x) => x._id).map((x) => ({ value: x._id, count: x.count })),
      },
    });
  } catch (e) {
    console.error("explore facets error:", e);
    return res.status(500).json({ success: false, message: "Facets error" });
  }
});

/* -----------------------------------------------------------------------------
 * Slug tabanlı kısa yollar
 *  - GET /api/explore/by-slug/:slug
 *  - GET /api/explore/:slug  (facets ile çakışmayı önlemek için guard var)
 * -------------------------------------------------------------------------- */
router.get("/by-slug/:slug", async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) {
    return res.json({ success: true, slug: "", items: [], total: 0, page: 1, limit: 0 });
  }
  try {
    return await handleSlugQuery(req, res, slug);
  } catch (e) {
    console.error("explore by-slug error:", e);
    return res.status(500).json({ success: false, message: "Explore by-slug error" });
  }
});

router.get("/:slug", async (req, res, next) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug || slug.toLowerCase() === "facets") return next();
  try {
    return await handleSlugQuery(req, res, slug);
  } catch (e) {
    console.error("explore slug error:", e);
    return res.status(500).json({ success: false, message: "Explore slug error" });
  }
});

export default router;
