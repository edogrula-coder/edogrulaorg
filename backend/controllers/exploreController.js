// backend/controllers/exploreController.js
import Business from "../models/Business.js";
import Report from "../models/Report.js";
import Blacklist from "../models/Blacklist.js";

/* ======================= yardımcılar ======================= */
const STOP_WORDS = new Set([
  "ev", "evleri", "otel", "otelleri", "konaklama",
  "fiyat", "fiyatları", "fiyatlari",
  "en", "icin", "için", "ve", "veya",
  "yakın", "yakini", "yakınında",
  "the", "&", "-", "–"
]);

const escapeRx = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (q = "") => new RegExp(escapeRx(q), "i");
const normHandle = (h = "") => String(h).replace(/^@+/, "");
const hostFrom = (url = "") => {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch { return ""; }
};

const tokenize = (qRaw = "") =>
  String(qRaw)
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^\p{L}\p{N}@._+-]+/gu, ""))
    .filter(t => t && t.length > 2 && !STOP_WORDS.has(t));

const buildSnippet = (b) => {
  const feat = Array.isArray(b.features)
    ? b.features.filter(Boolean).slice(0, 5).join(", ")
    : "";

  const first =
    (b.description && String(b.description).trim()) ||
    (b.summary && String(b.summary).trim()) ||
    (feat && feat) ||
    "";

  if (first) return first;

  const type = b.type ? String(b.type).trim() : "";
  const loc = [b.city, b.district].filter(Boolean).join(" / ");
  const typeText = type ? `${type} tesisi` : "işletme";
  return [typeText, loc].filter(Boolean).join(" • ");
};

const slugOrId = (b) => b.slug || String(b._id);

/**
 * Business filtresi — verilen sorgunun token’larını alanlar üzerinde AND,
 * her token için alanlar arasında OR uygular.
 */
const buildBusinessFilter = (qRaw) => {
  const tokens = tokenize(qRaw);
  const digits = String(qRaw).replace(/\D/g, "");

  const andParts = tokens.length
    ? tokens.map((t) => {
        const h = normHandle(t);
        return {
          $or: [
            { name: rx(t) },
            { type: rx(t) },
            { slug: rx(t) },
            { handle: rx(h) },
            { instagramUsername: new RegExp(`^@?${escapeRx(h)}$`, "i") },
            { instagramUrl: rx(t) },
            { website: rx(t) },
            { address: rx(t) },
            { city: rx(t) },
            { district: rx(t) },
            { description: rx(t) },
            { summary: rx(t) },
            { features: rx(t) },
          ],
        };
      })
    : [{
        $or: [
          { name: rx(qRaw) },
          { type: rx(qRaw) },
          { address: rx(qRaw) },
          { city: rx(qRaw) },
          { district: rx(qRaw) },
          { instagramUsername: rx(qRaw) },
          { instagramUrl: rx(qRaw) },
          { website: rx(qRaw) },
          { description: rx(qRaw) },
          { summary: rx(qRaw) },
          { features: rx(qRaw) },
        ],
      }];

  if (digits.length >= 6) {
    andParts.push({
      $or: [
        { phone: rx(digits) },
        { phones: rx(digits) },
      ],
    });
  }

  return { $and: andParts };
};

