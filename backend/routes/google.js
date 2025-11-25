// backend/routes/google.js — Ultra Pro (New Places + Legacy fallback + safe paging + sync)
import express from "express";
import axios from "axios";
import Business from "../models/Business.js";

const router = express.Router();

/* ============================================================================
   Tiny in-memory cache (TTL'li) — prod’da Redis önerilir
   ========================================================================== */
const cache = new Map(); // key -> { exp: number, val: any }

async function getCached(key, fn, ttlMs = 6 * 60 * 60 * 1000) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();          // hata fırlarsa cache’e yazmaz
  cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

/* ============================================================================
   Helpers
   ========================================================================== */
const escapeRegex = (s = "") =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toNum = (v, def = 0) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : def;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizePlaceMetaNew = (p) => ({
  id: p?.id || null,
  name: p?.displayName?.text || null,
  address: p?.formattedAddress || null,
  rating: p?.rating ?? null,
  count: p?.userRatingCount ?? 0,
  googleMapsUri: p?.googleMapsUri || null,
});

const normalizeReviewsNew = (reviews = []) =>
  reviews.map((rv) => ({
    author: rv?.authorAttribution?.displayName || null,
    authorUrl: rv?.authorAttribution?.uri || null,
    authorPhoto: rv?.authorAttribution?.photoUri || null,
    rating: rv?.rating ?? null,
    text: rv?.text?.text || "",
    time: rv?.publishTime || null,
  }));

const normalizeFromLegacyDetails = (result) => ({
  place: {
    id: result?.place_id || null,
    name: result?.name || null,
    address: result?.formatted_address || null,
    rating: result?.rating ?? null,
    count: result?.user_ratings_total ?? 0,
    googleMapsUri: result?.url || null,
  },
  reviews: (result?.reviews || []).map((r) => ({
    author: r?.author_name || null,
    authorUrl: r?.author_url || null,
    authorPhoto: r?.profile_photo_url || null,
    rating: r?.rating ?? null,
    text: r?.text || "",
    time: r?.time ? new Date(r.time * 1000).toISOString() : null,
  })),
});

/* ============================================================================
   Google Places (New) — Text Search
   ========================================================================== */
async function searchPlaceNew(apiKey, query) {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const headers = {
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.rating",
      "places.userRatingCount",
      "places.googleMapsUri",
    ].join(","),
  };
  const body = { textQuery: query };

  const { data } = await axios.post(url, body, {
    headers,
    timeout: 12_000,
  });

  return data?.places?.[0] || null;
}

/* ============================================================================
   Google Places (New) — Place meta
   ========================================================================== */
async function getPlaceMetaNew(apiKey, placeId) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
    placeId
  )}`;
  const headers = {
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": [
      "id",
      "displayName",
      "formattedAddress",
      "rating",
      "userRatingCount",
      "googleMapsUri",
    ].join(","),
  };

  const { data } = await axios.get(url, {
    headers,
    timeout: 10_000,
  });
  return data;
}

/* ============================================================================
   Google Places (New) — TÜM yorumları sayfalayarak çek
   Not: nextPageToken bazen 1-2 sn sonra aktif oluyor → küçük bekleme ekledik
   ========================================================================== */
async function getAllReviewsNew(apiKey, placeId, hardLimit = 1000) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
    placeId
  )}/reviews`;

  const headers = {
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": [
      "reviews.rating",
      "reviews.text.text",
      "reviews.publishTime",
      "reviews.authorAttribution.displayName",
      "reviews.authorAttribution.uri",
      "reviews.authorAttribution.photoUri",
      "nextPageToken",
    ].join(","),
  };

  let pageToken = null;
  const all = [];
  const pageSize = 10;
  const maxPages = Math.ceil(hardLimit / pageSize) + 2; // güvenlik

  for (let i = 0; i < maxPages; i++) {
    const params = { orderBy: "NEWEST", pageSize };
    if (pageToken) params.pageToken = pageToken;

    const { data } = await axios.get(url, {
      headers,
      params,
      timeout: 15_000,
    });

    const batch = normalizeReviewsNew(data?.reviews || []);
    all.push(...batch);

    pageToken = data?.nextPageToken || null;
    if (!pageToken || all.length >= hardLimit) break;

    // token aktifleşmesi için küçük backoff
    await sleep(1400);
  }

  return all.slice(0, hardLimit);
}

/* ============================================================================
   Legacy Fallback — Place Details (max 5 yorum)
   ========================================================================== */
async function getDetailsLegacy(apiKey, placeId) {
  const url = "https://maps.googleapis.com/maps/api/place/details/json";
  const params = {
    place_id: placeId,
    fields:
      "place_id,name,formatted_address,url,rating,user_ratings_total,reviews",
    reviews_sort: "newest",
    reviews_no_translations: "true",
    key: apiKey,
  };

  const { data } = await axios.get(url, {
    params,
    timeout: 12_000,
  });

  if (data?.status !== "OK") {
    const err = new Error(data?.status || "DETAILS_FAILED");
    err.payload = data;
    throw err;
  }

  return data.result;
}

/* ============================================================================
   Business sync — Google meta’dan DB’ye puan yaz
   ========================================================================== */
