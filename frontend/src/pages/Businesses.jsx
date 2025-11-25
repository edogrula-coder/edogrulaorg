// src/pages/admin/Businesses.jsx — Ultra Pro Admin List + Detay + Medya Yönetimi (v2)
import React, { useEffect, useMemo, useState, useCallback } from "react";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";
import { ensureAccess } from "@/lib/admin/ensureAccess";

const api = apiNamed || apiDefault;

/* ========================================================
   Küçük yardımcılar
   ======================================================== */
function cls(...xs) {
  return xs.filter(Boolean).join(" ");
}

function useDebounced(value, delay = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const STATUSES = ["all", "approved", "pending", "rejected", "archived"];
const VERIFIEDS = ["all", "true", "false"];
const BUSINESS_TYPES = ["all", "bungalov", "villa", "glamping", "otel", "diğer"];

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString("tr-TR");
  } catch {
    return "-";
  }
}

const th = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  color: "#475569",
  letterSpacing: 0.2,
  borderBottom: "1px solid #e5e7eb",
};
const td = { padding: "10px 12px", verticalAlign: "top" };

const normalizeList = (data) => {
  const list = Array.isArray(data?.businesses)
    ? data.businesses
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.rows)
    ? data.rows
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : [];
  return list;
};

const toLower = (x) => String(x || "").toLowerCase();

const inRange = (d, from, to) => {
  const t = d ? new Date(d).getTime() : 0;
  if (from) {
    const f = new Date(from).getTime();
    if (t < f) return false;
  }
  if (to) {
    const tt = new Date(to).getTime() + 24 * 3600 * 1000 - 1;
    if (t > tt) return false;
  }
  return true;
};

const sortByField = (arr, sort) => {
  if (!sort) return arr;
  const desc = sort.startsWith("-");
  const field = sort.replace("-", "");
  const dir = desc ? -1 : 1;

  const getV = (o) => o?.[field];

  return [...arr].sort((a, b) => {
    const va = getV(a);
    const vb = getV(b);

    // Tarih/number heuristiği
    const da = va ? new Date(va).getTime() : NaN;
    const db = vb ? new Date(vb).getTime() : NaN;
    if (!Number.isNaN(da) && !Number.isNaN(db)) return (da - db) * dir;

    const na = typeof va === "number" ? va : Number(va);
    const nb = typeof vb === "number" ? vb : Number(vb);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * dir;

    return String(va ?? "").localeCompare(String(vb ?? ""), "tr") * dir;
  });
};

/* ========================================================
   Ana sayfa bileşeni
   ======================================================== */
