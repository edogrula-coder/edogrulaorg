// frontend/src/pages/Archive.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";

const api = apiNamed || apiDefault;

/* ---------------- UI tokens ---------------- */
const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  padding: 16,
};
const subtleBtn = (active = false) => ({
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: active ? "#111827" : "#f8fafc",
  color: active ? "#fff" : "#111827",
  fontWeight: 700,
  cursor: "pointer",
});
const ghostBtn = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid #d0d7de",
  fontSize: 14,
  outline: "none",
};
const badge = (bg, color) => ({
  display: "inline-flex",
  fontSize: 12,
  padding: "4px 8px",
  borderRadius: 999,
  background: bg,
  color,
  fontWeight: 800,
});

/* ---------------- network helpers ---------------- */
async function tryGet(urls, cfg) {
  let lastErr;
  for (const u of urls) {
    try {
      const r = await api.get(u, cfg);
      return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function tryPost(urls, data, cfg) {
  let lastErr;
  for (const u of urls) {
    try {
      const r = await api.post(u, data, cfg);
      return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/* ---------------- normalizers ---------------- */
function normalizeItem(tab, raw) {
  if (!raw) return null;

  const id = raw._id || raw.id || raw.requestId;
  const createdAt =
    raw.createdAt || raw.created_at || raw.time || raw.date || null;

  if (tab === "applications") {
    const business = raw.business || raw.biz || {};
    const bName = raw.name || business.name || raw.businessName || "Başvuru";
    const city = raw.city || business.city || "";
    const district = raw.district || business.district || "";
    return {
      id,
      title: bName,
      subtitle:
        raw.tradeTitle ||
        business.tradeTitle ||
        raw.legalName ||
        "",
      city,
      district,
      type: raw.type || business.type || "",
      status: raw.status || "archived",
      createdAt,
      slug: business.slug || raw.slug || raw.handle || "",
    };
  }

  if (tab === "reports") {
    const targetBiz = raw.business || raw.targetBusiness || {};
    const bName =
      targetBiz.name ||
      raw.businessName ||
      raw.title ||
      "Rapor";
    const city =
      raw.city || targetBiz.city || raw.location?.city || "";
    const district =
      raw.district ||
      targetBiz.district ||
      raw.location?.district ||
      "";
    return {
      id,
      title: bName,
      subtitle: raw.reason || raw.category || raw.summary || "",
      city,
      district,
      type: raw.type || raw.category || "",
      status: raw.status || "archived",
      createdAt,
      slug: targetBiz.slug || raw.slug || "",
    };
  }

  // businesses
  const city = raw.city || raw.province || raw.location?.city || "";
  const district =
    raw.district || raw.town || raw.location?.district || "";
  return {
    id,
    title: raw.name || raw.title || "İşletme",
    subtitle:
      raw.tradeTitle || raw.type || raw.category || "",
    city,
    district,
    type: raw.type || raw.category || "",
    status: raw.status || "archived",
    createdAt,
    slug: raw.slug || raw.handle || "",
  };
}

function fmtDate(d) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "-";
  }
}

export default function Archive() {
  const nav = useNavigate();

  const [tab, setTab] = useState("applications"); // applications | reports | businesses
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!r) return false;
      const hay =
        `${r.title} ${r.subtitle} ${r.city} ${r.district} ${r.type} ${r.slug}`.toLowerCase();
      if (qq && !hay.includes(qq)) return false;
      if (city && r.city?.toLowerCase() !== city.toLowerCase())
        return false;
      if (
        district &&
        r.district?.toLowerCase() !== district.toLowerCase()
      )
        return false;
      return true;
    });
  }, [rows, q, city, district]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  /* ---------------- fetchers ---------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      setPage(1);
      try {
        let resp;

        if (tab === "applications") {
          resp = await tryGet([
            "/admin/applications?status=archived",
            "/apply/admin?status=archived",
            "/apply?status=archived",
          ]);
          const list =
            resp?.data?.applications ||
            resp?.data?.rows ||
            resp?.data?.items ||
            resp?.data?.results ||
            resp?.data ||
            [];
          const norm = (Array.isArray(list) ? list : [])
            .map((x) => normalizeItem(tab, x))
            .filter(Boolean);
          if (alive) setRows(norm);
        }

        if (tab === "reports") {
          resp = await tryGet([
            "/admin/reports?status=archived",
            "/report/admin?status=archived",
            "/reports?status=archived",
            "/report?status=archived",
          ]);
          const list =
            resp?.data?.reports ||
            resp?.data?.rows ||
            resp?.data?.items ||
            resp?.data?.results ||
            resp?.data ||
            [];
          const norm = (Array.isArray(list) ? list : [])
            .map((x) => normalizeItem(tab, x))
            .filter(Boolean);
          if (alive) setRows(norm);
        }

        if (tab === "businesses") {
          resp = await tryGet([
            "/admin/businesses?status=archived",
            "/businesses?status=archived",
            "/businesses?archived=1",
          ]);
          const list =
            resp?.data?.businesses ||
            resp?.data?.rows ||
            resp?.data?.items ||
            resp?.data?.results ||
            resp?.data ||
            [];
          const norm = (Array.isArray(list) ? list : [])
            .map((x) => normalizeItem(tab, x))
            .filter(Boolean);
          if (alive) setRows(norm);
        }
      } catch (e) {
        const msg =
          e?.response?.data?.message ||
          e?.response?.data?.error ||
          (e?.response
            ? `Sunucu hatası (${e.response.status})`
            : "Ağ/istemci hatası");
        if (alive) setError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tab]);

  /* ---------------- actions ---------------- */
  async function unarchiveItem(item) {
    if (!item?.id) return;
    if (
      !window.confirm(
        "Bu kaydı arşivden çıkarıp tekrar aktif hale getirmek istiyor musun?"
      )
    )
      return;

    setBusyId(item.id);
    try {
      if (tab === "applications") {
        await tryPost(
          [
            `/admin/applications/${item.id}/unarchive`,
            `/apply/${item.id}/unarchive`,
            `/apply/${item.id}/restore`,
          ],
          {}
        );
      }
      if (tab === "reports") {
        await tryPost(
          [
            `/admin/reports/${item.id}/unarchive`,
            `/report/${item.id}/unarchive`,
            `/reports/${item.id}/restore`,
          ],
          {}
        );
      }
      if (tab === "businesses") {
        await tryPost(
          [
            `/admin/businesses/${item.id}/unarchive`,
            `/businesses/${item.id}/unarchive`,
            `/businesses/${item.id}/restore`,
          ],
          {}
        );
      }
      // local update
      setRows((prev) => prev.filter((r) => r.id !== item.id));
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "İşlem başarısız.";
      alert(msg);
    } finally {
      setBusyId("");
    }
  }

  const emptyText =
    tab === "applications"
      ? "Arşivde başvuru yok."
      : tab === "reports"
      ? "Arşivde rapor yok."
      : "Arşivde işletme yok.";

  return (
    <section
      style={{
        padding: 20,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontWeight: 900 }}>
            📂 Arşiv
          </h2>
          <div
            style={{
              color: "#64748b",
              fontSize: 14,
              marginTop: 4,
            }}
          >
            Arşivlenmiş kayıtları görüntüle, gerekirse geri al.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => nav("/dashboard")}
            style={ghostBtn}
            title="Dashboard"
          >
            ⟵ Dashboard
          </button>
          <button
            onClick={() => nav("/")}
            style={ghostBtn}
            title="Anasayfa"
          >
            🏠 Anasayfa
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setTab("applications")}
          style={subtleBtn(tab === "applications")}
        >
          Başvurular
        </button>
        <button
          onClick={() => setTab("reports")}
          style={subtleBtn(tab === "reports")}
        >
          Raporlar
        </button>
        <button
          onClick={() => setTab("businesses")}
          style={subtleBtn(tab === "businesses")}
        >
          İşletmeler
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          ...card,
          marginBottom: 12,
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: 10,
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={input}
          placeholder="Arşivde ara (işletme adı, instagram, tür, not, şehir...)"
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={input}
          placeholder="İl filtre"
        />
        <input
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          style={input}
          placeholder="İlçe filtre"
        />
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            ...card,
            borderColor: "#fecaca",
            background: "#fff1f2",
            color: "#991b1b",
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...card, height: 150 }}>
              <div
                style={{
                  height: 14,
                  width: "70%",
                  background: "#e5e7eb",
                  borderRadius: 6,
                  marginBottom: 10,
                }}
              />
              <div
                style={{
                  height: 10,
                  width: "90%",
                  background: "#eef2f7",
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              />
              <div
                style={{
                  height: 10,
                  width: "60%",
                  background: "#eef2f7",
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              />
              <div
                style={{
                  height: 28,
                  width: 120,
                  background: "#e5e7eb",
                  borderRadius: 8,
                  marginTop: 18,
                }}
              />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: "#6b7280" }}>
          {emptyText}
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {paged.map((r) => (
              <div key={r.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>
                    {r.title}
                  </div>
                  <div style={badge("#f1f5f9", "#0f172a")}>
                    archived
                  </div>
                </div>

                {!!r.subtitle && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "#475569",
                      marginTop: 6,
                      minHeight: 18,
                    }}
                  >
                    {r.subtitle}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 13,
                    color: "#64748b",
                    marginTop: 8,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                  }}
                >
                  <div><b>Tür:</b> {r.type || "-"}</div>
                  <div><b>Tarih:</b> {fmtDate(r.createdAt)}</div>
                  <div><b>İl:</b> {r.city || "-"}</div>
                  <div><b>İlçe:</b> {r.district || "-"}</div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {r.slug && (
                    <button
                      onClick={() => nav(`/isletme/${r.slug}`)}
                      style={ghostBtn}
                      title="Profili aç"
                    >
                      Profili Aç
                    </button>
                  )}

                  <button
                    onClick={() => unarchiveItem(r)}
                    disabled={busyId === r.id}
                    style={{
                      ...ghostBtn,
                      background: busyId === r.id ? "#e5e7eb" : "#ecfdf3",
                      borderColor: "#bbf7d0",
                      color: "#166534",
                    }}
                  >
                    {busyId === r.id ? "İşleniyor…" : "Geri Al"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={ghostBtn}
                disabled={page === 1}
              >
                ⟵
              </button>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                {page} / {pageCount}
              </div>
              <button
                onClick={() =>
                  setPage((p) => Math.min(pageCount, p + 1))
                }
                style={ghostBtn}
                disabled={page === pageCount}
              >
                ⟶
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