async function syncGoogleToBusinessFromMeta(meta) {
  try {
    if (!meta) return;

    const placeId = meta.id || meta.placeId;
    if (!placeId) return;

    const rating = toNum(meta.rating, 0);
    const count = toNum(meta.count ?? meta.userRatingCount, 0);

    await Business.updateMany(
      {
        $or: [
          { googlePlaceId: placeId },
          { "google.placeId": placeId },
          { "google.id": placeId },
        ],
      },
      {
        $set: {
          googlePlaceId: placeId,
          googleRating: rating,
          googleReviewsCount: count,
          google: {
            ...(meta.google || {}),
            id: placeId,
            name: meta.name || undefined,
            address: meta.address || undefined,
            rating: rating || undefined,
            userRatingCount: count || undefined,
            googleMapsUri: meta.googleMapsUri || undefined,
          },
        },
      }
    ).exec();
  } catch (e) {
    console.error("[google-sync] hata:", e?.message || e);
  }
}

/* ============================================================================
   /api/google/reviews?placeId=...&limit=...
   - NEW meta + tüm yorumlar
   - fail olursa Legacy fallback
   - meta’yı Business ile senkronlar
   ========================================================================== */
router.get("/reviews", async (req, res) => {
  try {
    const API_KEY =
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        error: "API key yok",
      });
    }

    const placeId = String(req.query.placeId || "").trim();
    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "placeId gerekli",
      });
    }

    const askedLimit = parseInt(req.query.limit || "1000", 10);
    const hardCap = Number(process.env.GOOGLE_REVIEWS_HARD_LIMIT || 1000);
    const limit = Math.max(1, Math.min(askedLimit || 1000, 5000, hardCap));

    // Meta (NEW) — cache
    const metaRaw = await getCached(
      `meta:${placeId}`,
      () => getPlaceMetaNew(API_KEY, placeId),
      6 * 60 * 60 * 1000
    );
    const placeMeta = normalizePlaceMetaNew(metaRaw);

    // Reviews (NEW) — cache + legacy fallback
    let reviews = [];
    let mode = "new";
    try {
      reviews = await getCached(
        `reviews:${placeId}:limit:${limit}`,
        () => getAllReviewsNew(API_KEY, placeId, limit),
        3 * 60 * 60 * 1000
      );
    } catch (e) {
      mode = "legacy";
      const legacy = await getCached(
        `legacyDetails:${placeId}`,
        () => getDetailsLegacy(API_KEY, placeId),
        3 * 60 * 60 * 1000
      );
      const mapped = normalizeFromLegacyDetails(legacy);
      reviews = mapped.reviews || [];
    }

    // DB senkronu (default açık, ?sync=0 ile kapatılabilir)
    if (String(req.query.sync || "1") !== "0") {
      await syncGoogleToBusinessFromMeta(placeMeta);
    }

    return res.json({
      success: true,
      place: placeMeta,
      reviews,
      mode,
      totalReturned: reviews.length,
      limit,
    });
  } catch (e) {
    console.error(
      "Hata /api/google/reviews:",
      e?.payload || e?.response?.data || e?.message || e
    );
    return res.status(502).json({
      success: false,
      error: "google_details_failed",
    });
  }
});

/* ============================================================================
   /api/google/reviews/search?query=...&limit=...
   - Query → Text Search → Place
   - Sonra meta + yorum + senkron
   ========================================================================== */
router.get("/reviews/search", async (req, res) => {
  try {
    const API_KEY =
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        error: "API key yok",
      });
    }

    let query = String(req.query.query || "").trim();
    if (!query) {
      return res.status(400).json({
        success: false,
        error: "query gerekli",
      });
    }
    if (query.length > 160) query = query.slice(0, 160);

    const askedLimit = parseInt(req.query.limit || "1000", 10);
    const hardCap = Number(process.env.GOOGLE_REVIEWS_HARD_LIMIT || 1000);
    const limit = Math.max(1, Math.min(askedLimit || 1000, 5000, hardCap));

    // Text Search (cache)
    const place = await getCached(
      `search:${query.toLowerCase().replace(/\s+/g, " ")}`,
      () => searchPlaceNew(API_KEY, query),
      6 * 60 * 60 * 1000
    );

    if (!place?.id) {
      return res.status(404).json({
        success: false,
        error: "not_found",
      });
    }

    // Meta
    const metaRaw = await getCached(
      `meta:${place.id}`,
      () => getPlaceMetaNew(API_KEY, place.id),
      6 * 60 * 60 * 1000
    );
    const placeMeta = normalizePlaceMetaNew(metaRaw);

    // Reviews (NEW + legacy fallback)
    let reviews = [];
    let mode = "new";
    try {
      reviews = await getCached(
        `reviews:${place.id}:limit:${limit}`,
        () => getAllReviewsNew(API_KEY, place.id, limit),
        3 * 60 * 60 * 1000
      );
    } catch (e) {
      mode = "legacy";
      const legacy = await getCached(
        `legacyDetails:${place.id}`,
        () => getDetailsLegacy(API_KEY, place.id),
        3 * 60 * 60 * 1000
      );
      const mapped = normalizeFromLegacyDetails(legacy);
      reviews = mapped.reviews || [];
    }

    if (String(req.query.sync || "1") !== "0") {
      await syncGoogleToBusinessFromMeta(placeMeta);
    }

    return res.json({
      success: true,
      placeId: place.id,
      place: placeMeta,
      reviews,
      mode,
      totalReturned: reviews.length,
      limit,
    });
  } catch (e) {
    console.error(
      "Hata /api/google/reviews/search:",
      e?.payload || e?.response?.data || e?.message || e
    );
    return res.status(502).json({
      success: false,
      error: "google_search_failed",
      message: e?.message,
    });
  }
});

export default router;