export default function Businesses() {
  const [adminOK, setAdminOK] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  // filtreler
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 450);
  const [status, setStatus] = useState("all");
  const [verified, setVerified] = useState("all");
  const [type, setType] = useState("all");
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("-createdAt");

  const adminPrefix = adminOK ? "/admin" : "";
  const basePath = `${adminPrefix}/businesses`;

  const callAdminPublic = async (adminFn, pubFn) => {
    try {
      return await adminFn();
    } catch {
      return await pubFn();
    }
  };

  // ilk erişim + her parametre değişiminde listeyi getir
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");

      const ok = await ensureAccess().catch(() => false);
      if (!cancelled) setAdminOK(Boolean(ok));

      const prefix = ok ? "/admin" : "";
      const params = { page, limit, sort };

      if (dq) params.q = dq;
      if (status !== "all") params.status = status;
      if (verified !== "all") params.verified = verified; // backend string bekliyorsa ok
      if (type !== "all") params.type = type;
      if (onlyFeatured) params.featured = 1;
      if (from) params.from = from;
      if (to) params.to = to;

      let usedAllFallback = false;

      try {
        // Önce paginated endpointi dene
        let res;
        try {
          res = await api.get(`${prefix}/businesses`, { params, _quiet: true });
        } catch {
          usedAllFallback = true;
          res = await api.get(`${prefix}/businesses/all`, { _quiet: true });
        }

        const data = res?.data || {};
        let listRaw = normalizeList(data);

        // Eğer /all geldiyse veya total/pages yoksa client-side pipeline
        const hasServerPaging =
          Number(data.total) > 0 || Number(data.pages) > 0;

        if (usedAllFallback || !hasServerPaging) {
          let list = [...listRaw];

          // q filter
          if (dq) {
            const needle = dq.toLowerCase();
            list = list.filter((b) => {
              const hay = [
                b.name,
                b.title,
                b.slug,
                b.phone,
                b.mobile,
                b.phoneMobile,
                b.email,
                b.instagramUsername,
                b.instagramUrl,
                b.website,
                b.city,
                b.district,
                b.address,
                b.description,
                b.desc,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              return hay.includes(needle);
            });
          }

          // status
          if (status !== "all") {
            list = list.filter(
              (b) => toLower(b.status) === toLower(status)
            );
          }

          // verified
          if (verified !== "all") {
            const want = verified === "true";
            list = list.filter((b) => !!b.verified === want);
          }

          // type
          if (type !== "all") {
            list = list.filter((b) => toLower(b.type) === toLower(type));
          }

          // featured
          if (onlyFeatured) {
            list = list.filter((b) => !!b.featured);
          }

          // date range (createdAt)
          if (from || to) {
            list = list.filter((b) =>
              inRange(b.createdAt || b.updatedAt, from, to)
            );
          }

          // sort
          list = sortByField(list, sort);

          const t = list.length;
          const pgs = Math.max(1, Math.ceil(t / (limit || 20)));
          const start = (page - 1) * limit;
          const sliced = list.slice(start, start + limit);

          if (!cancelled) {
            setRows(sliced);
            setTotal(t);
            setPages(pgs);
            setSelected(new Set());
          }
        } else {
          // normal server paging
          const t = Number(data.total || listRaw.length || 0);
          const pgs = Number(
            data.pages || Math.max(1, Math.ceil(t / (limit || 20)))
          );

          if (!cancelled) {
            setRows(listRaw);
            setTotal(t);
            setPages(pgs);
            setSelected(new Set());
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
              err?.message ||
              "Liste yüklenemedi"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, limit, dq, status, verified, type, onlyFeatured, from, to, sort]);

  /* =================== Actions =================== */
  const refresh = () => setPage((p) => p);

  async function onDeleteOne(row) {
    if (!row?._id) return;
    if (
      !window.confirm(
        `Silinsin mi?\n${row.name || row.title || row.slug || row._id}`
      )
    )
      return;

    await callAdminPublic(
      () => api.delete(`/admin/businesses/${row._id}`, { _quiet: false }),
      () => api.delete(`/businesses/${row._id}`, { _quiet: false })
    ).catch(() => {});
    refresh();
  }

  async function onBulk(op, value) {
    if (!selected.size) return alert("Seçili kayıt yok.");
    const ids = Array.from(selected);

    await callAdminPublic(
      () =>
        api.post(
          `/admin/businesses/bulk`,
          { ids, op, value },
          { _quiet: false }
        ),
      () =>
        api.post(`/businesses/bulk`, { ids, op, value }, { _quiet: false })
    ).catch(() => {});
    refresh();
  }

  async function onExportCsv() {
    const p = new URLSearchParams();
    if (dq) p.set("q", dq);
    if (status !== "all") p.set("status", status);
    if (verified !== "all") p.set("verified", verified);
    if (type !== "all") p.set("type", type);
    if (onlyFeatured) p.set("featured", "1");
    if (from) p.set("from", from);
    if (to) p.set("to", to);

    const urlAdmin = `/admin/businesses/export.csv?${p.toString()}`;
    const urlPub = `/businesses/export.csv?${p.toString()}`;

    // admin url açmayı dene, olmazsa public
    const w = window.open(urlAdmin, "_blank");
    if (!w) window.open(urlPub, "_blank");
  }

  /* =================== Create / Edit =================== */
  const [editing, setEditing] = useState(null);

  const emptyBiz = {
    _isNew: true,
    name: "",
    slug: "",
    phone: "",
    mobile: "",
    email: "",
    instagramUsername: "",
    instagramUrl: "",
    website: "",
    address: "",
    description: "",
    status: "pending",
    verified: false,
    featured: false,
    city: "",
    district: "",
    type: "bungalov",
  };

  function openCreate() {
    setEditing({ ...emptyBiz, _isNew: true });
  }
  function openEdit(row) {
    setEditing({ ...row, _isNew: false });
  }
  function closeEdit() {
    setEditing(null);
  }

  function handleSaved(updated) {
    if (updated && updated._id) {
      setRows((list) => {
        const exists = list.some((b) => b._id === updated._id);
        if (!exists) return [updated, ...list];
        return list.map((b) => (b._id === updated._id ? updated : b));
      });
    } else {
      refresh();
    }
  }

  /* =================== Table helpers =================== */
  function toggleSelect(id, v) {
    setSelected((s) => {
      const nx = new Set(s);
      v ? nx.add(id) : nx.delete(id);
      return nx;
    });
  }
  function toggleSelectAllOnPage(v) {
    if (v) setSelected(new Set(rows.map((r) => r._id).filter(Boolean)));
    else setSelected(new Set());
  }

  function toggleSort(field) {
    setSort((cur) => {
      if (!cur || cur.replace("-", "") !== field) return field;
      if (!cur.startsWith("-")) return `-${field}`;
      return field;
    });
  }

  const allSelectedOnPage = useMemo(
    () => rows.length && rows.every((r) => selected.has(r._id)),
    [rows, selected]
  );

  /* =================== UI =================== */
  return (
    <section style={{ paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>
          İşletmeler{" "}
          <small style={{ color: "#64748b" }}>
            ({total || rows.length})
          </small>
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={openCreate} className="btn">+ Yeni İşletme</button>
          <button onClick={() => setPage(1) || refresh()} className="btn" title="Yenile">↻ Yenile</button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 0.7fr",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <input
          placeholder="Ara (ad, slug, telefon, instagram, e-posta...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select value={verified} onChange={(e) => { setVerified(e.target.value); setPage(1); }}>
          {VERIFIEDS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={onlyFeatured}
              onChange={(e) => { setOnlyFeatured(e.target.checked); setPage(1);}}
            />
            <span style={{ fontSize: 12, color: "#475569" }}>Öne çıkan</span>
          </label>

          <button onClick={onExportCsv} className="btn" title="CSV indir">CSV</button>

          <button
            onClick={() => {
              setQ("");
              setStatus("all");
              setVerified("all");
              setType("all");
              setOnlyFeatured(false);
              setFrom("");
              setTo("");
              setSort("-createdAt");
              setPage(1);
            }}
            className="btn btn-light"
          >
            Sıfırla
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#64748b", alignSelf: "center", marginRight: 6 }}>
          Seçili: <b>{selected.size}</b>
        </div>

        <button onClick={() => onBulk("verify")} disabled={!selected.size} className="btn">Doğrula</button>
        <button onClick={() => onBulk("unverify")} disabled={!selected.size} className="btn btn-light">Doğrulamayı Kaldır</button>

        <button onClick={() => onBulk("feature")} disabled={!selected.size} className="btn">Öne Çıkar</button>
        <button onClick={() => onBulk("unfeature")} disabled={!selected.size} className="btn btn-light">Öne Çıkarmayı Kaldır</button>

        <button onClick={() => onBulk("status", "approved")} disabled={!selected.size} className="btn">Onayla</button>
        <button onClick={() => onBulk("status", "rejected")} disabled={!selected.size} className="btn btn-light">Reddet</button>

        <button onClick={() => onBulk("delete")} disabled={!selected.size} className="btn btn-danger">Sil</button>
      </div>

      {/* Table */}
      <div className={cls("card")} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={th}>
                <input
                  type="checkbox"
                  checked={!!allSelectedOnPage}
                  onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                />
              </th>

              <ThSort
                label="#"
                onClick={() => toggleSort("createdAt")}
                active={sort.replace("-", "") === "createdAt"}
                desc={sort.startsWith("-") && sort.includes("createdAt")}
              />

              <ThSort
                label="Ad"
                onClick={() => toggleSort("name")}
                active={sort.replace("-", "") === "name"}
                desc={sort.startsWith("-") && sort.includes("name")}
              />

              <th style={th}>Durum</th>
              <th style={th}>Doğrulama</th>
              <th style={th}>Öne Çıkan</th>
              <th style={th}>Telefon</th>
              <th style={th}>Instagram</th>
              <ThSort
                label="Güncellenme"
                onClick={() => toggleSort("updatedAt")}
                active={sort.replace("-", "") === "updatedAt"}
                desc={sort.startsWith("-") && sort.includes("updatedAt")}
              />
              <th style={th}>İşlem</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ padding: 16, textAlign: "center" }}>Yükleniyor…</td>
              </tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r._id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={selected.has(r._id)}
                      onChange={(e) => toggleSelect(r._id, e.target.checked)}
                    />
                  </td>

                  <td style={td} title={r._id}>{r._id?.slice(-6)}</td>

                  <td style={td}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <b>{r.name || r.title || "-"}</b>
                      <small style={{ color: "#6b7280" }}>{r.slug || "-"}</small>
                      <small style={{ color: "#94a3b8" }}>{r.type || ""}</small>

                      {r.slug && (
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <a className="pill" href={`/b/${r.slug}`} target="_blank" rel="noreferrer noopener">Profil</a>
                          <a className="pill" href={`/kara-liste/${r.slug}`} target="_blank" rel="noreferrer noopener">Kara Liste</a>
                        </div>
                      )}
                    </div>
                  </td>

                  <td style={td}><StatusBadge value={r.status} /></td>
                  <td style={td}>{r.verified ? "✔︎" : "—"}</td>
                  <td style={td}>{r.featured ? "⭐" : "—"}</td>

                  <td style={td}>{r.phone || r.mobile || r.phoneMobile || "-"}</td>

                  <td style={td}>
                    {r.instagramUrl ? (
                      <a href={r.instagramUrl} target="_blank" rel="noreferrer noopener">
                        {r.instagramUsername || r.instagramUrl}
                      </a>
                    ) : (
                      r.instagramUsername || "-"
                    )}
                  </td>

                  <td style={td}>{fmtDate(r.updatedAt || r.createdAt)}</td>

                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-ghost" onClick={() => openEdit(r)}>Düzenle</button>
                      <button className="btn btn-danger" onClick={() => onDeleteOne(r)}>Sil</button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} style={{ padding: 16, textAlign: "center" }}>
                  {error || "Kayıt yok"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <div style={{ color: "#64748b" }}>
          Toplam: {total} • Sayfa {page}/{pages}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            ‹ Önceki
          </button>

          <select value={page} onChange={(e) => setPage(parseInt(e.target.value, 10))}>
            {Array.from({ length: pages || 1 }).map((_, i) => (
              <option key={i} value={i + 1}>{i + 1}</option>
            ))}
          </select>

          <button className="btn" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
            Sonraki ›
          </button>

          <select value={limit} onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}>
            {[10, 20, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}/sayfa</option>
            ))}
          </select>
        </div>
      </div>

      {/* Detay / Edit Modal */}
      {editing && (
        <BusinessDetailModal
          open={!!editing}
          initial={editing}
          basePath={basePath}
          onClose={closeEdit}
          onSaved={handleSaved}
        />
      )}

      <style>{css}</style>
    </section>
  );
}

