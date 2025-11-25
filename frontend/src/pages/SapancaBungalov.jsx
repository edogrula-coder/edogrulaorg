// src/pages/SapancaBungalov.jsx — ULTRA PRO + SEO/Rich Results Uyumlu
// - Sapanca bungalovlarını çeker (filter endpoint + fallback)
// - Google puanını backend'den hydrate eder, sessionStorage cache
// - Mutlak OG/Twitter URL, ItemList + FAQ + Breadcrumb JSON-LD
// - Stabil hydration (inFlight set) + SSR guard'ları

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  FaInstagram,
  FaPhone,
  FaGlobe,
  FaCheck,
  FaStar,
  FaBuilding,
  FaFilter,
  FaChevronDown,
} from "react-icons/fa6";

/* ================== API (robust baseURL) ================== */

// VITE_API_URL bazen ".../api" ile geliyor, bunu origin'e normalize ediyoruz.
function normalizeOrigin(raw) {
  const RAW = String(raw || "").trim();
  let t;
  if (!RAW) t = "http://localhost:5000";
  else if (/^https?:\/\//i.test(RAW)) t = RAW;
  else if (/^:\d+$/.test(RAW)) t = `http://localhost:${RAW.slice(1)}`;
  else t = `http://${RAW}`;
  return t.replace(/\/+$/, "").replace(/\/api$/i, "");
}

const ORIGIN = normalizeOrigin(
  import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_ROOT ||
    ""
);

const api = axios.create({
  baseURL: ORIGIN || undefined, // /api prefixleri path'te kalacak
  withCredentials: true,
  timeout: 12000,
  headers: { Accept: "application/json" },
});

/* ================== HELPERS ================== */

const toPositiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const pickFirstNumber = (...candidates) => {
  for (const c of candidates) {
    const n = toPositiveNumber(c);
    if (n) return n;
  }
  return 0;
};

/* -------- Google score normalizasyonu (BusinessProfile ile uyumlu) -------- */
function extractGoogleScore(data) {
  if (!data) return null;
  const place = data.place || data.result || {};

  const ratingRaw =
    place.rating ?? data.rating ?? data.averageRating ?? null;
  const rating = Number(ratingRaw);
  const saneRating =
    Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : null;

  let count =
    Number(
      place.count ??
        place.userRatingCount ??
        place.user_ratings_total ??
        data.count ??
        data.userRatingsTotal
    ) || 0;

  if (!count && Array.isArray(data.reviews || place.reviews)) {
    count = (data.reviews || place.reviews).length;
  }
  if (!Number.isFinite(count) || count < 0) count = 0;

  if (!saneRating && !count) return null;

  return { rating: saneRating || null, count };
}

/* -------- sessionStorage cache -------- */
const GCACHE_KEY = "sapanca_gscore_cache_v1";

function loadGCache() {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(GCACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveGCache(obj) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GCACHE_KEY, JSON.stringify(obj));
  } catch {}
}

/* ================== PAGE ================== */

