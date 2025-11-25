// backend/routes/geo.js — Ultra Pro (knowledge endpoint, live-ready)
import express from "express";
import axios from "axios";

const router = express.Router();

/* ============================================================================
   Config
   ========================================================================== */
const TTL_MS = Number(process.env.GEO_KNOWLEDGE_TTL_MS || 30 * 60 * 1000); // 30dk
const DEFAULT_QUERY = "Sapanca";

// API key fallback (google.js ile uyumlu)
const getGoogleKey = () =>
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  "";

// axios instance (tek yerden timeout / UA)
const http = axios.create({
  timeout: 12_000,
  headers: {
    "User-Agent": "edogrula-geo-knowledge/1.0",
    "Accept": "application/json",
  },
});

/* ============================================================================
   Tiny in-memory cache (TTL)
   ========================================================================== */
const cache = new Map(); // key -> { exp, val }

async function getCached(key, fn, ttlMs = TTL_MS) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn(); // hata fırlarsa cache’e zehir yazmayız
  cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

/* ============================================================================
   Helpers
   ========================================================================== */
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const safeQ = (q) =>
  String(q || DEFAULT_QUERY)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);

function pickPlaceBasicsLegacy(result, place_id) {
  if (!result) return null;
  return {
    place_id,
    name: result?.name || null,
    formatted_address: result?.formatted_address || null,
    geometry: result?.geometry || null, // {location:{lat,lng}}
    url: result?.url || null,
  };
}

/* ============================================================================
   1) Google Places (Legacy) — textsearch + details
   ========================================================================== */
async function fetchPlaceLegacy(googleKey, q) {
  if (!googleKey) return null;

  // textsearch
  const ts = await http.get(
    "https://maps.googleapis.com/maps/api/place/textsearch/json",
    { params: { query: q, language: "tr", region: "tr", key: googleKey } }
  );

  const cand = ts.data?.results?.[0];
  if (!cand?.place_id) return null;

  // details (minimal fields)
  const det = await http.get(
    "https://maps.googleapis.com/maps/api/place/details/json",
    {
      params: {
        place_id: cand.place_id,
        language: "tr",
        fields: "name,formatted_address,geometry,url",
        key: googleKey,
      },
    }
  );

  return pickPlaceBasicsLegacy(det.data?.result, cand.place_id);
}

/* ============================================================================
   2) Wikipedia TR — summary
   ========================================================================== */
async function fetchWikiTR(q) {
  try {
    const { data } = await http.get(
      `https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`
    );
    return data || null;
  } catch (e) {
    // Wikipedia 404 vb. → null dön, endpointi düşürme
    return null;
  }
}

/* ============================================================================
   3) Open-Meteo — current weather (+ daily)
   ========================================================================== */
async function fetchWeather(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const { data } = await http.get("https://api.open-meteo.com/v1/forecast", {
    params: {
      latitude: lat,
      longitude: lng,
      current_weather: true,
      daily: "temperature_2m_max,temperature_2m_min,weathercode",
      timezone: "auto",
    },
  });

  return data || null;
}

/* ============================================================================
   GET /api/geo/knowledge?q=Sapanca
   Response shape korunur:
   { title, subtitle, summary, wiki_url, coordinates, gmap_url, weather }
   ========================================================================== */
router.get("/geo/knowledge", async (req, res) => {
  const q = safeQ(req.query.q);

  try {
    const googleKey = getGoogleKey();

    // Place + Wiki paralel, weather place’den sonra
    const [place, wiki] = await Promise.all([
      getCached(`place:${q.toLowerCase()}`, () => fetchPlaceLegacy(googleKey, q)),
      getCached(`wiki:${q.toLowerCase()}`, () => fetchWikiTR(q)),
    ]);

    // coords varsa weather çek (cache’li)
    let weather = null;
    const coords = place?.geometry?.location;
    if (coords?.lat != null && coords?.lng != null) {
      const lat = Number(coords.lat);
      const lng = Number(coords.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        weather = await getCached(
          `weather:${q.toLowerCase()}:${lat.toFixed(4)},${lng.toFixed(4)}`,
          () => fetchWeather(lat, lng),
          15 * 60 * 1000 // hava için daha kısa TTL
        );
      }
    }

    // başlık/özet fallback zinciri
    const title =
      wiki?.titles?.display ||
      place?.name ||
      q;

    const subtitle =
      wiki?.description ||
      (place?.formatted_address ? "Konum" : "Bilgi");

    const summary =
      wiki?.extract ||
      null;

    const wiki_url =
      wiki?.content_urls?.desktop?.page ||
      null;

    const gmap_url =
      place?.url ||
      (place?.place_id
        ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
        : null);

    return res.json({
      title,
      subtitle,
      summary,
      wiki_url,
      coordinates: coords || null,
      gmap_url,
      weather,
    });
  } catch (err) {
    console.error("[geo/knowledge] error:", err?.response?.data || err?.message || err);
    return res.status(500).json({
      error: "knowledge_fetch_failed",
      detail: err?.message || "unknown_error",
    });
  }
});

export default router;