/* ========================================================
   Küçük sunum bileşenleri
   ======================================================== */
function ThSort({ label, onClick, active, desc }) {
  return (
    <th style={th}>
      <button onClick={onClick} className="btn btn-ghost" title="Sırala">
        {label} {active ? (desc ? "▼" : "▲") : ""}
      </button>
    </th>
  );
}

function StatusBadge({ value }) {
  const map = {
    approved: { bg: "#ecfdf5", fg: "#065f46", text: "Onaylı" },
    pending: { bg: "#fff7ed", fg: "#9a3412", text: "Beklemede" },
    rejected: { bg: "#fef2f2", fg: "#991b1b", text: "Reddedildi" },
    archived: { bg: "#f1f5f9", fg: "#334155", text: "Arşiv" },
  };
  const v = map[value] || { bg: "#eef2ff", fg: "#3730a3", text: value || "-" };
  return (
    <span style={{ background: v.bg, color: v.fg, padding: "4px 8px", borderRadius: 999, fontSize: 12 }}>
      {v.text}
    </span>
  );
}

/* ========================================================
   Detay + Edit Modal (Başvuru Detayı tarzı + medya CRUD)
   ======================================================== */
function FieldRow({ label, value }) {
  return (
    <div className="field-row">
      <div className="field-label">{label}:</div>
      <div className="field-value">{value || "-"}</div>
    </div>
  );
}