/* ======================= controller ======================= */
export async function explore(req, res) {
  try {
    const qRaw = String(req.query.q || "").trim();
    const tab = String(req.query.tab || "all").toLowerCase();

    const baseSuggestions = [
      "sapanca bungalov evleri",
      "kartepe bungalov evleri",
      "kocaeli bungalov evleri",
      "instagram doğrulama",
      "otel yorumları güvenilir mi",
      "işletme telefonu sorgula",
    ];

    if (!qRaw) {
      return res.json({
        vertical: "web",
        location: "",
        places: [],
        results: [],
        suggestions: baseSuggestions,
        trending: [],
        tab,
      });
    }

    // Aşırı uzun sorgularda regex/DB şişmesin
    const q = qRaw.slice(0, 120);
    const qLower = q.toLowerCase();

    const filter = buildBusinessFilter(q);
    const qRe = rx(q);

    const lodgingLike = /(sapanca|kartepe|bungalov|otel|konaklama|villa|evleri)/i.test(q);

    // Verileri topla (select ile payload küçültüldü)
    const [biz, reps, bls] = await Promise.all([
      Business.find(filter)
        .sort({ verified: -1, createdAt: -1 })
        .limit(30)
        .select([
          "name", "slug", "verified", "createdAt",
          "features", "description", "summary", "type",
          "city", "district", "gallery",
          "instagramUrl", "instagramUsername",
          "website", "address", "phone", "phones", "handle"
        ].join(" "))
        .lean(),

      Report.find({
        $or: [
          { name: qRe },
          { instagramUsername: qRe },
          { instagramUrl: qRe },
          { phone: qRe },
          { desc: qRe },
          { reporterEmail: qRe },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .select("name instagramUsername instagramUrl phone desc reporterEmail createdAt")
        .lean(),

      Blacklist.find({
        $or: [
          { name: qRe },
          { instagramUsername: new RegExp(`^${escapeRx(normHandle(q))}$`, "i") },
          { instagramUrl: qRe },
          { phone: qRe },
          { desc: qRe },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .select("name instagramUsername instagramUrl phone desc createdAt")
        .lean(),
    ]);

    const placeholder =
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=800&auto=format&fit=crop";

    const places = lodgingLike
      ? biz.slice(0, 8).map((b) => ({
          name: b.name,
          url: `/isletme/${slugOrId(b)}`,
          image: (Array.isArray(b.gallery) && b.gallery[0]) || placeholder,
          rating: b.verified ? 9.2 : 8.8,
          votes: 100,
          slug: slugOrId(b),
        }))
      : [];

    const results = [
      ...biz.map((b) => ({
        title: b.name,
        url: `/isletme/${slugOrId(b)}`,
        snippet: buildSnippet(b),
        breadcrumbs: [`edogrula.org › ${slugOrId(b)}`],
        slug: slugOrId(b),
      })),

      ...reps.map((r) => {
        const h = normHandle(r.instagramUsername || "");
        const hasIg = Boolean(r.instagramUrl || r.instagramUsername);
        const url = hasIg
          ? (h ? `https://instagram.com/${h}` : (r.instagramUrl || ""))
          : "";

        return ({
          title: r.name || "İhbar",
          url,
          snippet: r.desc || "",
          breadcrumbs: [hostFrom(r.instagramUrl || r.reporterEmail || "")].filter(Boolean),
        });
      }),

      ...bls.map((b1) => ({
        title: (b1.name || "Kara Liste") + " – Kara Liste",
        url: b1.instagramUrl || (b1.instagramUsername
          ? `https://instagram.com/${normHandle(b1.instagramUsername)}`
          : ""),
        snippet: b1.desc || "",
        breadcrumbs: [hostFrom(b1.instagramUrl || "")].filter(Boolean),
      })),
    ];

    const fromDbNames = [
      ...biz.map((b) => b.name).filter(Boolean),
      ...bls.map((b) => (b.name ? `${b.name} (kara liste)` : null)).filter(Boolean),
    ];

    const seen = new Set();
    const suggestions = [...fromDbNames, ...baseSuggestions]
      .filter((s) => {
        const k = s.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return !qLower || k.includes(qLower);
      })
      .slice(0, 8);

    const trending = [
      ...new Set(
        [
          ...biz.map((b) => hostFrom(b.website || b.instagramUrl || "")),
          ...biz
            .map((b) => b.instagramUsername)
            .filter(Boolean)
            .map((h) => `@${normHandle(h)}`),
        ].filter(Boolean)
      ),
    ].slice(0, 8);

    const location =
      /sapanca/i.test(q) ? "Sapanca" : biz[0]?.district || biz[0]?.city || "";

    return res.json({
      vertical: lodgingLike ? "lodging" : "web",
      location,
      places,
      results,
      suggestions,
      trending,
      tab,
    });
  } catch (e) {
    console.error("exploreController error:", e);
    return res.json({
      vertical: "web",
      location: "",
      places: [],
      results: [],
      suggestions: [
        "sapanca bungalov evleri",
        "instagram doğrulama",
        "işletme telefonu sorgula",
      ],
      trending: [],
      tab: String(req.query?.tab || "all").toLowerCase(),
    });
  }
}
