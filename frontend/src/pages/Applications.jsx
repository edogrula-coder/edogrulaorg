// src/pages/Applications.jsx — Admin Doğrulama Talepleri (Ultra Pro — city/district + docs gallery)
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";
import { ensureAccess } from "@/lib/admin/ensureAccess";
import { asset } from "@/lib/asset";
import ProofImages from "@/components/ProofImages";

const api = apiNamed || apiDefault;

function useDebounced(v, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

const STATUSES = [
  "all",
  "pending",
  "in_review",
  "approved",
  "rejected",
  "archived",
  "spam",
];

/* ---------- Helpers: docs/images normalizasyonu ---------- */
function normalizeDocEntry(entry) {
  if (!entry) return null;

  if (typeof entry === "string") {
    const path = entry;
    const lower = path.toLowerCase();
    let mimetype = "";
    if (lower.endsWith(".pdf")) mimetype = "application/pdf";
    else if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(lower)) mimetype = "image/*";
    return {
      path,
      url: path,
      mimetype,
      originalname: path.split("/").pop() || undefined,
    };
  }

  const path = entry.path || entry.url || "";
  const lower = String(path).toLowerCase();
  let mimetype = entry.mimetype || "";
  if (!mimetype && lower.endsWith(".pdf")) mimetype = "application/pdf";
  else if (!mimetype && /\.(png|jpe?g|webp|gif|bmp)$/i.test(lower))
    mimetype = "image/*";

  return {
    ...entry,
    path,
    url: entry.url || path,
    mimetype,
    originalname: entry.originalname || path.split("/").pop(),
  };
}

