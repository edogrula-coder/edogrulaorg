// src/pages/Reports.jsx — Admin İhbarlar (Build-safe)
import React, { useEffect, useState } from "react";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";
import { ensureAccess } from "@/lib/admin/ensureAccess";

const api = apiNamed || apiDefault;

function fmtDate(x) {
  if (!x) return "-";
  try {
    return new Date(x).toLocaleString();
  } catch {
    return String(x);
  }
}

export default function Reports() {
  const [adminOK, setAdminOK] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // Auth check
  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const ok = await ensureAccess().catch(() => false);
        if (!c) setAdminOK(Boolean(ok));
      } catch {
        if (!c) setAdminOK(false);
      }
    })();
    return () => { c = true; };
  }, []);

  // Fetch reports
  useEffect(() => {
    if (!adminOK) return;
    let c = false;

    (async () => {
      setLoading(true);
      setError("");

      try {
        const res = await api.get("/report", {
          params: { q, limit, page, admin: 1 },
          _quiet: true,
        });

        const list =
          res?.data?.items ||
          res?.data?.reports ||
          res?.data?.rows ||
          [];

        if (!c) {
          setRows(list);
          const t = Number(res?.data?.total || list.length || 0);
          const pg = Math.max(1, Math.ceil(t / limit));
          setPages(pg);
        }
      } catch (e) {
        if (!c)
          setError(
            e?.response?.data?.message ||
              e?.message ||
              "İhbarlar yüklenemedi"
          );
      } finally {
        if (!c) setLoading(false);
      }
    })();

    return () => { c = true; };
  }, [adminOK, q, limit, page]);

  const refresh = () => setPage((p) => p);

  return (
    <section style={{ paddingBottom: 20 }}>
      <h2 style={{ marginBottom: 10 }}>İhbarlar</h2>

      {/* Search */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          placeholder="Ara (isim, e-posta, açıklama...)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          style={{ flex: 1, padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
        />

        <button
          onClick={() => { setQ(""); setPage(1); }}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc" }}
        >
          Sıfırla
        </button>

        <button
          onClick={refresh}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff" }}
        >
          Yenile
        </button>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={th}>Ad / Mail</th>
              <th style={th}>Açıklama</th>
              <th style={th}>Durum</th>
              <th style={th}>Tarih</th>
              <th style={th}>Delil</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={loadingCell}>Yükleniyor…</td></tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r._id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={td}>
                    <b>{r.reporterName || "-"}</b>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{r.reporterEmail}</div>
                  </td>

                  <td style={td}>{(r.desc || "-").slice(0, 140)}</td>

                  <td style={td}>
                    <span style={pill}>{r.status || "-"}</span>
                  </td>

                  <td style={td}>{fmtDate(r.createdAt)}</td>

                  <td style={td}>
                    {Array.isArray(r.evidenceFiles) && r.evidenceFiles.length ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {r.evidenceFiles.slice(0, 3).map((u, i) => (
                          <a
                            key={i}
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            style={pill}
                          >
                            Ek {i + 1}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "#adb5bd" }}>yok</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5} style={emptyCell}>{error || "Kayıt yok"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={paginationWrap}>
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          style={pageBtn}
        >
          ‹ Önceki
        </button>

        <span style={{ fontSize: 13, color: "#64748b" }}>
          Sayfa {page}/{pages}
        </span>

        <button
          disabled={page >= pages}
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
          style={pageBtn}
        >
          Sonraki ›
        </button>
      </div>
    </section>
  );
}

const th = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  color: "#475569",
  borderBottom: "1px solid #e5e7eb",
};

const td = { padding: "10px 12px", verticalAlign: "top", fontSize: 13 };

const pill = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#3730a3",
  fontSize: 11,
  textDecoration: "none",
};

const loadingCell = {
  padding: 16,
  textAlign: "center",
  color: "#64748b",
};

const emptyCell = {
  padding: 16,
  textAlign: "center",
  color: "#6b7280",
};

const paginationWrap = {
  display: "flex",
  justifyContent: "center",
  marginTop: 12,
  gap: 12,
};

const pageBtn = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
};