const slugifyTR = (s = "") =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/[ğ]/g, "g")
    .replace(/[ü]/g, "u")
    .replace(/[ş]/g, "s")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ç]/g, "c")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

function buildForm(src) {
  const s = src || {};
  return {
    _id: s._id,
    _isNew: !!s._isNew,
    name: s.name || "",
    slug: s.slug || "",
    phone: s.phone || "",
    mobile: s.mobile || s.phoneMobile || "",
    email: s.email || "",
    instagramUrl: s.instagramUrl || "",
    instagramUsername: s.instagramUsername || "",
    website: s.website || "",
    address: s.address || "",
    description: s.description || s.desc || "",
    status: s.status || "pending",
    verified: !!s.verified,
    featured: !!s.featured,
    city: s.city || "",
    district: s.district || "",
    type: s.type || "bungalov",
  };
}

function BusinessDetailModal({ open, initial, basePath, onClose, onSaved }) {
  const [business, setBusiness] = useState(initial || null);
  const [form, setForm] = useState(() => buildForm(initial));
  const [loading, setLoading] = useState(!!(initial && !initial._isNew && initial._id));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({ cover: false, gallery: false, docs: false });

  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => setToast((prev) => (prev && prev.id === id ? null : prev)), 2600);
  };

  useEffect(() => {
    setBusiness(initial || null);
    setForm(buildForm(initial));
    setLoading(!!(initial && !initial._isNew && initial._id));
  }, [initial]);

  useEffect(() => {
    const canFetch = initial && !initial._isNew && initial._id && basePath;
    if (!canFetch) { setLoading(false); return; }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`${basePath}/${initial._id}`, { _quiet: true });
        const full = data.business || data.item || data;
        if (!cancelled && full) {
          setBusiness(full);
          setForm(buildForm(full));
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [initial?._id, initial?._isNew, basePath]);

  if (!open || !form) return null;

  const cover =
    business?.coverImage?.url ||
    business?.coverImage?.path ||
    business?.coverImage ||
    null;
  const gallery = Array.isArray(business?.gallery) ? business.gallery : [];
  const docs = business?.docs || business?.documents || business?.files || [];

  const canUploadMedia = !form._isNew && !!form._id;

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  const handleNameBlur = () => {
    setForm((f) => {
      if (f.slug?.trim()) return f;
      return { ...f, slug: slugifyTR(f.name) };
    });
  };

  const genSlugNow = () => {
    setForm((f) => ({ ...f, slug: slugifyTR(f.name) }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        phone: form.phone.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim(),
        instagramUrl: form.instagramUrl.trim(),
        instagramUsername: form.instagramUsername.trim().replace(/^@+/, ""),
        website: form.website.trim(),
        address: form.address.trim(),
        description: form.description.trim(),
        status: form.status,
        verified: !!form.verified,
        featured: !!form.featured,
        city: form.city.trim(),
        district: form.district.trim(),
        type: form.type,
      };

      let res;
      if (form._isNew) res = await api.post(basePath, payload, { _quiet: false });
      else res = await api.patch(`${basePath}/${form._id}`, payload, { _quiet: false });

      const saved = res?.data?.business || res?.data || payload;
      setBusiness(saved);
      setForm(buildForm(saved));
      onSaved?.(saved);

      if (form._isNew) {
        // Create sonrası medyaya izin vermek için kapatmıyoruz
        showToast("İşletme oluşturuldu. Medya ekleyebilirsin.");
      } else {
        showToast("İşletme bilgileri güncellendi.");
      }
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || err?.message || "Kaydederken bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  async function patchBusiness(partial, quiet = true) {
    if (!form._id) return null;
    const { data } = await api.patch(`${basePath}/${form._id}`, partial, { _quiet: quiet });
    const updated = data.business || data.item || data;
    setBusiness(updated);
    setForm(buildForm(updated));
    onSaved?.(updated);
    return updated;
  }

  async function uploadFiles(files, kind, uploadKey) {
    if (!files || !files.length) return [];
    setUploading((u) => ({ ...u, [uploadKey]: true }));
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      if (kind) fd.append("kind", kind);
      if (form._id) fd.append("businessId", form._id);

      const prefix = basePath?.startsWith("/admin") ? "/admin" : "";
      const uploadUrl = `${prefix}/uploads/business`;

      const { data } = await api.post(uploadUrl, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        _quiet: false,
      });

      const raw = data.files || data.items || data.uploads || data;
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.filter(Boolean);
    } finally {
      setUploading((u) => ({ ...u, [uploadKey]: false }));
    }
  }

  async function handleChangeCoverFile(e) {
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length || !canUploadMedia) return;
    try {
      const uploaded = await uploadFiles([files[0]], "cover", "cover");
      const fileObj = uploaded[0];
      if (fileObj) {
        await patchBusiness({ coverImage: fileObj }, true);
        showToast("Kapak görseli güncellendi.");
      }
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || err?.message || "Kapak güncellenemedi.");
    }
  }

  async function handleRemoveCover() {
    if (!canUploadMedia) return;
    if (!window.confirm("Kapak görseli kaldırılsın mı?")) return;
    try {
      await patchBusiness({ coverImage: null }, true);
      showToast("Kapak görseli kaldırıldı.");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || err?.message || "Kapak kaldırılamadı.");
    }
  }

  async function handleAddGallery(e) {
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length || !canUploadMedia) return;
    try {
      const uploaded = await uploadFiles(files, "gallery", "gallery");
      const merged = [...gallery, ...uploaded];
      await patchBusiness({ gallery: merged }, true);
      showToast("Galeri güncellendi.");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || err?.message || "Galeri güncellenemedi.");
    }
  }

  async function handleRemoveGallery(index) {
    if (!canUploadMedia) return;
    const newGallery = gallery.filter((_, i) => i !== index);
    try {
      await patchBusiness({ gallery: newGallery }, true);
      showToast("Galeri görseli silindi.");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || err?.message || "Görsel silinemedi.");
    }
  }

  async function handleAddDocs(e) {
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length || !canUploadMedia) return;
    try {
      const uploaded = await uploadFiles(files, "docs", "docs");
      const merged = [...(Array.isArray(docs) ? docs : []), ...uploaded];
      await patchBusiness({ docs: merged }, true);
      showToast("Belgeler güncellendi.");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || err?.message || "Belgeler yüklenemedi.");
    }
  }

  async function handleRemoveDoc(index) {
    if (!canUploadMedia) return;
    const list = Array.isArray(docs) ? docs : [];
    const next = list.filter((_, i) => i !== index);
    try {
      await patchBusiness({ docs: next }, true);
      showToast("Belge silindi.");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || err?.message || "Belge silinemedi.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {form._isNew ? "Yeni İşletme" : "İşletme Detayı"}
            </div>
            {!form._isNew && (
              <div className="modal-subtitle">
                {business?.name} {business?.slug ? `· ${business.slug}` : ""}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn btn-light">
            Kapat
          </button>
        </div>

        <div className="modal-body">
          {!form._isNew && (
            <div className="top-grid">
              {/* Summary */}
              <div className="summary-card">
                <h3 className="summary-title">İşletme Özeti</h3>
                {loading ? (
                  <div className="muted">Yükleniyor…</div>
                ) : (
                  <div className="summary-body">
                    <FieldRow label="Ad" value={business?.name} />
                    <FieldRow label="Slug" value={business?.slug} />
                    <FieldRow label="Telefon" value={business?.phone || business?.mobile || business?.phoneMobile} />
                    <FieldRow label="E-posta" value={business?.email} />
                    <FieldRow label="Instagram" value={business?.instagramUrl || business?.instagramUsername} />
                    <FieldRow label="Web" value={business?.website} />
                    <FieldRow label="İl / İlçe" value={[business?.city, business?.district].filter(Boolean).join(" / ")} />
                    <FieldRow label="Tür" value={business?.type} />
                    <FieldRow label="Durum" value={business?.status} />
                    <FieldRow label="Doğrulandı mı?" value={business?.verified ? "Evet" : "Hayır"} />
                    <FieldRow label="Öne çıkar" value={business?.featured ? "Evet" : "Hayır"} />
                    <FieldRow label="Açıklama" value={business?.description || business?.desc} />
                    <FieldRow label="Oluşturma" value={fmtDate(business?.createdAt)} />
                    <FieldRow label="Son Güncelleme" value={fmtDate(business?.updatedAt)} />
                  </div>
                )}
              </div>

              {/* Media */}
              <div className="media-card">
                <h3 className="summary-title">Belgeler & Görseller</h3>

                {/* Cover */}
                <div className="media-block">
                  <div className="media-header-row">
                    <div className="media-label">Kapak Görseli</div>
                    {canUploadMedia && (
                      <div className="media-actions">
                        <label className="link-button">
                          Değiştir
                          <input type="file" accept="image/*" hidden onChange={handleChangeCoverFile} />
                        </label>
                        {cover && (
                          <button type="button" className="link-danger" onClick={handleRemoveCover}>
                            Kaldır
                          </button>
                        )}
                        {uploading.cover && <span className="muted">Yükleniyor…</span>}
                      </div>
                    )}
                  </div>

                  {cover ? (
                    <img src={cover} alt="Kapak" className="cover-img" />
                  ) : (
                    <div className="media-empty">Kapak görseli yok</div>
                  )}
                </div>

                {/* Gallery */}
                <div className="media-block">
                  <div className="media-header-row">
                    <div className="media-label">Galeri</div>
                    {canUploadMedia && (
                      <div className="media-actions">
                        <label className="link-button">
                          Görsel Ekle
                          <input type="file" multiple accept="image/*" hidden onChange={handleAddGallery} />
                        </label>
                        {uploading.gallery && <span className="muted">Yükleniyor…</span>}
                      </div>
                    )}
                  </div>

                  {gallery.length ? (
                    <div className="gallery-grid">
                      {gallery.map((g, idx) => {
                        const url = g.url || g.path || g.location || g;
                        return (
                          <div className="gallery-item" key={g._id || idx}>
                            <img src={url} alt="Galeri" className="gallery-img" />
                            {canUploadMedia && (
                              <button type="button" className="gallery-remove" onClick={() => handleRemoveGallery(idx)}>
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="media-empty">Galeri görseli yok</div>
                  )}
                </div>

                {/* Docs */}
                <div className="media-block">
                  <div className="media-header-row">
                    <div className="media-label">Belgeler</div>
                    {canUploadMedia && (
                      <div className="media-actions">
                        <label className="link-button">
                          Belge Yükle
                          <input type="file" multiple hidden onChange={handleAddDocs} />
                        </label>
                        {uploading.docs && <span className="muted">Yükleniyor…</span>}
                      </div>
                    )}
                  </div>

                  {Array.isArray(docs) && docs.length ? (
                    <div className="docs-list">
                      {docs.map((d, idx) => (
                        <div className="doc-row" key={d._id || idx}>
                          <a
                            href={d.url || d.path || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="doc-link"
                          >
                            📄 {d.originalName || d.name || d.filename || "Belge"}
                          </a>
                          {canUploadMedia && (
                            <button type="button" className="link-danger" onClick={() => handleRemoveDoc(idx)}>
                              Sil
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="media-empty">Belge yok</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Edit Form */}
          <form onSubmit={handleSubmit} className="edit-form">
            <h3 className="summary-title">İşletme Bilgilerini Güncelle</h3>

            <div className="form-grid">
              <div>
                <label className="field-caption">Ad</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  onBlur={handleNameBlur}
                  required
                />
              </div>

              <div>
                <label className="field-caption">Slug</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    name="slug"
                    value={form.slug}
                    onChange={handleChange}
                    placeholder="otomatik üretilebilir"
                  />
                  <button
                    type="button"
                    className="btn btn-light"
                    onClick={genSlugNow}
                    title="Ad'dan slug üret"
                  >
                    Üret
                  </button>
                </div>
              </div>

              <div>
                <label className="field-caption">Telefon</label>
                <input name="phone" value={form.phone} onChange={handleChange} />
              </div>

              <div>
                <label className="field-caption">Mobil</label>
                <input name="mobile" value={form.mobile} onChange={handleChange} />
              </div>

              <div>
                <label className="field-caption">E-posta</label>
                <input type="email" name="email" value={form.email} onChange={handleChange} />
              </div>

              <div>
                <label className="field-caption">Web Sitesi</label>
                <input name="website" value={form.website} onChange={handleChange} />
              </div>

              <div>
                <label className="field-caption">Instagram URL</label>
                <input name="instagramUrl" value={form.instagramUrl} onChange={handleChange} />
              </div>

              <div>
                <label className="field-caption">Instagram Kullanıcı</label>
                <input name="instagramUsername" value={form.instagramUsername} onChange={handleChange} />
              </div>

              <div>
                <label className="field-caption">İl</label>
                <input name="city" value={form.city} onChange={handleChange} />
              </div>

              <div>
                <label className="field-caption">İlçe</label>
                <input name="district" value={form.district} onChange={handleChange} />
              </div>

              <div>
                <label className="field-caption">Tür</label>
                <select name="type" value={form.type} onChange={handleChange}>
                  {BUSINESS_TYPES.filter((t) => t !== "all").map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-caption">Durum</label>
                <select name="status" value={form.status} onChange={handleChange}>
                  {STATUSES.filter((s) => s !== "all").map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="checkbox-row">
                <label className="checkbox-label">
                  <input type="checkbox" name="verified" checked={!!form.verified} onChange={handleChange} />
                  Doğrulandı mı?
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" name="featured" checked={!!form.featured} onChange={handleChange} />
                  Öne çıkar?
                </label>
              </div>
            </div>

            <div className="span2">
              <label className="field-caption">Adres</label>
              <textarea name="address" value={form.address} onChange={handleChange} rows={2} />
            </div>

            <div className="span2">
              <label className="field-caption">Açıklama</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={3} />
            </div>

            <div className="actions span2">
              <button type="button" className="btn btn-light" onClick={onClose}>İptal</button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </form>
        </div>

        {toast && (
          <div className={cls("toast", toast.type === "error" && "toast-error")}>
            {toast.message}
          </div>
        )}
      </div>

      <style>{modalCss}</style>
    </div>
  );
}

/* ========================================================
   Basit stiller
   ======================================================== */
const css = `
  .btn {
    padding:8px 12px;
    border-radius:10px;
    border:1px solid #e5e7eb;
    background:#fff;
    cursor:pointer;
    font-weight:600;
    font-size:13px;
  }
  .btn:hover { background:#f8fafc; }
  .btn-ghost { background:transparent; border:1px dashed #e5e7eb; }
  .btn-light { background:#f8fafc; }
  .btn-danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }

  input, select, textarea {
    width:100%;
    padding:8px 10px;
    border-radius:10px;
    border:1px solid #e5e7eb;
    background:#fff;
    font-size:13px;
  }
  textarea { resize: vertical; }

  .card { background:#fff; }

  .pill{
    display:inline-block;
    padding:4px 8px;
    border-radius:999px;
    border:1px solid #e5e7eb;
    font-size:12px;
    color:#2563eb;
    text-decoration:none;
  }
`;

const modalCss = `
  .modal-backdrop {
    position:fixed;
    inset:0;
    background:rgba(0,0,0,.4);
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    z-index:1000;
  }
  .modal {
    background:#fff;
    border-radius:16px;
    padding:18px;
    width:min(980px, 96vw);
    max-height:90vh;
    overflow:auto;
    border:1px solid #e5e7eb;
  }
  .modal-wide { width:min(1120px, 98vw); }

  .modal-header {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    padding-bottom:8px;
    border-bottom:1px solid #e5e7eb;
    margin-bottom:10px;
  }
  .modal-title { font-weight:600; font-size:16px; }
  .modal-subtitle { font-size:12px; color:#64748b; }

  .modal-body { display:flex; flex-direction:column; gap:16px; }
  .top-grid { display:grid; grid-template-columns: 1.1fr 1.1fr; gap:14px; }

  .summary-card, .media-card {
    background:#f8fafc;
    border-radius:12px;
    border:1px solid #e5e7eb;
    padding:10px 12px;
  }

  .summary-title {
    font-size:13px;
    font-weight:600;
    color:#475569;
    margin:0 0 8px 0;
  }

  .summary-body {
    display:flex;
    flex-direction:column;
    gap:4px;
    font-size:12px;
  }

  .field-row { display:flex; gap:6px; }
  .field-label {
    width:90px;
    font-weight:600;
    color:#64748b;
    font-size:11px;
    flex-shrink:0;
  }
  .field-value {
    font-size:12px;
    color:#0f172a;
    word-break:break-all;
  }

  .muted { font-size:11px; color:#94a3b8; }

  .media-block { margin-bottom:10px; }
  .media-header-row {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    margin-bottom:4px;
  }
  .media-label {
    font-size:11px;
    font-weight:600;
    color:#64748b;
  }
  .media-actions {
    display:flex;
    align-items:center;
    gap:6px;
    font-size:11px;
  }

  .cover-img {
    width:100%;
    height:170px;
    object-fit:cover;
    border-radius:10px;
    border:1px solid #e5e7eb;
  }
  .media-empty {
    font-size:11px;
    color:#94a3b8;
    border-radius:8px;
    border:1px dashed #cbd5f5;
    padding:10px;
    text-align:center;
  }

  .gallery-grid {
    display:grid;
    grid-template-columns: repeat(3, minmax(0,1fr));
    gap:4px;
  }
  .gallery-item {
    position:relative;
    border-radius:8px;
    overflow:hidden;
    border:1px solid #e5e7eb;
  }
  .gallery-img {
    width:100%;
    height:70px;
    object-fit:cover;
    display:block;
  }
  .gallery-remove {
    position:absolute;
    top:3px; right:3px;
    border:none; border-radius:999px;
    background:rgba(15,23,42,.8);
    color:#f9fafb;
    width:18px; height:18px;
    font-size:11px; cursor:pointer;
    line-height:18px; text-align:center;
  }
  .gallery-remove:hover { background:rgba(15,23,42,1); }

  .docs-list {
    display:flex;
    flex-direction:column;
    gap:4px;
  }
  .doc-row {
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
  }
  .doc-link {
    font-size:11px;
    color:#2563eb;
    text-decoration:none;
  }
  .doc-link:hover { text-decoration:underline; }

  .link-button, .link-danger {
    border:none; background:transparent; padding:0;
    cursor:pointer; font-size:11px;
  }
  .link-button { color:#2563eb; }
  .link-danger { color:#b91c1c; }
  .link-button:hover, .link-danger:hover { text-decoration:underline; }

  .edit-form {
    background:#fff;
    border-radius:12px;
    border:1px solid #e5e7eb;
    padding:10px 12px 12px 12px;
    display:grid;
    grid-template-columns: 1fr;
    gap:10px;
  }
  .edit-form .form-grid {
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:10px;
  }

  .field-caption {
    font-size:11px;
    color:#64748b;
    display:block;
    margin-bottom:3px;
  }

  .checkbox-row {
    display:flex;
    align-items:center;
    gap:10px;
    margin-top:6px;
  }
  .checkbox-label {
    font-size:11px;
    color:#475569;
    display:flex;
    align-items:center;
    gap:4px;
  }

  .span2 { grid-column:span 2; }

  .actions {
    display:flex;
    justify-content:flex-end;
    gap:10px;
    margin-top:4px;
  }

  .toast {
    position:fixed;
    right:20px; bottom:20px;
    background:#16a34a;
    color:#f9fafb;
    padding:10px 14px;
    border-radius:999px;
    font-size:13px;
    font-weight:600;
    box-shadow:0 12px 30px rgba(0,0,0,.18);
    animation:toast-in .2s ease-out;
    z-index:1100;
  }
  .toast-error { background:#b91c1c; }
  @keyframes toast-in {
    from { opacity:0; transform:translateY(6px); }
    to { opacity:1; transform:translateY(0); }
  }

  @media (max-width: 960px) {
    .top-grid { grid-template-columns: 1fr; }
    .edit-form .form-grid { grid-template-columns: 1fr; }
    .span2 { grid-column: span 1; }
  }
`;
