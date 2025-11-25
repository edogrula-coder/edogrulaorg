// frontend/src/pages/Explore.jsx — Ultra Pro Explore/Search
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/* ---------------- helpers ---------------- */
function useQP(name, def = "") {
  const { search } = useLocation();
  return useMemo(
    () => new URLSearchParams(search).get(name) || def,
    [search, name, def]
  );
}

function getDomain(u) {
  try {
    return new URL(u.startsWith("http") ? u : `https://${u}`)
      .hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getFavicon(u) {
  const d = getDomain(u);
  return d
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`
    : "";
}

// ✅ API kökü normalize: /api sonunu kırp, protokol yoksa ekle
function normalizeApiRoot(raw) {
  let t = String(raw || "").trim();
  if (!t) return ""; // empty => same-origin
  if (/^:\d+$/.test(t)) t = `http://localhost${t}`;
  else if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  t = t.replace(/\/+$/, "");
  t = t.replace(/\/api(?:\/v\d+)?$/i, "");
  return t;
}

const RAW = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_ROOT || "";
const API_ROOT = normalizeApiRoot(RAW);
const api = (p) => `${API_ROOT}${p.startsWith("/") ? p : `/${p}`}`;

// tab güvenliği
const TABS = ["all", "images", "videos", "news"];
const safeTab = (t) => (TABS.includes(t) ? t : "all");

/** Basit mock (API dönmezse) */
function mockData(query, tab) {
  if (/sapanca|bungalov/i.test(query) && (tab === "all" || tab === "images")) {
    return {
      type: tab === "images" ? "images" : "web",
      related: ["sapanca bungalov", "kartepe bungalov", "kocaeli bungalov"],
      items:
        tab === "images"
          ? Array.from({ length: 12 }).map((_, i) => ({
              type: "image",
              src: `https://images.unsplash.com/photo-150569${(i + 1000)
                .toString()
                .slice(-4)}?q=80&w=800&auto=format&fit=crop`,
              alt: "Bungalov",
              pageUrl: "/isletme/sapanca-bungalov",
            }))
          : [
              {
                type: "web",
                title: "Sapanca Konaklama Rehberi",
                url: "/isletme/sapanca-konaklama-rehberi",
                snippet:
                  "Sapanca bungalovları 2025 fiyatları, konum ve imkanlar. En uygun fiyatlarla hemen rezervasyon yapın.",
                breadcrumbs: ["edogrula.org"],
              },
            ],
    };
  }
  return {
    type: "web",
    related: ["instagram doğrulama", "telefon sorgu"],
    items: [],
  };
}

/* ---------------- page ---------------- */
export default function Explore() {
  const navigate = useNavigate();
  const qParam = useQP("q", "");
  const tabParam = safeTab(useQP("tab", "all"));

  const [query, setQuery] = useState(qParam);
  const [tab, setTab] = useState(tabParam);

  const [results, setResults] = useState({
    type: "web",
    related: [],
    items: [],
  });
  const [loading, setLoading] = useState(false);
  const [shadow, setShadow] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [error, setError] = useState("");

  const inputRef = useRef(null);
  const ctrlRef = useRef(null);

  // sabit öneriler
  const suggestions = useMemo(
    () => [
      "sapanca bungalov evleri",
      "kartepe bungalov evleri",
      "kocaeli bungalov evleri",
      "@kulesapanca",
      "kule-sapanca.com",
      "dolandırıcı işletme ihbarı",
    ],
    []
  );

  useEffect(() => setQuery(qParam), [qParam]);
  useEffect(() => setTab(tabParam), [tabParam]);

  useEffect(() => {
    const onScroll = () => setShadow(window.scrollY > 4);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);

    onScroll();
    window.addEventListener("scroll", onScroll);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // q + tab URL’den değişince çalıştır
  useEffect(() => {
    run(qParam, tabParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam, tabParam]);

  const run = async (q = qParam, t = tabParam) => {
    const qClean = String(q || "").trim();
    const tClean = safeTab(t || "all");
    const type = tClean === "all" ? "web" : tClean;

    // boş query => boş ekran (gereksiz fetch yok)
    if (!qClean) {
      setResults({ type, related: [], items: [] });
      setError("");
      setLoading(false);
      return;
    }

    // offline => mock + mesaj
    if (offline) {
      setResults(mockData(qClean, tClean));
      setError("Çevrimdışısınız. Sonuçlar önbellek / mock olabilir.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    // önceki isteği iptal et
    ctrlRef.current?.abort?.();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    try {
      const url = api(
        `/api/explore?q=${encodeURIComponent(qClean)}&tab=${encodeURIComponent(type)}`
      );

      const r = await fetch(url, {
        headers: { "x-edogrula-client": "web" },
        signal: ctrl.signal,
      });

      if (!r.ok) {
        const data = mockData(qClean, tClean);
        setResults(data);
        if (r.status >= 400) setError("Sonuçlar getirilemedi.");
        return;
      }

      // 204 No Content
      if (r.status === 204) {
        setResults({ type, related: [], items: [] });
        return;
      }

      const data = await r.json();

      const items =
        data?.items ||
        data?.results ||
        data?.businesses ||
        data?.data?.items ||
        [];

      setResults({
        type: (data?.type || type || "web").toLowerCase(),
        related: data?.related || data?.suggestions || [],
        items: Array.isArray(items) ? items : [],
      });
    } catch (e) {
      if (e?.name === "AbortError") return;
      setResults(mockData(qClean, tClean));
      setError("Ağ hatası veya CORS engeli.");
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    const v = query.trim();
    if (!v) return;
    navigate(`/ara?q=${encodeURIComponent(v)}&tab=${encodeURIComponent(tab)}`);
  };

  const onKey = (e) => e.key === "Enter" && submit();
  const gotoTab = (k) =>
    navigate(
      `/ara?q=${encodeURIComponent(query || qParam)}&tab=${encodeURIComponent(
        safeTab(k)
      )}`
    );

  // SPA içi/dışı link açma (ctrl/cmd click serbest)
  const open = (e, url) => {
    if (!url) return;
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;

    const isLocal = url.startsWith("/");
    if (isLocal) {
      e.preventDefault();
      navigate(url);
    }
  };

  /* ---------------- render blocks ---------------- */
  const renderWeb = (list = []) => (
    <section className="serp">
      {list.map((r, i) => (
        <article key={`${r._id || r.url || i}`} className="serpItem">
          <a
            className="title"
            href={r.url}
            onClick={(e) => open(e, r.url)}
            title={r.title}
          >
            {r.title || r.name || getDomain(r.url) || "Sonuç"}
          </a>
          <div className="url">
            {getFavicon(r.url) && (
              <img
                src={getFavicon(r.url)}
                alt=""
                width={16}
                height={16}
                style={{ verticalAlign: "-2px", marginRight: 6 }}
              />
            )}
            {getDomain(r.url)}
          </div>
          {r.breadcrumbs && (
            <div className="crumbs">{(r.breadcrumbs || []).join(" › ")}</div>
          )}
          {r.publishedAt && (
            <div className="meta">
              {new Date(r.publishedAt).toLocaleDateString("tr-TR")}
            </div>
          )}
          {r.snippet && <p className="snippet">{String(r.snippet).trim()}</p>}
        </article>
      ))}

      {!loading && list.length === 0 && (
        <div className="empty">
          <div className="h">Sonuç bulunamadı</div>
          <div className="m">Farklı bir anahtar kelime deneyin.</div>
          <button className="btn ghost" onClick={() => run()}>
            Yenile
          </button>
        </div>
      )}
    </section>
  );

  const renderImages = (list = []) => (
    <section className="imagesGrid">
      {list.map((it, i) => (
        <a
          key={`${it.src || it.url || i}`}
          className="imgCard"
          href={it.pageUrl || it.url || it.src}
          onClick={(e) => open(e, it.pageUrl || it.url || it.src)}
          title={it.alt || it.title || "Görsel"}
        >
          {/* eslint-disable-next-line */}
          <img src={it.src || it.url} alt={it.alt || ""} loading="lazy" decoding="async" />
        </a>
      ))}
      {!loading && list.length === 0 && (
        <div className="empty">
          <div className="h">Görsel bulunamadı</div>
          <div className="m">Daha spesifik bir arama deneyin.</div>
        </div>
      )}
    </section>
  );

  const renderVideos = (list = []) => (
    <section className="videoList">
      {list.map((v, i) => (
        <a
          key={`${v.url || v.title || i}`}
          className="videoRow"
          href={v.url}
          onClick={(e) => open(e, v.url)}
          title={v.title}
        >
          <div className="thumb">
            {/* eslint-disable-next-line */}
            <img src={v.thumbnail} alt="" loading="lazy" decoding="async" />
            {v.duration && <span className="dur">{v.duration}</span>}
          </div>
          <div className="vmeta">
            <div className="vtitle">{v.title}</div>
            <div className="vsite">
              {getFavicon(v.url) && (
                <img
                  src={getFavicon(v.url)}
                  alt=""
                  width={14}
                  height={14}
                  style={{ verticalAlign: "-2px", marginRight: 6 }}
                />
              )}
              {getDomain(v.url)}
            </div>
            {v.publishedAt && (
              <div className="vtime">
                {new Date(v.publishedAt).toLocaleDateString("tr-TR")}
              </div>
            )}
            {v.snippet && <div className="vsnip">{v.snippet}</div>}
          </div>
        </a>
      ))}
      {!loading && list.length === 0 && (
        <div className="empty">
          <div className="h">Video bulunamadı</div>
        </div>
      )}
    </section>
  );

  const renderNews = (list = []) => (
    <section className="newsList">
      {list.map((n, i) => (
        <a
          key={`${n.url || n.title || i}`}
          className="newsRow"
          href={n.url}
          onClick={(e) => open(e, n.url)}
          title={n.title}
        >
          <div className="nleft">
            <div className="ntitle">{n.title}</div>
            <div className="nmeta">
              {getDomain(n.url)}
              {n.publishedAt
                ? ` • ${new Date(n.publishedAt).toLocaleString("tr-TR")}`
                : ""}
            </div>
            {n.snippet && <div className="nsnip">{n.snippet}</div>}
          </div>
          {n.image && (
            <div className="nthumb">
              {/* eslint-disable-next-line */}
              <img src={n.image} alt="" loading="lazy" decoding="async" />
            </div>
          )}
        </a>
      ))}
      {!loading && list.length === 0 && (
        <div className="empty">
          <div className="h">Haber bulunamadı</div>
        </div>
      )}
    </section>
  );

  const body = useMemo(() => {
    const t = (results.type || tab).toLowerCase();
    const items = results.items || [];
    if (t === "images") return renderImages(items);
    if (t === "videos") return renderVideos(items);
    if (t === "news") return renderNews(items);
    return renderWeb(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, tab, loading]);

  const resultCount = (results.items || []).length;

  return (
    <div className="xp-page">
      <style>{css}</style>

      {/* header */}
      <header className={`xp-header ${shadow ? "withShadow" : ""}`}>
        <div className="xp-head-inner">
          <a href="/" className="xp-logo" aria-label="E-Doğrula">
            {/* eslint-disable-next-line */}
            <img src="/logo.png" alt="E-Doğrula" />
          </a>

          <div className="xp-search" role="search">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Aramak için yazın…"
              aria-label="Arama"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                className="icon ghost"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Temizle"
                title="Temizle"
              >
                ✕
              </button>
            )}
            <button className="btn solid" onClick={submit} aria-label="Ara">
              Sorgula
            </button>
          </div>

          <nav className="xp-tabs" aria-label="Arama sekmeleri">
            <button className={`pill ${tab === "all" ? "sel" : ""}`} onClick={() => gotoTab("all")}>
              Tümü
            </button>
            <button className={`pill ${tab === "images" ? "sel" : ""}`} onClick={() => gotoTab("images")}>
              Görseller
            </button>
            <button className={`pill ${tab === "videos" ? "sel" : ""}`} onClick={() => gotoTab("videos")}>
              Videolar
            </button>
            <button className={`pill ${tab === "news" ? "sel" : ""}`} onClick={() => gotoTab("news")}>
              Haberler
            </button>
          </nav>
        </div>

        {offline && (
          <div className="offline" role="status">
            Çevrimdışısınız — sonuçlar güncellenemeyebilir.
          </div>
        )}
      </header>

      {/* layout: sol öneriler + sonuç alanı */}
      <div className="xp-container two">
        <aside className="rail left">
          <section className="card">
            <div className="card-head">Öneriler</div>
            <ul className="list">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    className="row"
                    onClick={() =>
                      navigate(`/ara?q=${encodeURIComponent(s)}&tab=all`)
                    }
                  >
                    <span className="i">🔎</span>
                    <span>{s}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {!!(results.related || []).length && (
            <section className="card" style={{ marginTop: 12 }}>
              <div className="card-head">İlgili aramalar</div>
              <ul className="list">
                {(results.related || []).slice(0, 10).map((s, i) => (
                  <li key={`rel-${i}`}>
                    <button
                      className="row"
                      onClick={() =>
                        navigate(
                          `/ara?q=${encodeURIComponent(s)}&tab=${tab}`
                        )
                      }
                    >
                      <span className="i">↗</span>
                      <span>{s}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <main className="xp-main">
          {/* results top bar */}
          {!loading && !error && qParam.trim() && (
            <div className="resultBar">
              <b>“{qParam}”</b> araması • {resultCount} sonuç
              {results.type && results.type !== "web" ? ` • ${results.type}` : ""}
            </div>
          )}

          {/* loader */}
          {loading && (
            <div className="skeletons">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="sk-row">
                  <div className="sk-title shimmer" />
                  <div className="sk-meta shimmer" />
                  <div className="sk-snippet shimmer" />
                </div>
              ))}
            </div>
          )}

          {/* hata */}
          {!loading && error && (
            <div className="empty" style={{ color: "#b91c1c" }}>
              <div className="h">Bir şeyler ters gitti</div>
              <div className="m">{error}</div>
              <button className="btn ghost" onClick={() => run()}>
                Yenile
              </button>
            </div>
          )}

          {/* sonuçlar */}
          {!loading && !error && body}
        </main>
      </div>

      <button
        className="toTop"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Başa dön"
        title="Başa dön"
      >
        ↑
      </button>
    </div>
  );
}

/* ---------------- styles ---------------- */
const css = `
:root{
  --bg: var(--bg, #ffffff);
  --card: var(--card, #ffffff);
  --fg: var(--fg, #0f172a);
  --fg-2: var(--fg-2, #24324a);
  --muted: var(--muted, #f1f5f9);
  --border: var(--border, #e5e7eb);
  --brand: var(--brand, #2d8cf0);
}

.xp-page{
  min-height:100vh;background:var(--bg);color:var(--fg);
  font-family:Inter, Segoe UI, Tahoma, sans-serif
}

.btn{cursor:pointer;transition:.2s}
.btn.solid{
  background:var(--brand);color:#fff;border:none;border-radius:999px;
  padding:10px 16px;font-weight:900;letter-spacing:.2px
}
.btn.ghost{
  background:var(--card);color:var(--fg);
  border:1px solid var(--border);border-radius:10px;padding:8px 10px
}
.icon{
  border:1px solid var(--border);border-radius:10px;background:var(--card);padding:8px 10px
}

.xp-header{
  position:sticky;top:0;z-index:20;
  backdrop-filter:saturate(160%) blur(8px);
  background:color-mix(in oklab, var(--bg) 80%, transparent);
  border-bottom:1px solid color-mix(in oklab, var(--border) 70%, transparent)
}
.xp-header.withShadow{box-shadow:0 8px 24px rgba(0,0,0,.08)}
.xp-head-inner{
  max-width:1100px;margin:0 auto;padding:12px 14px;
  display:grid;grid-template-columns:160px 1fr auto;gap:12px;align-items:center
}
.xp-logo img{height:38px}

.xp-search{display:flex;align-items:center;gap:8px}
.xp-search input{
  flex:1;height:44px;border-radius:999px;border:1px solid var(--border);
  background:var(--card);color:var(--fg);padding:0 16px;outline:none
}
.xp-search input:focus{
  border-color:#94a3b8;box-shadow:0 0 0 3px rgba(148,163,184,.25)
}

.xp-tabs{display:flex;gap:8px;align-items:center}
.pill{
  background:var(--card);border:1px solid var(--border);border-radius:999px;
  padding:8px 12px;font-weight:900;cursor:pointer
}
.pill.sel{background:var(--brand);color:#fff;border-color:var(--brand)}

.offline{
  max-width:1100px;margin:0 auto;padding:8px 14px 12px;
  color:#ad3b12;background:#fff7ed;border-top:1px solid #fed7aa
}

.xp-container.two{
  max-width:1100px;margin:14px auto;padding:0 12px;
  display:grid;gap:16px;grid-template-columns:260px minmax(0,1fr)
}
.rail .card{
  border:1px solid var(--border);background:var(--card);border-radius:14px;
  box-shadow:0 8px 24px rgba(0,0,0,.04);overflow:hidden
}
.card-head{
  padding:12px 14px;border-bottom:1px solid var(--border);font-weight:900
}
.list{margin:0;padding:0;list-style:none}
.list li{border-bottom:1px solid var(--border)}
.row{
  width:100%;display:flex;gap:10px;align-items:center;justify-content:flex-start;
  padding:10px 12px;background:transparent;border:0;text-align:left;cursor:pointer;color:var(--fg)
}
.row:hover{background:color-mix(in oklab, var(--muted) 60%, transparent)}
.row .i{width:18px;text-align:center;opacity:.8}

/* results bar */
.resultBar{
  position:sticky; top:66px; z-index:2;
  background:var(--card); border:1px dashed var(--border);
  border-radius:12px; padding:8px 10px; margin-bottom:10px;
  font-size:13px; color:var(--fg-2); font-weight:700;
}

/* Serp */
.serp{display:flex;flex-direction:column;gap:16px}
.serpItem{padding:10px 4px;border-bottom:1px solid #f1f5f9}
.serpItem .title{font-size:18px;font-weight:900;text-decoration:none;color:#0f172a}
.serpItem .title:hover{text-decoration:underline}
.serpItem .url{color:#16a34a;font-weight:800;margin-top:2px}
.serpItem .crumbs{color:#64748b;font-size:12px;margin-top:2px}
.serpItem .meta{color:#64748b;font-size:12px;margin-top:2px}
.serpItem .snippet{color:#334155;margin-top:6px;line-height:1.6}

/* Images */
.imagesGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.imgCard{
  display:block;border-radius:12px;overflow:hidden;border:1px solid var(--border);background:#fff;
  transition:transform .12s ease, box-shadow .12s ease
}
.imgCard img{width:100%;height:100%;object-fit:cover;aspect-ratio:4/3}
.imgCard:hover{transform:translateY(-1px);box-shadow:0 10px 30px rgba(0,0,0,.06)}

/* Videos */
.videoList{display:flex;flex-direction:column;gap:12px}
.videoRow{
  display:grid;grid-template-columns:180px 1fr;gap:12px;text-decoration:none;
  border:1px solid var(--border);border-radius:14px;overflow:hidden;background:#fff;color:inherit
}
.videoRow:hover{box-shadow:0 10px 30px rgba(0,0,0,.06)}
.videoRow .thumb{position:relative;background:#f3f4f6}
.videoRow .thumb img{width:100%;height:100%;object-fit:cover;aspect-ratio:16/9}
.videoRow .thumb .dur{
  position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.7);color:#fff;border-radius:6px;padding:2px 6px;font-size:12px
}
.vmeta{padding:8px 10px}
.vtitle{font-weight:900;margin-bottom:4px}
.vsite{color:#16a34a;font-weight:800}
.vtime{color:#64748b;font-size:12px;margin-top:2px}
.vsnip{color:#334155;margin-top:6px}

/* News */
.newsList{display:flex;flex-direction:column;gap:12px}
.newsRow{
  display:grid;grid-template-columns:1fr 160px;gap:12px;text-decoration:none;
  border:1px solid var(--border);border-radius:14px;overflow:hidden;background:#fff;color:inherit
}
.newsRow:hover{box-shadow:0 10px 30px rgba(0,0,0,.06)}
.nthumb img{width:100%;height:100%;object-fit:cover;aspect-ratio:4/3}
.ntitle{font-weight:900;margin-bottom:4px}
.nmeta{color:#64748b;font-size:12px}
.nsnip{color:#334155;margin-top:6px}

/* Skeleton */
.skeletons .sk-row{
  border:1px solid var(--border);background:var(--card);border-radius:14px;padding:14px;margin-bottom:10px
}
.shimmer{
  background:linear-gradient(90deg, rgba(0,0,0,.04), rgba(0,0,0,.08), rgba(0,0,0,.04));
  background-size:200% 100%;animation:sh 1.1s infinite linear;border-radius:8px
}
.sk-title{height:18px;width:60%;margin-bottom:8px}
.sk-meta{height:12px;width:30%}
.sk-snippet{height:42px;width:90%;margin-top:10px}
@keyframes sh{0%{background-position:0 0}100%{background-position:200% 0}}

/* Empty */
.empty{display:grid;place-items:center;padding:48px 0;color:#475569}
.empty .h{font-weight:900;margin-bottom:4px}
.empty .m{margin-bottom:10px}

.toTop{
  position:fixed;right:18px;bottom:18px;border:1px solid var(--border);
  background:var(--card);color:var(--fg);width:40px;height:40px;border-radius:50%;
  cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.12)
}

@media (max-width:1200px){
  .imagesGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width: 980px){
  .xp-head-inner{grid-template-columns:140px 1fr;grid-template-rows:auto auto}
  .xp-tabs{grid-column:1/3;justify-content:center}
  .xp-container.two{grid-template-columns:minmax(0,1fr);max-width:900px}
  .rail.left{order:2}
  .xp-main{order:1}
  .videoRow{grid-template-columns:1fr}
  .newsRow{grid-template-columns:1fr}
  .resultBar{top:116px}
}
`;