function extractDocumentsFromAny(source) {
  if (!source) return [];
  const out = [];
  const pushAll = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const e of arr) {
      const n = normalizeDocEntry(e);
      if (n && n.path) out.push(n);
    }
  };

  if (Array.isArray(source.documents)) pushAll(source.documents);
  else {
    pushAll(source.docs);
    pushAll(source.images);
  }

  // uniq url
  const seen = new Set();
  return out.filter((x) => {
    const u = x.url || x.path;
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

/* ---------- Toast ---------- */
function useToast() {
  const [toast, setToast] = useState(null);
  const tRef = useRef(null);

  const show = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const Toast = toast ? (
    <div
      role="status"
      aria-live="polite"
      className={`toast ${toast.type}`}
    >
      {toast.msg}
    </div>
  ) : null;

  return { show, Toast };
}

export default function Applications() {
  const navigate = useNavigate();
  const { show, Toast } = useToast();

  const basePath = "/admin/applications";

  // admin guard
  const [adminOK, setAdminOK] = useState(null); // null=checking
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await ensureAccess().catch(() => false);
      if (!alive) return;
      setAdminOK(!!ok);
      if (!ok) show("Bu sayfaya erişim yetkin yok.", "error");
    })();
    return () => {
      alive = false;
    };
  }, [show]);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // filters
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 450);
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("-createdAt");

  // list fetch with abort
  const abortRef = useRef(null);
  useEffect(() => {
    if (adminOK !== true) return;

    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;

    let alive = true;
    (async () => {
      setLoading(true);
      setError("");

      try {
        const params = { page, limit, sort };
        if (dq) params.q = dq;
        if (status !== "all") params.status = status;
        if (from) params.from = from;
        if (to) params.to = to;

        const res = await api.get(basePath, {
          params,
          signal: ac.signal,
          _quiet: true,
        });

        const data = res?.data || {};
        const list = data.applications || data.items || data.rows || [];

        if (!alive) return;
        setRows(list);
        const t = Number(data.total || list.length || 0);
        setTotal(t);
        setPages(
          Number(data.pages || Math.max(1, Math.ceil(t / (params.limit || 20))))
        );
        setSelected(new Set());
      } catch (e) {
        if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return;
        if (!alive) return;
        setError(e?.response?.data?.message || e?.message || "Liste yüklenemedi");
      } finally {
        alive && setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [adminOK, page, limit, dq, status, from, to, sort]);

  const allSelectedOnPage = useMemo(
    () => rows.length && rows.every((r) => selected.has(r._id)),
    [rows, selected]
  );

  const refresh = () => setPage((p) => p);

  function toggleSelect(id, v) {
    setSelected((s) => {
      const nx = new Set(s);
      v ? nx.add(id) : nx.delete(id);
      return nx;
    });
  }
  function toggleSelectAllOnPage(v) {
    v ? setSelected(new Set(rows.map((r) => r._id))) : setSelected(new Set());
  }

  async function bulk(op, extra) {
    if (!selected.size) return show("Seçili kayıt yok.", "error");

    if (op === "delete" && !window.confirm("Seçili kayıtlar kalıcı silinsin mi?"))
      return;

    setBulkBusy(true);
    try {
      await api.post(
        `${basePath}/bulk`,
        { ids: Array.from(selected), op, ...extra },
        { _quiet: false }
      );
      show("Toplu işlem tamamlandı.", "success");
      refresh();
    } catch (e) {
      show(e?.response?.data?.message || "Toplu işlem yapılamadı.", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function setStatusOne(row, st) {
    try {
      setBusyId(row._id);
      await api.patch(`${basePath}/${row._id}`, { status: st }, { _quiet: false });
      show("Durum güncellendi.", "success");
      refresh();
    } catch (e) {
      show("Durum güncellenemedi.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function approveOne(row) {
    try {
      setBusyId(row._id);
      await api.post(`${basePath}/${row._id}/approve`, null, { _quiet: false });
      show("Başvuru onaylandı.", "success");
      refresh();
      navigate("/admin/businesses", { replace: true });
    } catch (e) {
      show(
        e?.response?.data?.message || e?.message || "Onay sırasında hata oluştu",
        "error"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function delOne(row) {
    if (!window.confirm("Kalıcı olarak silinsin mi?")) return;
    try {
      setBusyId(row._id);
      await api.delete(`${basePath}/${row._id}`, { _quiet: false });
      show("Başvuru silindi.", "success");
      refresh();
    } catch (e) {
      show("Silme sırasında hata oluştu.", "error");
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const qs = new URLSearchParams();
    if (dq) qs.set("q", dq);
    if (status !== "all") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("sort", sort);
    window.open(`${basePath}/export.csv?${qs.toString()}`, "_blank", "noopener,noreferrer");
  }

  // create / edit modal
  const [editing, setEditing] = useState(null);
  const empty = {
    applicantName: "",
    businessName: "",
    phone: "",
    email: "",
    instagram: "",
    city: "",
    district: "",
    address: "",
    note: "",
    status: "pending",
    documents: [],
  };
  const openCreate = () => setEditing({ ...empty, _isNew: true });
  const openEdit = (row) => setEditing({ ...row, _isNew: false });
  const closeEdit = () => setEditing(null);

  async function saveEdit(data) {
    try {
      const payload = { ...data };
      if (payload._isNew) {
        await api.post(basePath, payload, { _quiet: false });
        show("Manuel başvuru oluşturuldu.", "success");
      } else {
        await api.patch(`${basePath}/${payload._id}`, payload, { _quiet: false });
        show("Başvuru güncellendi.", "success");
      }
      closeEdit();
      refresh();
    } catch (e) {
      show(e?.response?.data?.message || e?.message || "Kaydedilemedi", "error");
    }
  }

  if (adminOK === null) {
    return <div style={{ padding: 16 }}>Yetki kontrol ediliyor…</div>;
  }
  if (adminOK === false) {
    return (
      <div style={{ padding: 16 }}>
        <div className="card">
          <div style={{ fontWeight: 900, fontSize: 18 }}>Erişim yok</div>
          <div style={{ color: "#64748b", marginTop: 6 }}>
            Bu sayfa yalnızca admin kullanıcılar içindir.
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => navigate("/")}>Anasayfa</button>
          </div>
        </div>
        <style>{styles}</style>
        {Toast}
      </div>
    );
  }

  return (
    <section style={{ paddingBottom: 24 }}>
      <div className="head-row">
        <h2 style={{ margin: 0 }}>
          Başvurular <small style={{ color: "#64748b" }}>({total})</small>
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={openCreate}>+ Manuel Başvuru</button>
          <button
            className="btn btn-light"
            onClick={() => { setPage(1); refresh(); }}
          >
            ↻ Yenile
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <input
          placeholder="Ara (ad, işletme, telefon, e-posta, instagram, slug, id)"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(1); }}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(1); }}
        />
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          <option value="-createdAt">Yeniden → Eskiye</option>
          <option value="createdAt">Eskiden → Yeniye</option>
          <option value="-updatedAt">Son Güncellenen</option>
        </select>
        <div className="filter-actions">
          <button className="btn" onClick={exportCsv}>CSV</button>
          <button
            className="btn btn-light"
            onClick={() => {
              setQ(""); setStatus("all"); setFrom(""); setTo("");
              setSort("-createdAt"); setPage(1);
            }}
          >
            Sıfırla
          </button>
        </div>
      </div>

      {/* Bulk */}
      <div className="bulk-row">
        <button
          className="btn"
          disabled={!selected.size || bulkBusy}
          onClick={() => bulk("status", { value: "approved" })}
        >
          Onayla
        </button>
        <button
          className="btn btn-light"
          disabled={!selected.size || bulkBusy}
          onClick={() => bulk("status", { value: "rejected" })}
        >
          Reddet
        </button>
        <button
          className="btn btn-light"
          disabled={!selected.size || bulkBusy}
          onClick={() => bulk("status", { value: "archived" })}
        >
          Arşivle
        </button>
        <button
          className="btn btn-danger"
          disabled={!selected.size || bulkBusy}
          onClick={() => bulk("delete")}
        >
          Sil
        </button>

        {bulkBusy && <span className="muted">İşleniyor…</span>}
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={th}>
                <input
                  type="checkbox"
                  checked={!!allSelectedOnPage}
                  onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                  aria-label="Sayfadakilerin tamamını seç"
                />
              </th>
              <th style={th}>Başvuran</th>
              <th style={th}>İşletme</th>
              <th style={th}>İletişim</th>
              <th style={th}>İl/İlçe</th>
              <th style={th}>Durum</th>
              <th style={th}>Tarih</th>
              <th style={th}>İşlem</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="center">Yükleniyor…</td></tr>
            ) : rows?.length ? (
              rows.map((r) => {
                const instagram =
                  r.instagramUsername || r.instagramUrl || r.instagram || "";
                const instaHref =
                  instagram
                    ? instagram.startsWith("http")
                      ? instagram
                      : `https://instagram.com/${String(instagram).replace(/^@/, "")}`
                    : null;

                return (
                  <tr key={r._id}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={selected.has(r._id)}
                        onChange={(e) => toggleSelect(r._id, e.target.checked)}
                        aria-label="Başvuruyu seç"
                      />
                    </td>

                    <td style={td}>
                      <div className="cell-col">
                        <b>{r.applicantName || r.fullName || r.name || "-"}</b>
                        <small className="muted">{r.email || "-"}</small>
                      </div>
                    </td>

                    <td style={td}>
                      <div className="cell-col">
                        <span>{r.businessName || r.company || r.name || "-"}</span>
                        <small className="muted">{r.tradeTitle || r.legalName || ""}</small>
                      </div>
                    </td>

                    <td style={td}>
                      <div className="cell-col">
                        <span>{r.phone || r.phoneMobile || "-"}</span>
                        {instaHref && (
                          <a href={instaHref} target="_blank" rel="noreferrer noopener">
                            {instagram}
                          </a>
                        )}
                      </div>
                    </td>

                    <td style={td}>
                      {r.district || r.city
                        ? `${r.district || ""}${r.district && r.city ? ", " : ""}${r.city || ""}`
                        : r.address || ""}
                    </td>

                    <td style={td}><StatusBadge value={r.status} /></td>

                    <td style={td}>
                      {fmt(r.createdAt)}
                      {r.updatedAt ? (
                        <small className="muted"> • {fmt(r.updatedAt)}</small>
                      ) : null}
                    </td>

                    <td style={td}>
                      <div className="actions-row">
                        <button className="btn btn-ghost" onClick={() => openEdit(r)}>
                          Detay
                        </button>
                        <button
                          className="btn"
                          onClick={() => approveOne(r)}
                          disabled={busyId === r._id}
                          title="Onayla ve İşletmeler'e git"
                        >
                          {busyId === r._id ? "Onaylanıyor…" : "Onayla"}
                        </button>
                        <button className="btn btn-light" onClick={() => setStatusOne(r, "rejected")}>
                          Reddet
                        </button>
                        <button className="btn btn-light" onClick={() => setStatusOne(r, "archived")}>
                          Arşiv
                        </button>
                        <button className="btn btn-danger" onClick={() => delOne(r)}>
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="center">
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
        <div className="pager-controls">
          <button
            className="btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ‹ Önceki
          </button>

          <select value={page} onChange={(e) => setPage(parseInt(e.target.value, 10))}>
            {Array.from({ length: pages || 1 }).map((_, i) => (
              <option key={i} value={i + 1}>{i + 1}</option>
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
            onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
          >
            {[10, 20, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}/sayfa</option>
            ))}
          </select>
        </div>
      </div>

      {editing && (
        <EditModal
          basePath={basePath}
          data={editing}
          onClose={closeEdit}
          onSave={saveEdit}
        />
      )}

      <style>{styles}</style>
      {Toast}
    </section>
  );
}

function fmt(d) {
  try { return new Date(d).toLocaleString(); }
  catch { return "-"; }
}

const th = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  color: "#475569",
  letterSpacing: 0.2,
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const td = { padding: "10px 12px", verticalAlign: "top" };

function StatusBadge({ value }) {
  const map = {
    pending: { bg: "#fff7ed", fg: "#9a3412", text: "Beklemede" },
    in_review: { bg: "#eef2ff", fg: "#3730a3", text: "İncelemede" },
    approved: { bg: "#ecfdf5", fg: "#065f46", text: "Onaylandı" },
    rejected: { bg: "#fef2f2", fg: "#991b1b", text: "Reddedildi" },
    archived: { bg: "#f1f5f9", fg: "#334155", text: "Arşiv" },
    spam: { bg: "#ffe4e6", fg: "#9f1239", text: "Spam" },
  };
  const v = map[value] || { bg: "#e5e7eb", fg: "#374151", text: value || "-" };
  return (
    <span
      style={{
        background: v.bg,
        color: v.fg,
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {v.text}
    </span>
  );
}

function EditModal({ basePath, data, onClose, onSave }) {
  const [form, setForm] = useState({ ...data });
  const [saving, setSaving] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docs, setDocs] = useState(() => extractDocumentsFromAny(data));

  // focus + scroll lock
  const wrapRef = useRef(null);
  const lastFocusRef = useRef(null);

  useEffect(() => {
    lastFocusRef.current = document.activeElement;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Tab") trapFocus(e, wrapRef.current);
    };
    document.addEventListener("keydown", onKey, true);

    // autofocus
    setTimeout(() => {
      wrapRef.current?.querySelector("[data-autofocus]")?.focus?.();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.style.overflow = prevOverflow;
      lastFocusRef.current?.focus?.();
    };
  }, [onClose]);

  // Detay çek (belge yoksa)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (form._isNew || docs.length) return;
      setLoadingDocs(true);
      try {
        const res = await api.get(`${basePath}/${form._id}`, { _quiet: true });
        const item = res?.data?.application || {};
        if (cancelled) return;

        const loadedDocs = extractDocumentsFromAny(item);
        setDocs(loadedDocs);

        setForm((f) => ({
          ...f,
          applicantName: item.applicantName || item.fullName || f.applicantName || "",
          businessName: item.businessName || item.name || f.businessName || "",
          phone: item.phone || item.phoneMobile || f.phone || "",
          email: item.email || f.email || "",
          instagram:
            item.instagramUsername || item.instagramUrl || item.instagram || f.instagram || "",
          city: item.city ?? f.city ?? "",
          district: item.district ?? f.district ?? "",
          address: item.address ?? f.address ?? "",
          note: item.note ?? f.note ?? "",
          status: item.status || f.status || "pending",
          createdAt: item.createdAt || f.createdAt,
        }));
      } finally {
        !cancelled && setLoadingDocs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form._id, form._isNew, docs.length, basePath]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e?.preventDefault();
    setSaving(true);
    await onSave({ ...form, documents: docs });
    setSaving(false);
  }

  // ayrıştırılmış dosyalar
  const images = useMemo(
    () =>
      (docs || []).filter(
        (d) =>
          String(d.mimetype || "").startsWith("image/") ||
          /\.(png|jpe?g|webp|gif|bmp)$/i.test(d?.url || d?.path || "")
      ),
    [docs]
  );
  const pdfs = useMemo(
    () =>
      (docs || []).filter(
        (d) =>
          String(d.mimetype || "").includes("pdf") ||
          /\.pdf$/i.test(d?.url || d?.path || "")
      ),
    [docs]
  );

  const absImages = images.map((d) => asset(d.url || d.path));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={wrapRef} className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>
            {form._isNew ? "Manuel Başvuru" : "Başvuru Detayı"}
          </h3>
          <button className="btn btn-light" onClick={onClose} data-autofocus>
            Kapat
          </button>
        </div>

        {/* Özet + Belgeler */}
        <div className="cards">
          <div className="card">
            <div className="card-title">Başvuru Özeti</div>
            <div className="summary">
              <div><b>Başvuran:</b> {form.applicantName || "-"}</div>
              <div><b>İşletme:</b> {form.businessName || "-"}</div>
              <div><b>Telefon:</b> {form.phone || "-"}</div>
              <div><b>E-posta:</b> {form.email || "-"}</div>
              <div><b>Instagram:</b> {form.instagram || "-"}</div>
              <div>
                <b>İl/İlçe:</b>{" "}
                {form.district || form.city
                  ? `${form.district || ""}${form.district && form.city ? ", " : ""}${form.city || ""}`
                  : form.address || "-"}
              </div>
              <div><b>Durum:</b> {form.status}</div>
              {!form._isNew && <div><b>Oluşturma:</b> {fmt(form.createdAt)}</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Belgeler & Görseller</div>
            {loadingDocs ? (
              <div className="muted">Belgeler yükleniyor…</div>
            ) : (
              <>
                {absImages.length ? (
                  <ProofImages
                    allowWithoutRequestId
                    enableLightbox
                    files={absImages}
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
                  />
                ) : (
                  <div className="muted">Görsel yok.</div>
                )}

                {pdfs.length ? (
                  <div className="pdfs">
                    {pdfs.map((d, i) => {
                      const href = asset(d.url || d.path);
                      return (
                        <a
                          key={i}
                          className="pdf"
                          href={href}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          📄 {d.originalname || href.split("/").pop() || `belge-${i + 1}`}
                          {d.size ? ` • ${(d.size / 1024 / 1024).toFixed(2)} MB` : ""}
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="muted" style={{ marginTop: 8 }}>PDF yok.</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Form */}
        <form className="grid" onSubmit={submit}>
          <label>
            Başvuran Adı
            <input
              value={form.applicantName || ""}
              onChange={(e) => set("applicantName", e.target.value)}
              required
            />
          </label>

          <label>
            İşletme Adı
            <input
              value={form.businessName || ""}
              onChange={(e) => set("businessName", e.target.value)}
            />
          </label>

          <label>
            Telefon
            <input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
          </label>

          <label>
            E-posta
            <input
              type="email"
              value={form.email || ""}
              onChange={(e) => set("email", e.target.value)}
            />
          </label>

          <label>
            Instagram
            <input
              value={form.instagram || ""}
              onChange={(e) => set("instagram", e.target.value)}
            />
          </label>

          <label>
            İl
            <input value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
          </label>

          <label>
            İlçe
            <input value={form.district || ""} onChange={(e) => set("district", e.target.value)} />
          </label>

          <label className="span2">
            Adres (opsiyonel)
            <textarea
              rows={2}
              value={form.address || ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </label>

          <label className="span2">
            Not / Açıklama
            <textarea
              rows={3}
              value={form.note || ""}
              onChange={(e) => set("note", e.target.value)}
            />
          </label>

          <label>
            Durum
            <select
              value={form.status || "pending"}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUSES.filter((s) => s !== "all").map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          {!form._isNew && (
            <label>
              Oluşturma
              <input value={fmt(form.createdAt)} readOnly />
            </label>
          )}

          <div className="actions span2">
            {!form._isNew && (
              <button
                type="button"
                className="btn btn-light"
                onClick={() => window.open(`${basePath}/${form._id}`, "_blank", "noopener,noreferrer")}
              >
                JSON
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-light" onClick={onClose}>
              Kapat
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </form>

        <style>{modalStyles}</style>
      </div>
    </div>
  );
}

/** Focus trap for dialog */
function trapFocus(e, root) {
  if (!root) return;
  const FOCUSABLE =
    'a[href], button, textarea, input, select, summary, [tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden")
  );
  if (!nodes.length) return;

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const isShift = e.shiftKey;

  if (isShift && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!isShift && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

/* ============================ Styles ============================ */

const styles = `
  .btn{ padding:8px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:700; font-size:14px; transition:.15s; }
  .btn:hover{ background:#f8fafc; }
  .btn:disabled{ opacity:.6; cursor:not-allowed; }
  .btn-light{ background:#f8fafc; }
  .btn-ghost{ background:transparent; border:1px dashed #e5e7eb; }
  .btn-danger{ background:#fee2e2; border-color:#fecaca; color:#991b1b; }
  .btn-primary{ background:#2563eb; border-color:#2563eb; color:#fff; }
  input,select,textarea{ width:100%; padding:8px 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; font-size:14px; }
  input:focus,select:focus,textarea:focus{ outline:none; box-shadow:0 0 0 3px rgba(148,163,184,.25); border-color:#94a3b8; }
  .table-wrap{ border:1px solid #e5e7eb; border-radius:12px; overflow:auto; background:#fff; }
  .table{ width:100%; border-collapse:collapse; min-width:980px; }
  .table thead{ background:#f8fafc; position:sticky; top:0; z-index:1; }
  .table tbody tr{ border-top:1px solid #eef2f7; }
  .table tbody tr:hover td{ background:#fafafa; }
  .center{ padding:16px; text-align:center; }
  .cell-col{ display:flex; flex-direction:column; gap:2px; }
  .actions-row{ display:flex; gap:6px; flex-wrap:wrap; }
  .muted{ color:#6b7280; font-size:13px; }

  .head-row{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:10px; flex-wrap:wrap; }
  .filters{
    display:grid;
    grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr auto;
    gap:8px; margin-bottom:10px;
  }
  .filter-actions{ display:flex; gap:6px; }
  .bulk-row{ display:flex; gap:8px; margin-bottom:10px; align-items:center; flex-wrap:wrap; }
  .pager{ display:flex; align-items:center; justify-content:space-between; margin-top:10px; gap:8px; flex-wrap:wrap; }
  .pager-controls{ display:flex; gap:6px; align-items:center; }

  .card{ border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#fff; }

  .toast{
    position:fixed; left:50%; bottom:18px; transform:translateX(-50%);
    padding:8px 12px; border-radius:10px; font-weight:800; font-size:14px;
    color:#fff; box-shadow:0 10px 26px rgba(0,0,0,.18); z-index:99999;
  }
  .toast.info{ background:#0f172a; }
  .toast.success{ background:#10b981; }
  .toast.error{ background:#ef4444; }

  @media (max-width: 980px){
    .filters{ grid-template-columns: 1fr 1fr; }
    .table{ min-width: 880px; }
  }
`;

const modalStyles = `
  .modal-backdrop{
    position:fixed; inset:0; background:rgba(2,6,23,.55);
    display:flex; align-items:center; justify-content:center; padding:18px; z-index:1000;
  }
  .modal{
    background:#fff; border-radius:16px; padding:16px; width:min(1000px,96vw);
    max-height:90vh; overflow:auto; border:1px solid #e5e7eb;
    box-shadow:0 30px 80px rgba(2,6,23,.28);
  }
  .modal-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }

  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .grid .span2{ grid-column:span 2; }
  .actions{ display:flex; align-items:center; gap:10px; margin-top:6px; }

  .cards{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
  .card{ border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#fafafa; }
  .card-title{ font-weight:900; margin-bottom:8px; }
  .summary{ display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; font-size:14px; color:#334155; }

  .pdfs{ display:flex; flex-direction:column; gap:6px; margin-top:8px; }
  .pdf{
    display:inline-flex; align-items:center; gap:6px; padding:8px 10px;
    border-radius:10px; border:1px solid #e5e7eb; background:#fff; text-decoration:none; color:#0f172a; font-weight:700;
  }
  .muted{ color:#6b7280; font-size:13px; }

  @media (max-width: 900px){
    .cards{ grid-template-columns:1fr; }
    .grid{ grid-template-columns:1fr; }
    .grid .span2{ grid-column:span 1; }
    .summary{ grid-template-columns:1fr; }
  }
`;