export default function SapancaBungalov() {
  const navigate = useNavigate();

  // liste & metrik
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // sponsorlar
  const [featured, setFeatured] = useState([]);

  // filtre/sıralama
  const [sort, setSort] = useState("rating"); // "rating" | "reviews"
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // sayfalama
  const PER_PAGE = 20;
  const [page, setPage] = useState(1);

  // görsel fallback
  const DEFAULT_IMG = "/defaults/edogrula-default.webp.png";

  // Google cache state
  const [gCache, setGCache] = useState(() => loadGCache());
  const updateGCache = useCallback((key, value) => {
    setGCache((prev) => {
      const next = { ...prev, [key]: value };
      saveGCache(next);
      return next;
    });
  }, []);

  /* ---------- normalize ---------- */
  const normalize = useCallback(
    (b) => {
      if (!b) return null;

      const descRaw =
        (b.summary && String(b.summary).trim()) ||
        (b.description && String(b.description).trim()) ||
        "";
      const summary =
        descRaw.length > 0
          ? descRaw.length > 180
            ? `${descRaw.slice(0, 180)}…`
            : descRaw
          : "Açıklama mevcut değil.";

      // E-Doğrula puanı
      const rating = toPositiveNumber(
        b.rating ?? b.rate ?? b.score ?? b.avgRating
      );
      const reviews = toPositiveNumber(
        b.reviewsCount ??
          b.reviewCount ??
          b.reviews ??
          b.votes ??
          b.ratingCount
      );

      // Google puanı & yorum sayısı (DB'de varsa direkt kullan)
      let googleRating = pickFirstNumber(
        b.googleRating,
        b.google_rating,
        b.googleRate,
        b.google_rate,
        b.google_score,
        b.googleScore,
        b.google?.rating,
        b.google?.ratingValue,
        b.google?.rating_value
      );

      let googleReviews = pickFirstNumber(
        b.googleReviewsCount,
        b.googleReviewCount,
        b.google_reviews,
        b.google_review_count,
        b.google_review_total,
        b.googleReviews,
        b.google?.user_ratings_total,
        b.google?.reviewsCount,
        b.google?.reviews,
        b.google?.total_reviews,
        b.google?.reviewCount
      );

      // Heuristik: google objesinde sayı ara
      if (!googleRating && b.google && typeof b.google === "object") {
        const nums = Object.values(b.google)
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n) && n > 0);
        const ratingCandidates = nums.filter((n) => n <= 5.0);
        if (ratingCandidates.length) googleRating = ratingCandidates[0];
      }

      if (!googleReviews && b.google && typeof b.google === "object") {
        const nums = Object.values(b.google)
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n) && n > 0);
        const reviewCandidates = nums.filter(
          (n) => n > 5 && (!googleRating || n >= googleRating)
        );
        if (reviewCandidates.length) googleReviews = reviewCandidates[0];
      }

      const rawHandle =
        b.handle ||
        b.instagramUsername ||
        b.instagram_handle ||
        b.instagram ||
        "";
      const instagramHandle = String(rawHandle || "").replace(/^@+/, "");
      const instagramUrl =
        b.instagramUrl ||
        (instagramHandle
          ? `https://www.instagram.com/${instagramHandle}`
          : "");

      const websiteRaw = b.website || b.site || "";
      const website =
        websiteRaw && /^https?:\/\//i.test(websiteRaw)
          ? websiteRaw
          : websiteRaw
          ? `https://${websiteRaw}`
          : "";

      const photo =
        (Array.isArray(b.gallery) && b.gallery[0]) ||
        b.photo ||
        b.cover ||
        DEFAULT_IMG;

      const googlePlaceId =
        b.googlePlaceId ||
        b.google_place_id ||
        b.google?.place_id ||
        null;

      // cache'te varsa uygula
      const cacheKey = googlePlaceId || b.slug || b._id;
      if (cacheKey && gCache[cacheKey]) {
        const cached = gCache[cacheKey];
        if (cached?.rating) googleRating = cached.rating;
        if (cached?.count) googleReviews = cached.count;
      }

      return {
        id: b._id,
        slug: b.slug || b._id,
        name: b.name || "İsimsiz İşletme",
        verified: !!b.verified,
        address: b.address || "Sapanca",
        phone: b.phone || "",
        website,
        instagramHandle,
        instagramUrl,
        type: b.type || "Bungalov",
        photo,
        summary,
        rating,
        reviews,
        googleRating,
        googleReviews,
        googlePlaceId,
      };
    },
    [DEFAULT_IMG, gCache]
  );

  /* ---------- Sunucudan sayfalı çekme ---------- */
  const fetchServerPaged = useCallback(async () => {
    const { data } = await api.get("/api/businesses/filter", {
      params: {
        address: "Sapanca",
        type: "bungalov",
        page,
        perPage: PER_PAGE,
        onlyVerified,
        sort,
      },
    });

    const raw = Array.isArray(data?.items) ? data.items : [];
    const normalized = raw.map(normalize).filter(Boolean);

    setItems(normalized);
    setTotal(
      Number.isFinite(Number(data?.total))
        ? Number(data.total)
        : normalized.length
    );
  }, [page, onlyVerified, sort, normalize]);

  /* ---------- Sponsorlar ---------- */
  const fetchFeatured = useCallback(async () => {
    try {
      const { data } = await api.get("/api/featured", {
        params: { place: "Sapanca", type: "bungalov", limit: 8 },
      });
      const arr = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : [];
      const normalized = arr.map(normalize).filter(Boolean);
      setFeatured(normalized.slice(0, 8));
    } catch {
      setFeatured([]);
    }
  }, [normalize]);

  /* ---------- Fallback ---------- */
  const fetchFallback = useCallback(async () => {
    const queries = ["sapanca", "sapanca bungalov", "sapanca bungalow"];

    const buckets = await Promise.all(
      queries.map((q) =>
        api
          .get("/api/businesses/search", {
            params: { q, type: "text", limit: 500 },
          })
          .then((r) =>
            Array.isArray(r.data?.businesses) ? r.data.businesses : []
          )
          .catch(() => [])
      )
    );

    const map = new Map();
    for (const b of buckets.flat()) {
      if (b?._id && !map.has(b._id)) map.set(b._id, b);
    }

    const raw = Array.from(map.values());

    const filtered = raw.filter((b) => {
      const addr = (b.address || "").toString();
      const inSapanca = /sapanca/i.test(addr) || /^sapanca$/i.test(addr);
      const t = (b.type || "").toString().toLowerCase();
      const isBungalow = /bungalov|bungalow/.test(t);
      return inSapanca && isBungalow && (!onlyVerified || b.verified);
    });

    const normalized = filtered.map(normalize).filter(Boolean);

    const score = (x) =>
      x.rating > 0 ? x.rating : x.googleRating > 0 ? x.googleRating : 0;
    const rev = (x) =>
      x.reviews > 0 ? x.reviews : x.googleReviews > 0 ? x.googleReviews : 0;

    normalized.sort((a, b) =>
      sort === "reviews" ? rev(b) - rev(a) : score(b) - score(a)
    );

    setTotal(normalized.length);

    const start = (page - 1) * PER_PAGE;
    setItems(normalized.slice(start, start + PER_PAGE));

    if (page === 1 && featured.length === 0) {
      setFeatured(normalized.slice(0, 4));
    }
  }, [page, onlyVerified, sort, normalize, featured.length]);

  /* ---------- Veri yükleyici ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchServerPaged(), fetchFeatured()]);
    } catch {
      await fetchFallback();
    } finally {
      setLoading(false);
    }
  }, [fetchServerPaged, fetchFeatured, fetchFallback]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sort, onlyVerified]);

  // filtre değişince ilk sayfa
  useEffect(() => {
    setPage(1);
  }, [sort, onlyVerified]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // 1. sayfada sponsorları organikten çıkar
  const organicItems = useMemo(() => {
    if (page !== 1 || featured.length === 0) return items;
    const featuredIds = new Set(featured.map((x) => x.id));
    return items.filter((x) => !featuredIds.has(x.id));
  }, [items, featured, page]);

  const displayedItems = organicItems;

  // sort menüsü dış tık (SSR guard)
  const sortMenuRef = useRef(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onDoc = (e) => {
      if (!sortOpen) return;
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(e.target)
      ) {
        setSortOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [sortOpen]);

  /* ---------- GOOGLE PUANLARINI BACKEND'DEN HYDRATE ET (stabil) ---------- */
  const inFlightRef = useRef(new Set());

  useEffect(() => {
    if (!items.length) return;

    let cancelled = false;

    const need = items.filter((b) => {
      if (b.googleRating > 0 || b.googleReviews > 0) return false;

      const key = b.googlePlaceId || b.slug || b.id;
      if (!key) return false;

      if (inFlightRef.current.has(key)) return false;

      const cached = gCache[key];
      return !cached || (!cached.rating && !cached.count);
    });

    if (!need.length) return;

    const CONCURRENCY = 3;
    let idx = 0;

    const run = async () => {
      while (!cancelled && idx < need.length) {
        const slice = need.slice(idx, idx + CONCURRENCY);
        idx += CONCURRENCY;

        await Promise.all(
          slice.map(async (biz) => {
            const key = biz.googlePlaceId || biz.slug || biz.id;
            if (!key) return;
            inFlightRef.current.add(key);

            try {
              let res;
              if (biz.googlePlaceId) {
                res = await api.get("/api/google/reviews", {
                  params: { placeId: biz.googlePlaceId, limit: 40 },
                });
              } else {
                const q = `${biz.name} ${biz.address || "Sapanca"}`.trim();
                res = await api.get("/api/google/reviews/search", {
                  params: { query: q, limit: 40 },
                });
              }

              const score = extractGoogleScore(res.data);
              updateGCache(key, score || { rating: null, count: 0 });

              if (score && !cancelled) {
                setItems((prev) =>
                  prev.map((it) =>
                    it.id === biz.id || it.slug === biz.slug
                      ? {
                          ...it,
                          googleRating: score.rating || it.googleRating || 0,
                          googleReviews: score.count || it.googleReviews || 0,
                        }
                      : it
                  )
                );
              }
            } catch {
              updateGCache(key, { rating: null, count: 0 });
            } finally {
              inFlightRef.current.delete(key);
            }
          })
        );
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, gCache, updateGCache]);

  /* ---------- SEO / JSON-LD ---------- */

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.edogrula.org";

  const canonical = `${origin}/sapanca-bungalov-evleri`;
  const ogImage = `${origin}/og/cover-sapanca.jpg`;

  // ItemList JSON-LD
  const jsonLdItemList = useMemo(() => {
    try {
      const list = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Sapanca Bungalov Evleri",
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        itemListElement: displayedItems.slice(0, 20).map((b, i) => {
          const url = `${origin}/isletme/${encodeURIComponent(b.slug)}`;

          const ratingValue =
            b.rating > 0
              ? b.rating
              : b.googleRating > 0
              ? b.googleRating
              : undefined;

          const reviewCount =
            b.reviews > 0
              ? b.reviews
              : b.googleReviews > 0
              ? b.googleReviews
              : undefined;

          return {
            "@type": "ListItem",
            position: i + 1,
            url,
            item: {
              "@type": "LodgingBusiness",
              name: b.name,
              url,
              image: b.photo ? [b.photo] : undefined,
              telephone: b.phone || undefined,
              address: b.address
                ? {
                    "@type": "PostalAddress",
                    streetAddress: b.address,
                    addressLocality: "Sapanca",
                    addressRegion: "Sakarya",
                    addressCountry: "TR",
                  }
                : undefined,
              sameAs: [b.instagramUrl, b.website].filter(Boolean),
              aggregateRating:
                ratingValue && reviewCount
                  ? {
                      "@type": "AggregateRating",
                      ratingValue,
                      reviewCount,
                      bestRating: 5,
                      worstRating: 1,
                    }
                  : undefined,
            },
          };
        }),
      };

      return JSON.stringify(list);
    } catch {
      return "";
    }
  }, [displayedItems, origin]);

  // Breadcrumb JSON-LD
  const jsonLdBreadcrumb = useMemo(
    () =>
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Anasayfa",
            item: origin,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Sapanca Bungalov Evleri",
            item: canonical,
          },
        ],
      }),
    [origin, canonical]
  );

  // FAQ JSON-LD
  const jsonLdFAQ = useMemo(
    () =>
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Sapanca bungalov fiyatları ne kadar?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Sezona, konuma ve olanaklara göre değişir. İşletmelerle doğrudan ve komisyonsuz konuşup güncel fiyatı öğrenebilirsiniz.",
            },
          },
          {
            "@type": "Question",
            name: "Evcil hayvan kabul eden bungalov var mı?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Birçok işletme evcil dostu seçenek sunuyor. İşletme sayfalarında politika detaylarını bulabilir veya telefonla teyit edebilirsiniz.",
            },
          },
          {
            "@type": "Question",
            name: "Jakuzili, göl manzaralı ya da şömineli seçenek var mı?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Evet. Filtreleyerek ya da açıklamaları inceleyerek jakuzili, göl manzaralı veya şömineli seçenekleri bulabilirsiniz.",
            },
          },
          {
            "@type": "Question",
            name: "E-Doğrula ne yapıyor?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "E-Doğrula, işletme ile sizi doğrudan buluşturur; aracısız ve komisyonsuz iletişim kolaylığı sağlar.",
            },
          },
        ],
      }),
    []
  );

  return (
    <>
      <Helmet>
        <title>
          Sapanca Bungalov Evleri: 20+ Doğrulanmış Tesis (Aracısız) | E-Doğrula
        </title>

        <meta
          name="description"
          content="Sapanca'daki en iyi bungalovları mı arıyorsunuz? 🏡 E-Doğrula ile doğrulanmış tesislere aracısız ulaşın, komisyon ödemeyin. Güvenilir tatilin adresi!"
        />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <link rel="canonical" href={canonical} />

        {/* OpenGraph */}
        <meta property="og:title" content="Sapanca Bungalov Evleri | E-Doğrula" />
        <meta
          property="og:description"
          content="Doğrulanmış işletmeler, aracısız iletişim."
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="E-Doğrula" />
        <meta property="og:locale" content="tr_TR" />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Sapanca Bungalov Evleri | E-Doğrula" />
        <meta
          name="twitter:description"
          content="Doğrulanmış işletmeler, aracısız iletişim."
        />
        <meta name="twitter:image" content={ogImage} />

        {/* JSON-LD */}
        {jsonLdItemList && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdItemList }}
          />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdFAQ }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdBreadcrumb }}
        />
      </Helmet>

      <PageStyles />

      <div className="page-shell">
        <nav className="main-nav">
          <button className="nav-button" onClick={() => navigate("/apply")}>
            İşletmeni doğrula
          </button>
          <button className="nav-button" onClick={() => navigate("/report")}>
            Şikayet et / Rapor et
          </button>
        </nav>

        <main className="content-container">
          <header className="page-title">
            <h1>Sapanca Bungalov Evleri</h1>
            <p className="page-sub">
              E-Doğrula tarafından doğrulanmış işletmelerle aracısız ve
              komisyonsuz iletişim kurun.
            </p>
          </header>

          <section className="top-knowledge">
            <KnowledgeHeader query="Sapanca" http={api} showMedia />
          </section>

          {loading ? (
            <SkeletonList />
          ) : total === 0 && displayedItems.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {page === 1 && featured.length > 0 && (
                <section className="sponsored-section">
                  <h2 className="section-title">Öne Çıkan Tesisler</h2>
                  <div className="horizontal-scroll">
                    {featured.map((it) => (
                      <SponsoredCard key={it.id} business={it} />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <header className="results-header">
                  <div>
                    <h2 className="section-title">Tüm Sapanca Bungalovları</h2>
                    <p className="intro">
                      Sapanca’nın eşsiz doğasında, <strong> göl manzaralı</strong>{" "}
                      ya da <strong> jakuzili</strong> seçenekleriyle bungalov
                      tatilinizi planlayın. Aşağıda, E-Doğrula tarafından
                      doğrulanmış ve <strong> doğrudan iletişim</strong>{" "}
                      kurabileceğiniz tüm işletmeleri bulabilirsiniz.
                    </p>
                  </div>

                  <div className="filters">
                    <label className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={onlyVerified}
                        onChange={(e) => setOnlyVerified(e.target.checked)}
                      />
                      Sadece doğrulanmış
                    </label>

                    <div className="sort" ref={sortMenuRef}>
                      <button
                        className="sort-btn"
                        onClick={() => setSortOpen((prev) => !prev)}
                      >
                        <FaFilter />
                        <span className="ml-2">
                          Sırala:{" "}
                          <strong>
                            {sort === "rating" ? "Puan (yüksek)" : "Yorum (çok)"}
                          </strong>
                        </span>
                        <FaChevronDown className="ml-2" />
                      </button>

                      {sortOpen && (
                        <div className="sort-menu">
                          <button
                            className={`sort-item ${
                              sort === "rating" ? "active" : ""
                            }`}
                            onClick={() => {
                              setSort("rating");
                              setSortOpen(false);
                            }}
                          >
                            Puan (yüksek)
                          </button>
                          <button
                            className={`sort-item ${
                              sort === "reviews" ? "active" : ""
                            }`}
                            onClick={() => {
                              setSort("reviews");
                              setSortOpen(false);
                            }}
                          >
                            Yorum (çok)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </header>

                <div className="results-grid">
                  {displayedItems.map((b) => (
                    <ResultRow key={b.id} b={b} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <Pagination page={page} total={totalPages} onChange={setPage} />
                )}
              </section>
            </>
          )}

          <IdeasSection />
          <FAQSection />
        </main>
      </div>
    </>
  );
}

/* ================== COMPONENTS ================== */

function SponsoredCard({ business }) {
  const navigate = useNavigate();
  return (
    <div
      className="sponsored-card"
      onClick={() =>
        business.slug &&
        navigate(`/isletme/${encodeURIComponent(business.slug)}`)
      }
    >
      <div className="sponsored-image-wrapper">
        {business.photo ? (
          <img
            src={business.photo}
            alt={business.name}
            className="sponsored-image"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="sponsored-image-fallback">
            <FaBuilding />
          </div>
        )}
        <span className="sponsored-tag">Sponsorlu</span>
      </div>
      <div className="sponsored-card-content">
        <h3 className="sponsored-title">{business.name}</h3>
        <p className="sponsored-location">
          {business.address?.split(",")[0]}
        </p>
      </div>
    </div>
  );
}

function ResultRow({ b }) {
  const navigate = useNavigate();

  const onOpen = () => {
    if (b.slug) navigate(`/isletme/${encodeURIComponent(b.slug)}`);
  };

  const hasEDogrula = b.rating > 0;
  const hasGoogle = b.googleRating > 0 || b.googleReviews > 0;

  return (
    <article className="result-row">
      {/* Thumbnail */}
      <button className="thumb" onClick={onOpen} aria-label={`${b.name} işletmesini aç`}>
        {b.photo ? (
          <img
            src={b.photo}
            alt={`${b.name} bungalov`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="thumb-ph"><FaBuilding /></div>
        )}
      </button>

      <div className="meta">
        <div className="meta-top">
          {b.verified && (
            <span className="badge-verified">
              <FaCheck /> Doğrulandı
            </span>
          )}
          {hasEDogrula ? (
            <span className="badge-rating">
              <FaStar /> {b.rating.toFixed(1)}
            </span>
          ) : (
            <span className="badge-muted">
              <FaStar /> E-Doğrula değerlendirme yok
            </span>
          )}
        </div>

        <a
          href={`/isletme/${encodeURIComponent(b.slug)}`}
          onClick={(e) => {
            e.preventDefault();
            onOpen();
          }}
          className="title"
        >
          {b.name}
        </a>

        <div className="handle-type">
          {b.instagramHandle && `@${b.instagramHandle} · `}
          {b.type || "Bungalov"} · {b.address}
        </div>

        <p className="summary">{b.summary}</p>

        <div className="links">
          {b.phone && (
            <a href={`tel:${b.phone}`} className="link-btn">
              <FaPhone /> Telefon
            </a>
          )}
          {b.website && (
            <a
              href={b.website}
              target="_blank"
              rel="noreferrer noopener"
              className="link-btn"
            >
              <FaGlobe /> Web Sitesi
            </a>
          )}
          {b.instagramUrl && (
            <a
              href={b.instagramUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="link-btn"
            >
              <FaInstagram /> Instagram
            </a>
          )}
        </div>
      </div>

      <div className="gscore-col">
        <div className="gscore-card">
          <div className="gscore-top">Google</div>
          <div className="gscore-center">
            <FaStar className="gscore-star" />
            {hasGoogle ? (
              <span className="gscore-value">
                {b.googleRating > 0 ? b.googleRating.toFixed(1) : "—"}
              </span>
            ) : (
              <span className="gscore-muted">puan yok</span>
            )}
          </div>
          <div className="gscore-bottom">
            {b.googleReviews > 0 ? `${b.googleReviews} yorum` : ""}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ---------- IdeasSection ---------- */
// (Aynen korunuyor)
function IdeasSection() {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    api
      .get("/api/cms/articles/featured", {
        params: { place: "Sapanca", limit: 3 },
      })
      .then(({ data }) => {
        if (!alive) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setPosts(items);
      })
      .catch(() => setPosts([]))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const fallback = [
    {
      title: "Sapanca’da Jakuzili En İyi 7 Bungalov (2025)",
      desc:
        "Jakuzili, şömineli ve doğa içinde konaklayabileceğiniz en iyi bungalovlar.",
      to: "/blog/jakuzili-bungalovlar",
      image: "",
    },
    {
      title: "Sapanca Gölü Kenarında Görülmesi Gereken Yerler",
      desc:
        "Göl çevresi rotaları, gün batımı noktaları ve lezzet durakları.",
      to: "/blog/gol-kenari-gezilecek-yerler",
      image: "",
    },
    {
      title: "Evcil Hayvan Dostu Sapanca Konaklama Rehberi",
      desc:
        "Patili dostunuzla rahat konaklayabileceğiniz işletmeler.",
      to: "/blog/evcil-dostu-isletmeler",
      image: "",
    },
  ];

  const cards =
    posts && posts.length
      ? posts.map((p) => ({
          title: p.title,
          desc: p.excerpt || "",
          to: p.to || `/blog/${p.slug}`,
          image: p.image || "",
        }))
      : fallback;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": cards.map((c) => ({
      "@type": "Article",
      headline: c.title,
      description: c.desc,
      mainEntityOfPage: { "@type": "WebPage", "@id": c.to },
      image: c.image ? [c.image] : undefined,
      author: { "@type": "Organization", name: "E-Doğrula" },
      publisher: {
        "@type": "Organization",
        name: "E-Doğrula",
        logo: { "@type": "ImageObject", url: "/logo192.png" },
      },
    })),
  };

  return (
    <section className="ideas bottom">
      <h2 className="ideas-title">Sapanca Tatilinizi Planlayın</h2>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="ideas-grid">
        {(loading ? Array.from({ length: 3 }) : cards).map((c, i) =>
          loading ? (
            <div key={i} className="ideas-card">
              <div className="ideas-media" />
              <div className="ideas-overlay" />
              <div className="ideas-body">
                <h3 className="ideas-h3">Yükleniyor…</h3>
                <p className="ideas-p">Lütfen bekleyin.</p>
              </div>
            </div>
          ) : (
            <a key={i} className="ideas-card" href={c.to}>
              <div
                className={`ideas-media ${c.image ? "with-img" : ""}`}
                style={
                  c.image
                    ? {
                        backgroundImage: `url(${c.image})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              />
              <div className="ideas-overlay" />
              <div className="ideas-body">
                <h3 className="ideas-h3">{c.title}</h3>
                <p className="ideas-p">{c.desc}</p>
                <span className="ideas-link">Devamını Oku →</span>
              </div>
            </a>
          )
        )}
      </div>
    </section>
  );
}

/* ---------- FAQSection ---------- */
function FAQSection() {
  const faqs = [
    {
      q: "Sapanca bungalov fiyatları ne kadar?",
      a:
        "Sezona, konuma ve olanaklara göre değişir. İşletmelerle doğrudan iletişime geçerek güncel fiyat bilgisini alabilirsiniz.",
    },
    {
      q: "Evcil hayvan kabul eden bungalov var mı?",
      a:
        "Birçok işletme evcil dostu. İlgili işletme sayfasındaki politika kısmını inceleyin veya telefonla teyit edin.",
    },
    {
      q: "Jakuzili, göl manzaralı ya da şömineli seçenek var mı?",
      a:
        "Evet. Açıklamalarda belirtilir; ayrıca telefonla sormanız önerilir.",
    },
    {
      q: "E-Doğrula ne yapıyor?",
      a:
        "Aracısız, komisyonsuz bir şekilde işletme ile sizi doğrudan buluşturur.",
    },
  ];

  return (
    <section className="faq">
      <h2 className="section-title">Sıkça Sorulan Sorular</h2>
      <div className="faq-list">
        {faqs.map((f, i) => (
          <details key={i} className="faq-item">
            <summary>{f.q}</summary>
            <div className="faq-a">{f.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------- Skeleton & Empty ---------- */
function SkeletonList() {
  return (
    <div className="results-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="result-row skeleton" />
      ))}
    </div>
  );
}

function EmptyState() {
  return <div className="result-row">Sonuç bulunamadı.</div>;
}

/* ---------- KnowledgeHeader ---------- */
// (Sende olduğu gibi korunuyor, dokunmadım)
function KnowledgeHeader({ query = "Sapanca", http, showMedia = false }) {
  const [data, setData] = useState(null);
  const apiClient = http || axios;

  const strip = (s) => String(s || "").replace(/<[^>]*>/g, "");
  const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await apiClient.get(`/api/geo/knowledge`, {
          params: { q: query },
        });
        if (alive) setData(data);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [query, apiClient]);

  if (!data) return null;

  const title = strip(data.title || query);
  const subtitle = strip(data.subtitle || "");
  const summary = strip(data.summary || "");
  const wikiUrl = data.wiki_url || null;
  const gmapUrl = data.gmap_url || null;
  const coords = data.coordinates || null;
  const now = data.weather?.current_weather || null;
  const daily = data.weather?.daily || null;

  let staticMap = null;
  if (MAPS_KEY && coords?.lat != null && coords?.lng != null) {
    const { lat, lng } = coords;
    staticMap = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=12&scale=2&size=640x320&maptype=roadmap&markers=color:0x2563eb|${lat},${lng}&key=${MAPS_KEY}`;
  }

  const image = data.image || data.thumbnail || null;

  return (
    <section className={`kb ${showMedia ? "kb-has-media" : ""}`}>
      {showMedia && (
        <div className="kb-media">
          {image ? <img src={image} alt={title} /> : <div className="kb-media-ph" />}
        </div>
      )}

      {staticMap && (
        <a className="kb-map" href={gmapUrl || "#"} target="_blank" rel="noreferrer">
          <img src={staticMap} alt="Harita" />
        </a>
      )}

      <div className="kb-info">
        <h2 className="kb-title">{title}</h2>
        {subtitle && <div className="kb-sub">{subtitle}</div>}
        {summary && <p className="kb-text">{summary}</p>}
        <div className="kb-links">
          {wikiUrl && (
            <a className="kb-link" href={wikiUrl} target="_blank" rel="noreferrer">
              Wikipedia
            </a>
          )}
          {gmapUrl && (
            <a className="kb-link" href={gmapUrl} target="_blank" rel="noreferrer">
              Haritada gör
            </a>
          )}
        </div>
      </div>

      {now && (
        <div className="kb-weather">
          <div className="kb-weather-card">
            <div className="kb-weather-label">Şu an hava</div>
            <div className="kb-weather-temp">{Math.round(now.temperature)}°</div>
            <div className="kb-weather-wind">
              rüzgâr {Math.round(now.windspeed)} km/s
            </div>
          </div>

          {daily?.temperature_2m_max && daily?.temperature_2m_min && (
            <div className="kb-forecast">
              {daily.time?.slice(0, 3).map((_, i) => (
                <div key={i} className="kb-forecast-item">
                  <div className="kb-forecast-day">
                    {new Date(daily.time[i]).toLocaleDateString("tr-TR", {
                      weekday: "short",
                    })}
                  </div>
                  <div className="kb-forecast-temps">
                    {Math.round(daily.temperature_2m_max[i])}° /{" "}
                    {Math.round(daily.temperature_2m_min[i])}°
                  </div>
                </div>
              ))}
            </div>
          )}

          {gmapUrl && (
            <a className="kb-route" href={gmapUrl} target="_blank" rel="noreferrer">
              Yol tarifi
            </a>
          )}
        </div>
      )}
    </section>
  );
}

/* ================== STYLES ================== */
function PageStyles() {
  return (
    <style>{`
      :root{
        --bg:#f8fafc; --card:#fff; --fg:#0f172a; --muted:#64748b;
        --border:#e2e8f0; --brand:#2563eb; --green:#16a34a; --yellow:#f59e0b; --ink:#1f2937;
      }
      .page-shell{ background:var(--bg); color:var(--fg); min-height:100vh; }
      .main-nav{ position:sticky; top:0; z-index:10; background:rgba(248,250,252,.85);
        backdrop-filter:blur(8px); padding:12px 24px; border-bottom:1px solid var(--border);
        display:flex; justify-content:flex-end; gap:12px; }
      .nav-button{ background:var(--card); border:1px solid var(--border); padding:8px 16px;
        border-radius:999px; font-weight:700; cursor:pointer; }
      .nav-button:hover{ background:#f1f5f9; border-color:#cbd5e1; }

      .content-container{ max-width:1200px; margin-left:clamp(14px, 3.2vw, 32px); margin-right:auto; padding:28px 0 96px; }

      .page-title{ margin-bottom:12px; }
      .page-title h1{ font-size:28px; font-weight:900; margin:0; color:#0f172a; }
      .page-sub{ margin:6px 0 0; color:#334155; }

      .intro{ margin:6px 0 0; color:#334155; max-width:780px; }

      .section-title{ font-size:22px; font-weight:800; color:#1e293b; margin:12px 0; }

      /* Ideas */
      .ideas{ margin:26px 0 6px; }
      .ideas.bottom{ margin-top:36px; }
      .ideas-title{ font-size:20px; font-weight:800; color:#1e293b; margin:6px 0 12px; }
      .ideas-grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap:16px; }
      .ideas-card{ position:relative; display:block; border-radius:16px; overflow:hidden; text-decoration:none; color:inherit;
        border:1px solid var(--border); background:#f8fbff; transition:transform .20s, box-shadow .20s; }
      .ideas-card:hover{ transform:translateY(-4px); box-shadow:0 16px 32px rgba(0,0,0,.08); }
      .ideas-media{ height:160px; background:linear-gradient(135deg,#e2ecff,#f3f7ff); }
      .ideas-media.with-img{ background-color:#eaeef7; }
      .ideas-overlay{ position:absolute; inset:0; background:linear-gradient(180deg,transparent 40%, rgba(0,0,0,.55) 100%); pointer-events:none; }
      .ideas-body{ position:absolute; left:0; right:0; bottom:0; padding:12px; color:#fff; }
      .ideas-h3{ margin:0 0 6px; font-size:16px; font-weight:900; text-shadow:0 1px 2px rgba(0,0,0,.35); }
      .ideas-p{ margin:0 0 10px; font-size:13px; opacity:.95; }
      .ideas-link{ font-weight:800; }

      /* Sponsorlar */
      .sponsored-section{ margin:6px 0 24px; }
      .horizontal-scroll{ display:flex; gap:18px; overflow-x:auto; padding:4px 0 16px; -webkit-overflow-scrolling:touch; }
      .horizontal-scroll::-webkit-scrollbar{ display:none; }
      .horizontal-scroll{ scrollbar-width:none; }
      .sponsored-card{ flex:0 0 320px; background:var(--card); border-radius:16px; border:1px solid var(--border);
        overflow:hidden; cursor:pointer; transition: transform .2s, box-shadow .2s; }
      .sponsored-card:hover{ transform:translateY(-4px); box-shadow:0 14px 28px rgba(0,0,0,.08); }
      .sponsored-image-wrapper{ height:180px; position:relative; background:#eef2f7; }
      .sponsored-image{ width:100%; height:100%; object-fit:cover; }
      .sponsored-image-fallback{ width:100%; height:100%; display:grid; place-items:center; font-size:34px; color:#64748b; }
      .sponsored-tag{ position:absolute; top:10px; left:10px; background:rgba(0,0,0,.6); color:#fff; padding:4px 8px; border-radius:6px;
        font-size:11px; font-weight:800; letter-spacing:.2px; }
      .sponsored-card-content{ padding:12px; }
      .sponsored-title{ font-size:17px; font-weight:800; margin:0 0 4px; }
      .sponsored-location{ font-size:14px; color:#64748b; margin:0; }

      /* Filtre barı */
      .results-header{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:12px 16px;
        border-radius:14px; border:1px solid var(--border); background:var(--card); margin-bottom:18px; }
      .filters{ display:flex; align-items:center; gap:16px; position:relative; }
      .filter-checkbox{ display:inline-flex; gap:8px; align-items:center; cursor:pointer; font-size:14px; }
      .sort{ position:relative; }
      .sort-btn{ display:inline-flex; align-items:center; gap:8px; background:#fff; border:1px solid var(--border);
        padding:8px 12px; border-radius:12px; font-weight:700; }
      .sort-menu{ position:absolute; right:0; top:42px; z-index:20; width:220px; background:#fff; border:1px solid var(--border);
        border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.08); overflow:hidden; }
      .sort-item{ display:block; width:100%; text-align:left; padding:10px 12px; background:#fff; border:0; font-size:14px; }
      .sort-item:hover{ background:#f8fafc; }
      .sort-item.active{ background:#eef2f7; font-weight:800; }

      /* Sonuç listesi */
      .results-grid{ display:grid; gap:16px; }
      .result-row{ display:grid; grid-template-columns: 180px 1fr 160px; gap:16px; background:var(--card); padding:14px;
        border-radius:16px; border:1px solid var(--border); transition: box-shadow .2s; }
      .result-row:hover{ box-shadow:0 10px 24px rgba(0,0,0,.06); }
      .result-row.skeleton{ height:128px; background:linear-gradient(90deg,#f3f4f6,#eef2f7,#f3f4f6);
        background-size:200% 100%; animation:shimmer 1.2s infinite; }
      @keyframes shimmer{ 0%{background-position:0 0} 100%{background-position:-200% 0} }

      .thumb{ width:180px; height:140px; border-radius:12px; overflow:hidden; border:1px solid var(--border); background:#eef2f7; cursor:pointer; padding:0; }
      .thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
      .thumb-ph{ width:100%; height:100%; display:grid; place-items:center; color:#64748b; font-size:28px; }

      .meta-top{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }
      .badge-verified{ display:inline-flex; gap:6px; align-items:center; color:#16a34a; font-weight:900; }
      .badge-rating{ display:inline-flex; gap:6px; align-items:center; color:#f59e0b; font-weight:900; }
      .badge-muted{ display:inline-flex; gap:6px; align-items:center; color:#64748b; }

      .title{ font-size:18px; font-weight:800; color:#2563eb; text-decoration:none; display:block; margin:0 0 4px; }
      .title:hover{ text-decoration:underline; }
      .handle-type{ font-size:13px; color:#64748b; }
      .summary{ font-size:14px; color:#334155; line-height:1.55; margin:8px 0 10px; }

      .links{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px; }
      .link-btn{ display:inline-flex; gap:8px; align-items:center; background:#f1f5f9; border:1px solid transparent;
        padding:6px 12px; border-radius:8px; font-size:14px; font-weight:700; color:#64748b; text-decoration:none;
        transition:.2s; }
      .link-btn:hover{ background:#e2e8f0; color:#0f172a; }

      /* Google Score Kartı */
      .gscore-col{ display:flex; align-items:center; justify-content:flex-end; }
      .gscore-card{ width:160px; border:1px solid var(--border); border-radius:14px; padding:10px; text-align:center; }
      .gscore-top{ font-size:12px; color:#64748b; margin-bottom:6px; }
      .gscore-center{ display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:4px; }
      .gscore-star{ color:#f59e0b; }
      .gscore-value{ font-weight:900; font-size:18px; }
      .gscore-muted{ color:#64748b; font-weight:700; }
      .gscore-bottom{ font-size:12px; color:#64748b; }

      /* Üst bilgi bloğu */
      .top-knowledge{ margin-bottom:18px; }
      .kb{ display:grid; grid-template-columns: 2fr 2fr 1.2fr; gap:16px; align-items:stretch;
        border:1px solid var(--border); background:var(--card); border-radius:16px; padding:16px; }
      .kb-has-media{ grid-template-columns: 1.5fr 1.5fr 1.2fr; }
      .kb-media{ border:1px solid var(--border); border-radius:14px; overflow:hidden;
        background:linear-gradient(180deg,#f3f6ff,#fff); min-height:180px; }
      .kb-media img{ width:100%; height:100%; object-fit:cover; display:block; }
      .kb-media-ph{ width:100%; height:100%; min-height:180px;
        background:repeating-linear-gradient(45deg,#eef2ff,#eef2ff 10px,#f8fafc 10px,#f8fafc 20px); }
      .kb-map{ border:1px solid var(--border); border-radius:14px; overflow:hidden; display:block; background:#eef2f7; }
      .kb-map img{ width:100%; height:100%; object-fit:cover; display:block; }
      .kb-info{ border:1px solid var(--border); border-radius:14px; padding:12px; }
      .kb-title{ font-size:22px; font-weight:800; color:#1e293b; margin:0; }
      .kb-sub{ font-size:12px; color:#64748b; margin-top:2px; }
      .kb-text{ margin-top:10px; color:#334155; line-height:1.55; }
      .kb-links{ display:flex; gap:14px; margin-top:10px; }
      .kb-link{ color:#2563eb; text-decoration:none; font-weight:700; }
      .kb-link:hover{ text-decoration:underline; }
      .kb-weather{ display:flex; flex-direction:column; gap:12px; }
      .kb-weather-card{ text-align:center; border:1px solid var(--border); border-radius:14px; padding:10px; }
      .kb-weather-label{ font-size:12px; color:#64748b; }
      .kb-weather-temp{ font-size:32px; font-weight:900; }
      .kb-weather-wind{ font-size:12px; color:#64748b; }
      .kb-forecast{ display:grid; grid-template-columns: repeat(3,1fr); gap:8px; }
      .kb-forecast-item{ border:1px solid var(--border); border-radius:10px; padding:8px; text-align:center; font-weight:700; }
      .kb-forecast-day{ font-size:12px; color:#64748b; }
      .kb-forecast-temps{ font-size:14px; }

      .kb-route{ display:block; text-align:center; font-weight:800; border:1px solid var(--border);
        border-radius:10px; padding:10px; text-decoration:none; color:#0f172a; background:#fff; }

      /* FAQ */
      .faq{ margin-top:26px; }
      .faq-list{ display:grid; gap:10px; }
      .faq-item{ border:1px solid var(--border); border-radius:12px; background:#fff; padding:10px 12px; }
      .faq-item summary{ cursor:pointer; font-weight:800; }
      .faq-a{ color:#334155; padding-top:6px; }

      /* Pager */
      .pager{ margin:22px 0 0; display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:center; }
      .pager-btn{ padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:#fff; cursor:pointer; }
      .pager-btn[disabled]{ opacity:.6; cursor:not-allowed; }
      .pager-num{ width:40px; height:40px; border-radius:999px; border:1px solid var(--border); background:#fff; cursor:pointer; }
      .pager-num.active{ background:#1f2937; color:#fff; border-color:#1f2937; }
      .pager-gap{ padding:0 4px; color:#64748b; }

      @media (max-width: 980px){
        .ideas-grid{ grid-template-columns: 1fr; }
        .kb, .kb-has-media{ grid-template-columns: 1fr; }
        .result-row{ grid-template-columns: 1fr; }
        .thumb{ width:100%; height:180px; }
        .gscore-col{ justify-content:flex-start; }
      }
    `}</style>
  );
}

/* ---------- Pagination ---------- */
function Pagination({ page, total, onChange }) {
  const win = 2;
  const pages = [];

  for (let p = 1; p <= total; p++) {
    if (
      p === 1 ||
      p === total ||
      (p >= page - win && p <= page + win)
    ) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="pager" role="navigation" aria-label="Sayfalama">
      <button
        className="pager-btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        ‹ Önceki
      </button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="pager-gap">…</span>
        ) : (
          <button
            key={p}
            className={`pager-num ${p === page ? "active" : ""}`}
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        className="pager-btn"
        disabled={page >= total}
        onClick={() => onChange(page + 1)}
      >
        Sonraki ›
      </button>
    </div>
  );
}
