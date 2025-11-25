import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

export default function KnowledgeHeader({
  query = "Sapanca",
  http,
  className = "",
  showSkeleton = false, // eski davranışı bozmamak için default false
}) {
  const api = useMemo(() => http || axios, [http]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // küçük client cache: aynı query tekrarında 30 sn içinde fetch etme
  const cacheRef = useRef(new Map()); // key -> { ts, val }
  const CACHE_TTL = 30_000;

  useEffect(() => {
    const q = String(query || "").trim() || "Sapanca";

    // cache hit?
    const hit = cacheRef.current.get(q);
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      setData(hit.val);
      return;
    }

    const controller = new AbortController();
    let alive = true;

    const endpoint = getEndpointFor(api, "/geo/knowledge");

    setLoading(true);
    (async () => {
      try {
        const res = await api.get(endpoint, {
          params: { q },
          signal: controller.signal,
        });
        if (!alive) return;
        cacheRef.current.set(q, { ts: Date.now(), val: res.data });
        setData(res.data);
      } catch (e) {
        // prod’da sessiz, dev’de küçük log
        if (alive && import.meta?.env?.DEV) {
          console.warn("[KnowledgeHeader] fetch failed:", e?.message);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [api, query]);

  if (!data) {
    if (!showSkeleton || !loading) return null;
    return (
      <section
        className={`kb mx-auto mb-6 rounded-2xl border border-gray-200 p-4 lg:p-6 ${className}`}
      >
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-48 rounded bg-gray-100" />
          <div className="h-4 w-32 rounded bg-gray-100" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-5/6 rounded bg-gray-100" />
        </div>
      </section>
    );
  }

  const { title, subtitle, summary, wiki_url, gmap_url, weather } = data || {};
  const now = weather?.current_weather;

  return (
    <section
      className={`kb mx-auto mb-6 rounded-2xl border border-gray-200 p-4 lg:p-6 ${className}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold">{title || query}</h1>

          {subtitle && (
            <div className="text-sm text-gray-500">{subtitle}</div>
          )}

          {summary && (
            <p className="mt-2 text-gray-700 leading-relaxed">
              {summary}
            </p>
          )}

          <div className="mt-3 flex gap-4 text-sm">
            {wiki_url && (
              <a
                className="text-blue-600 hover:underline"
                href={wiki_url}
                target="_blank"
                rel="noreferrer"
              >
                Wikipedia
              </a>
            )}
            {gmap_url && (
              <a
                className="text-blue-600 hover:underline"
                href={gmap_url}
                target="_blank"
                rel="noreferrer"
              >
                Haritada gör
              </a>
            )}
          </div>
        </div>

        {now && (
          <div className="shrink-0 rounded-xl border border-gray-200 px-4 py-3 text-center">
            <div className="text-xs text-gray-500">Şu an hava</div>
            <div className="text-3xl font-semibold">
              {Number.isFinite(now.temperature)
                ? Math.round(now.temperature)
                : "-"}
              °
            </div>
            <div className="text-xs text-gray-500">
              rüzgâr{" "}
              {Number.isFinite(now.windspeed)
                ? Math.round(now.windspeed)
                : "-"}{" "}
              km/s
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * api'nin baseURL'ine göre doğru endpoint üretir:
 *  - baseURL ".../api" içeriyorsa: "/geo/knowledge"
 *  - baseURL yoksa veya /api içermiyorsa: "/api/geo/knowledge"
 */
function getEndpointFor(api, path) {
  try {
    const base = api?.defaults?.baseURL || "";
    const cleanPath = ensureLeadingSlash(path).replace(/^\/api(\/|$)/i, "/");
    if (!base) return "/api" + cleanPath;
    if (/\/api\/?$/i.test(base) || /\/api\//i.test(base)) return cleanPath;
    return "/api" + cleanPath;
  } catch {
    return "/api" + ensureLeadingSlash(path);
  }
}

function ensureLeadingSlash(p) {
  const s = String(p || "").trim();
  if (!s) return "/";
  return s.startsWith("/") ? s : "/" + s;
}
