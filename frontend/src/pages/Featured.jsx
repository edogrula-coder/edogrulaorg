// src/pages/Featured.jsx — Admin Öne Çıkanlar (Ultra Pro)
import React, { useEffect, useMemo, useState } from "react";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";
import { ensureAccess } from "@/lib/admin/ensureAccess";

const api = apiNamed || apiDefault;

/* ============================ Helpers ============================ */
function useDebounced(v, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function useAdminAccess() {
  const [adminOK, setAdminOK] = useState(false);
  useEffect(() => {
    let alive = true;
    ensureAccess()
      .then(() => alive && setAdminOK(true))
      .catch(() => alive && setAdminOK(false));
    return () => {
      alive = false;
    };
  }, []);
  return adminOK;
}

function fmtDate(x) {
  if (!x) return "-";
  try {
    return new Date(x).toLocaleString("tr-TR");
  } catch {
    return String(x);
  }
}

const th = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  color: "#475569",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  position: "sticky",
  top: 0,
  zIndex: 1,
};
const td = { padding: "10px 12px", verticalAlign: "top" };

const STATUS = ["all", "active", "draft", "scheduled", "expired", "archived"];
const PLACEMENTS = ["all", "home", "category", "search", "custom"];

/* ============================ Page ============================ */
export default function Featured() {
  const adminOK = useAdminAccess();

  // Featured list state
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [reloadKey, setReloadKey] = useState(0); // ✅ gerçek refresh trigger

  // filters
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 450);
  const [status, setStatus] = useState("all");
  const [placement, setPlacement] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("order, -createdAt");

  // Source page (e.g., Sapanca Bungalov Evleri) to pick businesses from
  const SOURCE_OPTIONS = [
    { key: "sapanca-bungalov-evleri", label: "Sapanca Bungalov Evleri" },
  ];
  const [sourceKey, setSourceKey] = useState(SOURCE_OPTIONS[0].key);
  const [sourceItems, setSourceItems] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(false);

  const basePath = "/admin/featured";

  const nextOrder = useMemo(() => {
    const mx = Math.max(
      0,
      ...(rows || []).map((r) => Number(r.order) || 0)
    );
    return mx + 1;
  }, [rows]);

  /* ---------- Fetch featured list ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");

      const params = { page, limit, sort };
      if (dq) params.q = dq;
      if (status !== "all") params.status = status;
      if (placement !== "all") params.placement = placement;
      if (from) params.from = from;
      if (to) params.to = to;

      try {
        let res;
        try {
          res = await api.get(basePath, { params, _quiet: true });
        } catch {
          res = await api.get("/featured", {
            params: { ...params, admin: 1 },
            _quiet: true,
          });
        }

        const data = res?.data || {};
        const list =
          data.featured ||
          data.items ||
          data.rows ||
          data.data ||
          [];

        if (!cancelled) {
          const arr = Array.isArray(list) ? list : [];
          setRows(arr);

          const t = Number(data.total || arr.length || 0);
          setTotal(t);

          const pg = Number(
            data.pages || Math.max(1, Math.ceil(t / (params.limit || 20)))
          );
          setPages(pg);

          setSelected(new Set());
        }
      } catch (e) {
        if (!cancelled)
          setError(
            e?.response?.data?.message ||
              e?.message ||
              "Liste yüklenemedi"
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, limit, dq, status, placement, from, to, sort, reloadKey]);

  /* ---------- Fetch businesses from source page (robust) ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!sourceKey) {
        setSourceItems([]);
        return;
      }

      setSourceLoading(true);

      try {
        const slug = sourceKey;
        const tries = [
          `/admin/explore/${slug}`,
          `/explore/${slug}`,
          `/explore/by-slug/${slug}`,
          { p: "/explore", params: { slug } },
          { p: "/businesses", params: { collection: slug, limit: 500 } },
          { p: "/businesses", params: { category: slug, limit: 500 } },
          { p: "/businesses", params: { tag: "sapanca", limit: 500 } },
        ];

        let items = [];
        for (const t of tries) {
          try {
            const res =
              typeof t === "string"
                ? await api.get(t, { _quiet: true })
                : await api.get(t.p, { params: t.params, _quiet: true });

            const d = res?.data || {};
            const list = Array.isArray(d.items)
              ? d.items
              : Array.isArray(d.businesses)
              ? d.businesses
              : Array.isArray(d.rows)
              ? d.rows
              : Array.isArray(d.data?.items)
              ? d.data.items
              : Array.isArray(d.data)
              ? d.data
              : Array.isArray(d.list)
              ? d.list
              : [];

            if (list.length) {
              items = list;
              break;
            }
          } catch {
            /* sonraki dene */
          }
        }

        if (!cancelled) setSourceItems(items);
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  /* ============================ Actions ============================ */
  const refresh = () => setReloadKey((k) => k + 1);

  const allSelectedOnPage = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r._id)),
    [rows, selected]
  );

  const toggleSelect = (id, v) =>
    setSelected((s) => {
      const nx = new Set(s);
      v ? nx.add(id) : nx.delete(id);
      return nx;
    });

  const toggleSelectAll = (v) =>
    v
      ? setSelected(new Set(rows.map((r) => r._id).filter(Boolean)))
      : setSelected(new Set());

  async function patchOne(id, body) {
    try {
      try {
        await api.patch(`${basePath}/${id}`, body, { _quiet: false });
      } catch {
        await api.patch(`/featured/${id}`, body, { _quiet: false });
      }
      refresh();
    } catch {}
  }

  async function delOne(id) {
    if (!window.confirm("Kalıcı olarak silinsin mi?")) return;
    try {
      try {
        await api.delete(`${basePath}/${id}`, { _quiet: false });
      } catch {
        await api.delete(`/featured/${id}`, { _quiet: false });
      }
      refresh();
    } catch {}
  }

  async function bulk(op, extra) {
    if (!selected.size) return alert("Seçili kayıt yok.");
    const body = { ids: Array.from(selected), op, ...extra };
    try {
      try {
        await api.post(`${basePath}/bulk`, body, { _quiet: false });
      } catch {
        await api.post(`/featured/bulk`, body, { _quiet: false });
      }
      refresh();
    } catch {}
  }

  function exportCsv() {
    const qs = new URLSearchParams();
    if (dq) qs.set("q", dq);
    if (status !== "all") qs.set("status", status);
    if (placement !== "all") qs.set("placement", placement);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);

    const url1 = `${basePath}/export.csv?${qs.toString()}`;
    const url2 = `/featured/export.csv?${qs.toString()}`;
    setTimeout(
      () => window.open(url1, "_blank") || window.open(url2, "_blank"),
      30
    );
  }

  // reorder helpers (local, safe copy)
  function move(idx, dir) {
    setRows((arr) => {
      const r = arr.map((x) => ({ ...x }));
      const j = idx + dir;
      if (j < 0 || j >= r.length) return r;

      const tmp = r[idx];
      r[idx] = r[j];
      r[j] = tmp;

      return r.map((x, i) => ({ ...x, order: i + 1 }));
    });
  }

  async function saveOrder() {
    const payload = rows.map((r, i) => ({
      id: r._id,
      order: r.order ?? i + 1,
    }));
    try {
      try {
        await api.post(
          `${basePath}/reorder`,
          { items: payload },
          { _quiet: false }
        );
      } catch {
        await api.post(
          `/featured/reorder`,
          { items: payload },
          { _quiet: false }
        );
      }
      refresh();
    } catch (e) {
      alert(
        e?.response?.data?.message || e?.message || "Sıra kaydedilemedi"
      );
    }
  }

  const featuredIndex = useMemo(() => {
    const m = new Map();
    for (const f of rows || [])
      if (f.businessId) m.set(String(f.businessId), f);
    return m;
  }, [rows]);

  function pickImage(b) {
    return (
      b.coverImage ||
      b.coverUrl ||
      b.imageUrl ||
      (b.images && (b.images[0]?.url || b.images[0])) ||
      (b.photos && (b.photos[0]?.url || b.photos[0])) ||
      ""
    );
  }

  // Güvenli payload ile öne çıkar
  async function markFeaturedFromBusiness(b, source = sourceKey) {
    const bizId = b._id || b.id;
    if (!bizId) return alert("İşletme id bulunamadı");

    const exists = featuredIndex.get(String(bizId));

    const payload = {
      title: b.name || b.title || "Öne Çıkan",
      subtitle: source || "",
      placement: "category",
      status: "active",
      order: nextOrder,
      startAt: new Date().toISOString(),
      businessId: bizId,
      businessSlug: b.slug || b.businessSlug || "",
      businessName: b.name || "",
      imageUrl: pickImage(b),
      href: `/${source || ""}`.replace(/\/+$/, ""),
    };

    try {
      if (exists)
        await patchOne(exists._id, { status: "active", ...payload });
      else {
        try {
          await api.post(basePath, payload, { _quiet: false });
        } catch {
          await api.post(`/featured`, payload, { _quiet: false });
        }
      }
      refresh();
    } catch (e) {
      alert(
        e?.response?.data?.message || e?.message || "Öne çıkarılamadı"
      );
    }
  }

  /* ============================ Create/Edit Modal ============================ */
  const [editing, setEditing] = useState(null);
  const empty = {
    title: "",
    subtitle: "",
    placement: "home",
    order: 1,
    status: "draft",
    startAt: "",
    endAt: "",
    businessSlug: "",
    businessId: "",
    businessName: "",
    imageUrl: "",
    href: "",
  };
  const openCreate = () =>
    setEditing({
      ...empty,
      _isNew: true,
      order: nextOrder,
    });

  const openEdit = (row) => setEditing({ ...row, _isNew: false });
  const closeEdit = () => setEditing(null);

  async function saveEdit(data) {
    const payload = { ...data };
    try {
      if (payload._isNew) {
        try {
          await api.post(basePath, payload, { _quiet: false });
        } catch {
          await api.post(`/featured`, payload, { _quiet: false });
        }
      } else {
        await patchOne(payload._id, payload);
      }
      closeEdit();
      refresh();
    } catch (e) {
      alert(
        e?.response?.data?.message || e?.message || "Kaydedilemedi"
      );
    }
  }

  /* ============================ UI ============================ */
  return (
    <section style={{ paddingBottom: 24 }}>
      <style>{styles}</style>

      {/* Sticky Top Bar */}
      <div className="topbar">
        <div className="topbar-left">
          <h2 style={{ margin: 0 }}>
            Öne Çıkanlar{" "}
            <small style={{ color: "#64748b" }}>({total})</small>
          </h2>
          {!adminOK && (
            <span className="warn">Admin erişimi yok • salt okuma</span>
          )}
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={openCreate} disabled={!adminOK}>
            + Yeni Öne Çıkan
          </button>
          <button className="btn btn-light" onClick={refresh}>
            ↻ Yenile
          </button>
        </div>
      </div>

      {/* Kaynak sayfa + grid */}
      <div className="card">
        <div className="row-wrap">
          <div className="row-inline">
            <b>Kaynak sayfa:</b>
            <select
              value={sourceKey}
              onChange={(e) => setSourceKey(e.target.value)}
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="muted">
            {sourceLoading
              ? "Kaynak yükleniyor…"
              : `${sourceItems.length} işletme bulundu`}
          </div>
        </div>

        <div className="src-grid">
          {sourceLoading && <div className="src-empty">Yükleniyor…</div>}
          {!sourceLoading && !sourceItems.length && (
            <div className="src-empty">
              Bu sayfada işletme bulunamadı (aşağıdaki aramayı kullanabilirsin)
            </div>
          )}

          {sourceItems.map((b) => {
            const id = String(b._id || b.id || b.slug);
            const isOn = featuredIndex.has(String(b._id || b.id));
            const img = pickImage(b);
            return (
              <div key={id} className={`src-card ${isOn ? "on" : ""}`}>
                <div className="src-thumb">
                  {img ? (
                    <img src={img} alt="" />
                  ) : (
                    <div className="src-noimg">IMG</div>
                  )}
                </div>
                <div className="src-meta">
                  <div
                    className="src-title"
                    title={b.name || b.title}
                  >
                    {b.name || b.title || "-"}
                  </div>
                  <div className="src-sub">
                    {b.slug || "-"}
                    {b.phone ? ` • ${b.phone}` : ""}
                  </div>
                </div>
                <div className="src-actions">
                  {!isOn ? (
                    <button
                      className="btn"
                      onClick={() =>
                        markFeaturedFromBusiness(b, sourceKey)
                      }
                      disabled={!adminOK}
                    >
                      ★ Öne Çıkar
                    </button>
                  ) : (
                    <button
                      className="btn btn-light"
                      onClick={() => {
                        const ex = featuredIndex.get(
                          String(b._id || b.id)
                        );
                        if (ex) patchOne(ex._id, { status: "draft" });
                      }}
                      disabled={!adminOK}
                    >
                      Kaldır
                    </button>
                  )}
                  {b.slug && (
                    <a
                      className="pill"
                      href={`/b/${b.slug}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Profil
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Fallback arama */}
        <FallbackBusinessPicker
          disabled={!adminOK}
          onPick={(biz) =>
            markFeaturedFromBusiness(biz, sourceKey)
          }
        />
      </div>

      {/* Filters */}
      <div className="filters">
        <input
          placeholder="Ara (başlık, işletme, slug, id)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={placement}
          onChange={(e) => {
            setPlacement(e.target.value);
            setPage(1);
          }}
        >
          {PLACEMENTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
        <div className="row-inline">
          <button className="btn" onClick={exportCsv}>
            CSV
          </button>
          <button
            className="btn btn-light"
            onClick={() => {
              setQ("");
              setStatus("all");
              setPlacement("all");
              setFrom("");
              setTo("");
              setSort("order, -createdAt");
              setPage(1);
            }}
          >
            Sıfırla
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="bulk">
        <button
          className="btn"
          disabled={!selected.size || !adminOK}
          onClick={() => bulk("status", { value: "active" })}
        >
          Yayınla
        </button>
        <button
          className="btn btn-light"
          disabled={!selected.size || !adminOK}
          onClick={() => bulk("status", { value: "draft" })}
        >
          Taslak
        </button>
        <button
          className="btn btn-light"
          disabled={!selected.size || !adminOK}
          onClick={() => bulk("status", { value: "archived" })}
        >
          Arşiv
        </button>
        <button
          className="btn btn-danger"
          disabled={!selected.size || !adminOK}
          onClick={() => bulk("delete")}
        >
          Sil
        </button>
        <span style={{ width: 8 }} />
        <button className="btn" onClick={saveOrder} disabled={!adminOK}>
          Sırayı Kaydet
        </button>
      </div>

      {/* Table */}
      <div className="tableWrap">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>
                <input
                  type="checkbox"
                  checked={allSelectedOnPage}
                  onChange={(e) =>
                    toggleSelectAll(e.target.checked)
                  }
                />
              </th>
              <th style={th}>Sıra</th>
              <th style={th}>Başlık</th>
              <th style={th}>İşletme</th>
              <th style={th}>Yerleşim</th>
              <th style={th}>Durum</th>
              <th style={th}>Tarih</th>
              <th style={th}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={8}
                  style={{ padding: 16, textAlign: "center" }}
                >
                  Yükleniyor…
                </td>
              </tr>
            ) : rows?.length ? (
              rows.map((r, idx) => (
                <tr key={r._id || idx} className="tr">
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={selected.has(r._id)}
                      onChange={(e) =>
                        toggleSelect(r._id, e.target.checked)
                      }
                    />
                  </td>

                  <td style={td}>
                    <div className="orderCell">
                      <button
                        className="btn btn-light"
                        title="Yukarı"
                        onClick={() => move(idx, -1)}
                        disabled={!adminOK}
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-light"
                        title="Aşağı"
                        onClick={() => move(idx, 1)}
                        disabled={!adminOK}
                      >
                        ↓
                      </button>
                      <input
                        className="orderInput"
                        value={r.order ?? idx + 1}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10) || 0;
                          setRows((arr) =>
                            arr.map((x) =>
                              x._id === r._id
                                ? { ...x, order: v }
                                : x
                            )
                          );
                        }}
                        disabled={!adminOK}
                      />
                    </div>
                  </td>

                  <td style={td}>
                    <div className="titleCell">
                      {r.imageUrl && (
                        <img
                          src={r.imageUrl}
                          alt=""
                          className="thumb"
                        />
                      )}
                      <div>
                        <b>{r.title || "-"}</b>
                        {r.subtitle && (
                          <div className="sub">
                            {String(r.subtitle).slice(0, 100)}
                          </div>
                        )}
                        {r.href && (
                          <a
                            href={r.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="link"
                          >
                            Bağlantı
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  <td style={td}>
                    <div>
                      <div>{r.businessName || r.name || "-"}</div>
                      <small className="muted">
                        {r.businessSlug ||
                          r.slug ||
                          r.business?.slug ||
                          ""}
                      </small>
                    </div>
                  </td>

                  <td style={td}>
                    <PlacementBadge value={r.placement} />
                  </td>

                  <td style={td}>
                    <StatusBadge value={r.status} />
                  </td>

                  <td style={td}>
                    <div>
                      <div>{fmtDate(r.startAt)}</div>
                      {r.endAt && (
                        <small className="muted">
                          Bitiş: {fmtDate(r.endAt)}
                        </small>
                      )}
                    </div>
                  </td>

                  <td style={td}>
                    <div className="actionsCell">
                      <button
                        className="btn btn-ghost"
                        onClick={() => openEdit(r)}
                      >
                        Detay
                      </button>

                      {r.status !== "active" ? (
                        <button
                          className="btn"
                          onClick={() =>
                            patchOne(r._id, { status: "active" })
                          }
                          disabled={!adminOK}
                        >
                          Yayınla
                        </button>
                      ) : (
                        <button
                          className="btn btn-light"
                          onClick={() =>
                            patchOne(r._id, { status: "draft" })
                          }
                          disabled={!adminOK}
                        >
                          Taslak
                        </button>
                      )}

                      <button
                        className="btn btn-danger"
                        onClick={() => delOne(r._id)}
                        disabled={!adminOK}
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  style={{ padding: 16, textAlign: "center" }}
                >
                  {error || "Kayıt yok"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pager">
        <div className="muted">
          Toplam: {total} • Sayfa {page}/{pages}
        </div>
        <div className="row-inline">
          <button
            className="btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ‹ Önceki
          </button>
          <select
            value={page}
            onChange={(e) =>
              setPage(parseInt(e.target.value, 10))
            }
          >
            {Array.from({ length: pages || 1 }).map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
          >
            Sonraki ›
          </button>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value, 10));
              setPage(1);
            }}
          >
            {[10, 20, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}/sayfa
              </option>
            ))}
          </select>
        </div>
      </div>

      {editing && (
        <EditModal
          data={editing}
          onClose={closeEdit}
          onSave={saveEdit}
        />
      )}
    </section>
  );
}

/* ============================ Fallback Business Picker ============================ */
function FallbackBusinessPicker({ onPick, disabled }) {
  const adminOK = useAdminAccess();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 450);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!dq || dq.trim().length < 2) {
        setItems([]);
        return;
      }

      setLoading(true);
      const paths = adminOK
        ? [
            { p: "/admin/businesses", params: { q: dq, limit: 20 } },
            { p: "/businesses", params: { q: dq, limit: 20 } },
          ]
        : [{ p: "/businesses", params: { q: dq, limit: 20 } }];

      try {
        let found = false;
        for (const t of paths) {
          try {
            const res = await api.get(t.p, {
              params: t.params,
              _quiet: true,
            });
            const d = res?.data || {};
            const list = Array.isArray(d.businesses)
              ? d.businesses
              : Array.isArray(d.items)
              ? d.items
              : Array.isArray(d.data)
              ? d.data
              : Array.isArray(d.rows)
              ? d.rows
              : [];
            if (list.length) {
              if (!cancelled) setItems(list);
              found = true;
              break;
            }
          } catch {}
        }
        if (!found && !cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dq, adminOK]);

  return (
    <div style={{ marginTop: 16 }}>
      <div className="row-inline" style={{ marginBottom: 8 }}>
        <b>İşletme ara (fallback):</b>
        <input
          style={{ maxWidth: 360 }}
          placeholder="ad / slug / telefon…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="src-grid">
        {loading && <div className="src-empty">Aranıyor…</div>}
        {!loading && !items.length && dq && dq.length >= 2 && (
          <div className="src-empty">Sonuç yok</div>
        )}

        {items.map((b) => {
          const img =
            b.coverUrl ||
            b.imageUrl ||
            (b.images && (b.images[0]?.url || b.images[0])) ||
            "";
          return (
            <div
              key={b._id || b.id || b.slug}
              className="src-card"
            >
              <div className="src-thumb">
                {img ? (
                  <img src={img} alt="" />
                ) : (
                  <div className="src-noimg">IMG</div>
                )}
              </div>
              <div className="src-meta">
                <div className="src-title">
                  {b.name || b.title || "-"}
                </div>
                <div className="src-sub">
                  {b.slug || "-"}
                  {b.phone ? ` • ${b.phone}` : ""}
                </div>
              </div>
              <div className="src-actions">
                <button
                  className="btn"
                  onClick={() => onPick(b)}
                  disabled={disabled}
                >
                  ★ Öne Çıkar
                </button>
                {b.slug && (
                  <a
                    className="pill"
                    href={`/b/${b.slug}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Profil
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ Small Components ============================ */
function StatusBadge({ value }) {
  const map = {
    active: { bg: "#ecfdf5", fg: "#065f46", text: "Yayında" },
    draft: { bg: "#f1f5f9", fg: "#334155", text: "Taslak" },
    scheduled: { bg: "#eef2ff", fg: "#3730a3", text: "Zamanlı" },
    expired: { bg: "#e2e8f0", fg: "#475569", text: "Süresi Bitti" },
    archived: { bg: "#fefce8", fg: "#854d0e", text: "Arşiv" },
  };
  const v = map[value] || {
    bg: "#e5e7eb",
    fg: "#374151",
    text: value || "-",
  };
  return (
    <span className="badge" style={{ background: v.bg, color: v.fg }}>
      {v.text}
    </span>
  );
}

function PlacementBadge({ value }) {
  const map = {
    home: { bg: "#ecfeff", fg: "#155e75", text: "Ana Sayfa" },
    category: { bg: "#fff7ed", fg: "#9a3412", text: "Kategori" },
    search: { bg: "#fef2f2", fg: "#991b1b", text: "Arama" },
    custom: { bg: "#f1f5f9", fg: "#334155", text: "Özel" },
  };
  const v = map[value] || {
    bg: "#e5e7eb",
    fg: "#374151",
    text: value || "-",
  };
  return (
    <span className="badge" style={{ background: v.bg, color: v.fg }}>
      {v.text}
    </span>
  );
}

/* ============================ Modal ============================ */
function EditModal({ data, onClose, onSave }) {
  const [form, setForm] = useState({ ...data });
  const [saving, setSaving] = useState(false);
  const set = (k, v) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e?.preventDefault();
    setSaving(true);
    await onSave({ ...form });
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>
          {form._isNew ? "Yeni Öne Çıkan" : "Kayıt Detayı"}
        </h3>

        <form className="grid" onSubmit={submit}>
          <label>
            Başlık
            <input
              value={form.title || ""}
              onChange={(e) =>
                set("title", e.target.value)
              }
              required
            />
          </label>

          <label>
            Alt Başlık
            <input
              value={form.subtitle || ""}
              onChange={(e) =>
                set("subtitle", e.target.value)
              }
            />
          </label>

          <label>
            Yerleşim
            <select
              value={form.placement || "home"}
              onChange={(e) =>
                set("placement", e.target.value)
              }
            >
              {["home", "category", "search", "custom"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label>
            Sıra
            <input
              type="number"
              value={form.order ?? 1}
              onChange={(e) =>
                set("order", parseInt(e.target.value, 10) || 1)
              }
            />
          </label>

          <label>
            Durum
            <select
              value={form.status || "draft"}
              onChange={(e) =>
                set("status", e.target.value)
              }
            >
              {["active", "draft", "scheduled", "expired", "archived"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label>
            İşletme ID
            <input
              value={form.businessId || ""}
              onChange={(e) =>
                set("businessId", e.target.value)
              }
              placeholder="ObjectId"
            />
          </label>

          <label>
            İşletme Slug
            <input
              value={form.businessSlug || ""}
              onChange={(e) =>
                set("businessSlug", e.target.value)
              }
              placeholder="slug"
            />
          </label>

          <label className="span2">
            Görsel URL
            <input
              value={form.imageUrl || ""}
              onChange={(e) =>
                set("imageUrl", e.target.value)
              }
              placeholder="https://..."
            />
          </label>

          <label className="span2">
            Tıkla Linki (ops.)
            <input
              value={form.href || ""}
              onChange={(e) =>
                set("href", e.target.value)
              }
              placeholder="https://... veya /b/slug"
            />
          </label>

          <label>
            Başlangıç
            <input
              type="datetime-local"
              value={
                form.startAt
                  ? new Date(form.startAt).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                set(
                  "startAt",
                  e.target.value
                    ? new Date(e.target.value).toISOString()
                    : ""
                )
              }
            />
          </label>

          <label>
            Bitiş
            <input
              type="datetime-local"
              value={
                form.endAt
                  ? new Date(form.endAt).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                set(
                  "endAt",
                  e.target.value
                    ? new Date(e.target.value).toISOString()
                    : ""
                )
              }
            />
          </label>

          <div className="actions span2">
            <button
              type="button"
              className="btn btn-light"
              onClick={onClose}
            >
              Kapat
            </button>
            <button
              type="submit"
              className="btn"
              disabled={saving}
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
      <style>{modalCss}</style>
    </div>
  );
}

/* ============================ Styles ============================ */
const styles = `
  .btn{
    padding:8px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;
    cursor:pointer;font-weight:700;transition:.15s;
  }
  .btn:hover{ background:#f8fafc; }
  .btn-light{ background:#f8fafc; }
  .btn-ghost{ background:transparent;border:1px dashed #e5e7eb; }
  .btn-danger{ background:#fee2e2;border-color:#fecaca;color:#991b1b; }

  input,select,textarea{
    width:100%;padding:8px 10px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;
  }

  .badge{
    padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;display:inline-flex;align-items:center;
  }

  .pill{
    display:inline-block;padding:4px 8px;border-radius:999px;border:1px solid #e5e7eb;
    font-size:12px;color:#2563eb;text-decoration:none;font-weight:700;
  }

  .muted{ color:#64748b; font-size:12px; }
  .warn{ color:#b45309; font-size:12px; font-weight:800; padding:4px 8px; background:#fffbeb; border:1px solid #fde68a; border-radius:999px; }

  .topbar{
    position:sticky; top:0; z-index:5;
    display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
    background:#fff; border-bottom:1px solid #e5e7eb; padding:10px 0; margin-bottom:10px;
  }
  .topbar-left{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .topbar-actions{ display:flex; gap:8px; }

  .card{
    border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fff;margin-bottom:12px;
  }

  .row-inline{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .row-wrap{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }

  .filters{
    display:grid; gap:8px; margin-bottom:10px;
    grid-template-columns:1.5fr 0.9fr 0.9fr 0.9fr 0.9fr auto;
  }
  .bulk{ display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }

  .tableWrap{
    border:1px solid #e5e7eb;border-radius:12px;overflow:auto;background:#fff;
  }
  .tr{ border-top:1px solid #eef2f7; }

  .orderCell{ display:flex; align-items:center; gap:6px; }
  .orderInput{ width:70px; }

  .titleCell{ display:flex; gap:10px; align-items:center; }
  .thumb{
    width:56px;height:36px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;flex:0 0 auto;
  }
  .sub{ color:#6b7280; font-size:12px; margin-top:2px; }
  .link{ font-size:12px; color:#2563eb; text-decoration:none; font-weight:800; }

  .actionsCell{ display:flex; gap:6px; flex-wrap:wrap; }

  .pager{
    display:flex; align-items:center; justify-content:space-between; margin-top:10px; gap:8px; flex-wrap:wrap;
  }

  /* Source grid */
  .src-grid{
    display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap:10px; margin-top:12px;
  }
  .src-card{
    border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:10px;
    display:grid; grid-template-columns: 84px 1fr auto; gap:10px; align-items:center;
  }
  .src-card.on{ background:#f8fafc; }
  .src-thumb{
    width:84px;height:56px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;
    display:flex; align-items:center; justify-content:center;
  }
  .src-thumb img{ width:100%;height:100%;object-fit:cover;display:block; }
  .src-noimg{ font-size:12px;color:#94a3b8; }
  .src-title{ font-weight:800; }
  .src-sub{ font-size:12px;color:#64748b; }
  .src-actions{ display:flex; gap:6px; align-items:center; }
  .src-empty{ padding:16px;color:#94a3b8; }

  @media (max-width: 1100px){
    .filters{ grid-template-columns:1fr 1fr; }
  }
`;

const modalCss = `
  .modal-backdrop{
    position:fixed; inset:0; background:rgba(0,0,0,.4);
    display:flex; align-items:center; justify-content:center; padding:20px; z-index:1000;
  }
  .modal{
    background:#fff; border-radius:16px; padding:18px; width:min(980px,96vw);
    max-height:90vh; overflow:auto; border:1px solid #e5e7eb;
  }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .grid .span2{ grid-column:span 2; }
  .actions{ display:flex; align-items:center; gap:10px; justify-content:flex-end; }
`;
