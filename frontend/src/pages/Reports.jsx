// src/pages/Blacklist.jsx — Admin Kara Liste (ULTRA PRO)
// Tailwind + shadcn/ui (Button/Input/Textarea/Card)
// İhbar + Destek odaklı, bulk işlemler, sort, gerçek refresh, detay modalı tablı

import React, { useEffect, useMemo, useState, useCallback } from "react";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";
import { ensureAccess } from "@/lib/admin/ensureAccess";

// shadcn/ui (common)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const api = apiNamed || apiDefault;
const basePath = "/blacklist";

/* ============================ Helpers ============================ */
function useDebounced(v, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function fmtDate(x) {
  if (!x) return "-";
  try {
    return new Date(x).toLocaleString();
  } catch {
    return String(x);
  }
}

const STATUS = ["all", "active", "removed", "expired", "pending"];
const SEVERITY = ["all", "low", "medium", "high", "critical"];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const maskName = (full) => {
  const s = String(full || "").trim();
  if (!s) return "-";
  const parts = s.split(/\s+/g);
  return parts
    .map((p) => {
      const first = p.charAt(0).toLowerCase();
      const rest = p.slice(1);
      const stars = rest.replace(/./g, "*");
      const take = clamp(stars.length, 2, 6);
      return `${first}${stars.slice(0, take)}`;
    })
    .join(" ");
};

const sortLabel = (s) => {
  const f = s?.replace("-", "");
  const dir = s?.startsWith("-") ? "desc" : "asc";
  return { f, dir };
};

/* ============================ Page ============================ */
export default function Blacklist() {
  const [adminOK, setAdminOK] = useState(false);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(20);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState(() => new Set());

  // filters
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 450);

  const [status, setStatus] = useState("active");
  const [severity, setSeverity] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [sort, setSort] = useState("-createdAt");
  const [onlyWithReports, setOnlyWithReports] = useState(false);

  // refresh tick (real refetch)
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  /* Auth check */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await ensureAccess().catch(() => false);
        if (!cancelled) setAdminOK(Boolean(ok));
      } catch {
        if (!cancelled) setAdminOK(false);
      }
    })();
    return () => (cancelled = true);
  }, []);

  /* Fetch list */
  useEffect(() => {
    if (!adminOK) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");

      const params = { page, limit, sort };
      if (dq) params.q = dq;
      if (status !== "all") params.status = status;
      if (severity !== "all") params.severity = severity;
      if (from) params.from = from;
      if (to) params.to = to;
      if (onlyWithReports) params.onlyWithReports = true;

      try {
        const res = await api.get(basePath, { params, _quiet: true });
        const data = res?.data || {};
        const list = data.blacklist || data.items || data.rows || data.data || [];

        if (!cancelled) {
          setRows(Array.isArray(list) ? list : []);
          const t = Number(data.total || list.length || 0);
          setTotal(t);

          const pg = Number(
            data.pages || Math.max(1, Math.ceil(t / (params.limit || 20)))
          );
          setPages(pg);

          setSelected(new Set());
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e?.response?.data?.message || e?.message || "Liste yüklenemedi"
          );
          setRows([]);
          setTotal(0);
          setPages(1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => (cancelled = true);
  }, [
    adminOK,
    page,
    limit,
    dq,
    status,
    severity,
    from,
    to,
    sort,
    onlyWithReports,
    tick,
  ]);

  /* Selection */
  const allSelectedOnPage = useMemo(
    () => rows.length && rows.every((r) => selected.has(r._id)),
    [rows, selected]
  );

  const toggleSelect = (id, v) =>
    setSelected((s) => {
      const nx = new Set(s);
      v ? nx.add(id) : nx.delete(id);
      return nx;
    });

  const toggleSelectAll = (v) =>
    v ? setSelected(new Set(rows.map((r) => r._id))) : setSelected(new Set());

  /* Sorting */
  const toggleSort = (field) =>
    setSort((cur) => {
      if (!cur || cur.replace("-", "") !== field) return `-${field}`;
      return cur.startsWith("-") ? field : `-${field}`;
    });

  /* Bulk */
  async function bulk(op, extra) {
    if (!selected.size) {
      alert("Seçili kayıt yok.");
      return;
    }
    const body = { ids: Array.from(selected), op, ...extra };
    try {
      await api.post(`${basePath}/bulk`, body, {
        params: { admin: 1 },
        _quiet: false,
      });
      refresh();
    } catch (e) {
      alert(e?.response?.data?.message || "Bulk işlem başarısız.");
    }
  }

  async function patchOne(id, body) {
    try {
      await api.patch(`${basePath}/${id}`, body, {
        params: { admin: 1 },
        _quiet: false,
      });
      refresh();
    } catch (e) {
      alert(e?.response?.data?.message || "Güncellenemedi.");
    }
  }

  async function delOne(id) {
    if (!window.confirm("Kalıcı olarak silinsin mi?")) return;
    try {
      await api.delete(`${basePath}/${id}`, {
        params: { admin: 1 },
        _quiet: false,
      });
      refresh();
    } catch (e) {
      alert(e?.response?.data?.message || "Silinemedi.");
    }
  }

  function exportCsv() {
    const qs = new URLSearchParams();
    if (dq) qs.set("q", dq);
    if (status !== "all") qs.set("status", status);
    if (severity !== "all") qs.set("severity", severity);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (onlyWithReports) qs.set("onlyWithReports", "1");

    // axios baseURL genelde ".../api"
    const base = api?.defaults?.baseURL || "";
    const url = `${base}${basePath}/export.csv?${qs.toString()}`;
    window.open(url, "_blank");
  }

  /* Create/Edit modal */
  const [editing, setEditing] = useState(null);
  const empty = {
    businessName: "",
    businessSlug: "",
    businessId: "",
    reason: "",
    notes: "",
    severity: "medium",
    status: "active",
    evidenceUrls: "",
    reportIds: "",
    expiresAt: "",
  };
  const openCreate = () => setEditing({ ...empty, _isNew: true });
  const openEdit = (row) =>
    setEditing({
      ...row,
      evidenceUrls: (row.evidenceUrls || []).join?.("\n") || row.evidenceUrls || "",
      reportIds: (row.reportIds || []).join?.(",") || row.reportIds || "",
      _isNew: false,
    });
  const closeEdit = () => setEditing(null);

  async function saveEdit(data) {
    const payload = { ...data };

    if (typeof payload.evidenceUrls === "string") {
      payload.evidenceUrls = payload.evidenceUrls
        .split(/\n|\r|\t|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof payload.reportIds === "string") {
      payload.reportIds = payload.reportIds
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    try {
      if (payload._isNew) {
        await api.post(basePath, payload, {
          params: { admin: 1 },
          _quiet: false,
        });
      } else {
        await api.patch(`${basePath}/${payload._id}`, payload, {
          params: { admin: 1 },
          _quiet: false,
        });
      }
      closeEdit();
      refresh();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || "Kaydedilemedi");
    }
  }

  const resetFilters = () => {
    setQ("");
    setStatus("active");
    setSeverity("all");
    setFrom("");
    setTo("");
    setOnlyWithReports(false);
    setSort("-createdAt");
    setPage(1);
  };

  const sortInfo = sortLabel(sort);

  /* ============================ UI ============================ */
  return (
    <section className="pb-6">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-xl font-black text-slate-900">
          Kara Liste{" "}
          <small className="font-semibold text-slate-500">({total})</small>
        </h2>

        <div className="flex flex-wrap gap-2">
          <Button onClick={openCreate}>+ Kara Listeye Ekle</Button>
          <Button variant="secondary" onClick={() => refresh()}>
            ↻ Yenile
          </Button>
          <Button variant="secondary" onClick={exportCsv}>
            CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-3">
        <CardContent className="grid grid-cols-1 gap-2 p-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Input
              placeholder="Ara (işletme adı, slug, sebep, id, telefon, e-posta, instagram)"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
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
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value);
              setPage(1);
            }}
          >
            {SEVERITY.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />

          <div className="flex items-center justify-between gap-2 md:col-span-6">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={onlyWithReports}
                onChange={(e) => {
                  setOnlyWithReports(e.target.checked);
                  setPage(1);
                }}
              />
              Sadece ihbarlı
            </label>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={resetFilters}>
                Sıfırla
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          disabled={!selected.size}
          onClick={() => bulk("status", { value: "active" })}
        >
          Aktif Yap
        </Button>
        <Button
          variant="secondary"
          disabled={!selected.size}
          onClick={() => bulk("status", { value: "removed" })}
        >
          Kaldır (Pasif)
        </Button>
        <Button
          variant="secondary"
          disabled={!selected.size}
          onClick={() => bulk("severity", { value: "high" })}
        >
          High
        </Button>
        <Button
          variant="secondary"
          disabled={!selected.size}
          onClick={() => bulk("severity", { value: "critical" })}
        >
          Critical
        </Button>
        <Button
          variant="destructive"
          disabled={!selected.size}
          onClick={() => bulk("delete")}
        >
          Sil
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-600">
              <tr>
                <th className="border-b px-3 py-2">
                  <input
                    type="checkbox"
                    checked={!!allSelectedOnPage}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <ThSort
                  label="İşletme"
                  active={sortInfo.f === "businessName"}
                  dir={sortInfo.dir}
                  onClick={() => toggleSort("businessName")}
                />
                <th className="border-b px-3 py-2">Sebep / Not</th>
                <ThSort
                  label="İhbar"
                  active={sortInfo.f === "reportCount"}
                  dir={sortInfo.dir}
                  onClick={() => toggleSort("reportCount")}
                />
                <ThSort
                  label="Önem"
                  active={sortInfo.f === "severity"}
                  dir={sortInfo.dir}
                  onClick={() => toggleSort("severity")}
                />
                <ThSort
                  label="Durum"
                  active={sortInfo.f === "status"}
                  dir={sortInfo.dir}
                  onClick={() => toggleSort("status")}
                />
                <ThSort
                  label="Tarih"
                  active={sortInfo.f === "createdAt"}
                  dir={sortInfo.dir}
                  onClick={() => toggleSort("createdAt")}
                />
                <th className="border-b px-3 py-2">İşlem</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Yükleniyor…
                  </td>
                </tr>
              ) : rows?.length ? (
                rows.map((r) => {
                  const repCount = (r.reportIds || r.reports || []).length || 0;
                  return (
                    <tr key={r._id} className="border-t">
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={selected.has(r._id)}
                          onChange={(e) =>
                            toggleSelect(r._id, e.target.checked)
                          }
                        />
                      </td>

                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col">
                          <b className="text-slate-900">
                            {r.businessName || r.name || "-"}
                          </b>
                          <small className="text-slate-500">
                            {r.businessSlug || r.slug || ""}
                          </small>
                          {r.businessId && (
                            <small className="text-slate-400">
                              {String(r.businessId).slice(-6)}
                            </small>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col gap-1">
                          <span>{r.reason || r.title || "-"}</span>
                          {r.notes && (
                            <small className="text-slate-500">
                              {String(r.notes).slice(0, 120)}
                              {String(r.notes).length > 120 ? "…" : ""}
                            </small>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 align-top">
                        <span className="rounded-full border px-2 py-1 text-xs">
                          {repCount} ihbar
                        </span>
                      </td>

                      <td className="px-3 py-2 align-top">
                        <SeverityBadge value={r.severity} />
                      </td>

                      <td className="px-3 py-2 align-top">
                        <StatusBadge value={r.status} />
                      </td>

                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col">
                          <span>{fmtDate(r.createdAt)}</span>
                          {r.expiresAt && (
                            <small className="text-slate-500">
                              Bitiş: {fmtDate(r.expiresAt)}
                            </small>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEdit(r)}
                          >
                            Detay
                          </Button>

                          {r.status !== "removed" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                patchOne(r._id, { status: "removed" })
                              }
                            >
                              Kaldır
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() =>
                                patchOne(r._id, { status: "active" })
                              }
                            >
                              Aktif Et
                            </Button>
                          )}

                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => delOne(r._id)}
                          >
                            Sil
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {error || "Kayıt yok."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>
          Toplam: <b>{total}</b> • Sayfa <b>{page}</b>/<b>{pages}</b>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ‹ Önceki
          </Button>

          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={page}
            onChange={(e) => setPage(parseInt(e.target.value, 10))}
          >
            {Array.from({ length: pages || 1 }).map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
          >
            Sonraki ›
          </Button>

          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
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

      {/* Modal */}
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

/* ============================ Small Components ============================ */
function ThSort({ label, active, dir, onClick }) {
  return (
    <th
      className="cursor-pointer select-none border-b px-3 py-2 hover:bg-slate-100"
      onClick={onClick}
      title="Sırala"
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {active && (
          <span className="text-[10px] text-slate-500">
            {dir === "desc" ? "↓" : "↑"}
          </span>
        )}
      </div>
    </th>
  );
}

function StatusBadge({ value }) {
  const map = {
    active: { bg: "bg-rose-100", fg: "text-rose-900", text: "Aktif" },
    removed: { bg: "bg-slate-100", fg: "text-slate-700", text: "Kaldırıldı" },
    expired: { bg: "bg-slate-200", fg: "text-slate-700", text: "Süresi bitti" },
    pending: { bg: "bg-amber-100", fg: "text-amber-900", text: "Beklemede" },
  };
  const v = map[value] || {
    bg: "bg-slate-100",
    fg: "text-slate-800",
    text: value || "-",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${v.bg} ${v.fg}`}>
      {v.text}
    </span>
  );
}

function SeverityBadge({ value }) {
  const map = {
    low: { bg: "bg-cyan-100", fg: "text-cyan-900", text: "Low" },
    medium: { bg: "bg-yellow-100", fg: "text-yellow-900", text: "Medium" },
    high: { bg: "bg-rose-100", fg: "text-rose-900", text: "High" },
    critical: { bg: "bg-red-200", fg: "text-red-900", text: "Critical" },
  };
  const v = map[value] || {
    bg: "bg-slate-100",
    fg: "text-slate-800",
    text: value || "-",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-black ${v.bg} ${v.fg}`}>
      {v.text}
    </span>
  );
}

/* ============================ Edit Modal ============================ */
function EditModal({ data, onClose, onSave }) {
  const [form, setForm] = useState({ ...data });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("detay"); // detay | delil | destek | ihbar

  const [supports, setSupports] = useState([]);
  const [supportsLoading, setSupportsLoading] = useState(false);

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const evidence = useMemo(() => {
    const raw =
      Array.isArray(form.evidenceUrls) && form.evidenceUrls.length
        ? form.evidenceUrls
        : String(form.evidenceUrls || "")
            .split(/\n|\r|\t|,/)
            .map((s) => s.trim())
            .filter(Boolean);
    return raw;
  }, [form.evidenceUrls]);

  const loadSupports = useCallback(async () => {
    if (!form._id) return;
    setSupportsLoading(true);
    try {
      const res = await api.get(`${basePath}/${form._id}/supports`, {
        params: { admin: 1 },
        _quiet: true,
      });
      const arr =
        res?.data?.supports || res?.data?.items || res?.data || [];
      setSupports(Array.isArray(arr) ? arr : []);
    } catch {
      setSupports([]);
    } finally {
      setSupportsLoading(false);
    }
  }, [form._id]);

  const loadReports = useCallback(async () => {
    if (!form._id) return;
    setReportsLoading(true);
    try {
      let res = await api.get("/report", {
        params: { blacklistId: form._id, admin: 1, limit: 100 },
        _quiet: true,
      });
      let items = res?.data?.items || res?.data?.reports || res?.data?.rows || [];
      if (!Array.isArray(items) || !items.length) {
        const q = form.businessSlug || form.businessName || form.name || "";
        if (q) {
          res = await api.get("/report", {
            params: { q, admin: 1, limit: 100 },
            _quiet: true,
          });
          items =
            res?.data?.items || res?.data?.reports || res?.data?.rows || [];
        }
      }
      setReports(Array.isArray(items) ? items : []);
    } catch {
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [form._id, form.businessSlug, form.businessName, form.name]);

  useEffect(() => {
    if (!form._isNew) {
      loadSupports();
      loadReports();
    }
  }, [form._id]); // eslint-disable-line

  async function submit(e) {
    e?.preventDefault();
    setSaving(true);
    await onSave({ ...form, evidenceUrls: evidence });
    setSaving(false);
  }

  const patchSupport = async (sid, body) => {
    try {
      await api.patch(`${basePath}/${form._id}/supports/${sid}`, body, {
        params: { admin: 1 },
        _quiet: false,
      });
      await loadSupports();
    } catch {}
  };

  const delSupport = async (sid) => {
    if (!window.confirm("Bu destek kaydı silinsin mi?")) return;
    try {
      await api.delete(`${basePath}/${form._id}/supports/${sid}`, {
        params: { admin: 1 },
        _quiet: false,
      });
      await loadSupports();
    } catch {}
  };

  const firstReporterMasked = useMemo(() => {
    if (!reports?.length) return "-";
    const sorted = [...reports].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    const r = sorted[0];
    return maskName(r?.reporterName || r?.reporterEmail || "-");
  }, [reports]);

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-2xl border bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-black">
            {form._isNew ? "Kara Listeye Ekle" : "Kayıt Detayı"}
          </h3>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Kapat
          </Button>
        </div>

        {!form._isNew && (
          <div className="mb-3 flex flex-wrap gap-2">
            {["detay", "delil", "destek", "ihbar"].map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tab === t ? "default" : "secondary"}
                onClick={() => setTab(t)}
              >
                {t === "detay"
                  ? "Detay"
                  : t === "delil"
                  ? "Deliller"
                  : t === "destek"
                  ? "Destekler"
                  : "İhbarlar"}
              </Button>
            ))}
          </div>
        )}

        {/* DETAY */}
        {(tab === "detay" || form._isNew) && (
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                İşletme Adı
              </label>
              <Input
                value={form.businessName || form.name || ""}
                onChange={(e) => set("businessName", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                İşletme Slug
              </label>
              <Input
                value={form.businessSlug || ""}
                onChange={(e) => set("businessSlug", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                İşletme ID
              </label>
              <Input
                value={form.businessId || ""}
                onChange={(e) => set("businessId", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">
                  Önem
                </label>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={form.severity || "medium"}
                  onChange={(e) => set("severity", e.target.value)}
                >
                  {["low", "medium", "high", "critical"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">
                  Durum
                </label>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={form.status || "active"}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {["active", "removed", "expired", "pending"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Sebep
              </label>
              <Input
                value={form.reason || ""}
                onChange={(e) => set("reason", e.target.value)}
                placeholder="örn. Onaylanmış dolandırıcılık vakaları"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Not / Detay
              </label>
              <Textarea
                rows={4}
                value={form.notes || ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                Bitiş (ops.)
              </label>
              <Input
                type="datetime-local"
                value={
                  form.expiresAt
                    ? new Date(form.expiresAt).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  set(
                    "expiresAt",
                    e.target.value
                      ? new Date(e.target.value).toISOString()
                      : ""
                  )
                }
              />
            </div>

            {!form._isNew && (
              <div className="flex items-end text-xs text-slate-500">
                İlk rapor eden: <b className="ml-1 text-slate-800">{firstReporterMasked}</b>
              </div>
            )}

            <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={onClose}>
                Kapat
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </form>
        )}

        {/* DELİLLER */}
        {tab === "delil" && !form._isNew && (
          <Card className="mt-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black">Delil URL’leri</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {evidence.length ? (
                evidence.map((u, i) => (
                  <a
                    key={i}
                    href={u}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-full border px-3 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50"
                  >
                    Ek {i + 1}
                  </a>
                ))
              ) : (
                <div className="text-sm text-slate-500">Delil yok.</div>
              )}
            </CardContent>
          </Card>
        )}

        {/* DESTEKLER */}
        {tab === "destek" && !form._isNew && (
          <div className="mt-2 space-y-2">
            {supportsLoading ? (
              <div className="text-sm text-slate-500">Yükleniyor…</div>
            ) : supports.length ? (
              supports.map((s) => (
                <div
                  key={s._id || s.id}
                  className="rounded-xl border bg-slate-50 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <b>{maskName(s.name || s.fullName || s.email || "destekçi")}</b>
                      <small className="text-slate-500">
                        {fmtDate(s.createdAt || s.date || s.supportedAt)}{" "}
                        {s.status ? `• ${s.status}` : ""}
                      </small>
                    </div>
                    <div className="flex gap-2">
                      {s.status !== "approved" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            patchSupport(s._id || s.id, { status: "approved" })
                          }
                        >
                          Onayla
                        </Button>
                      )}
                      {s.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            patchSupport(s._id || s.id, { status: "rejected" })
                          }
                        >
                          Reddet
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => delSupport(s._id || s.id)}
                      >
                        Sil
                      </Button>
                    </div>
                  </div>
                  {(s.comment || s.note) && (
                    <div className="mt-2 text-sm text-slate-800">
                      {s.comment || s.note}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">
                Henüz destek kaydı yok.
              </div>
            )}
          </div>
        )}

        {/* İHBARLAR */}
        {tab === "ihbar" && !form._isNew && (
          <div className="mt-2 overflow-hidden rounded-xl border bg-white">
            {reportsLoading ? (
              <div className="px-4 py-6 text-sm text-slate-500">
                Yükleniyor…
              </div>
            ) : reports.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold text-slate-600">
                    <tr>
                      <th className="border-b px-3 py-2">İhbar</th>
                      <th className="border-b px-3 py-2">Mağdur</th>
                      <th className="border-b px-3 py-2">Durum</th>
                      <th className="border-b px-3 py-2">Tarih</th>
                      <th className="border-b px-3 py-2">Delil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r._id} className="border-t">
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col">
                            <b>{r.name || "İhbar"}</b>
                            <small className="text-slate-500">
                              {(r.desc || "").slice(0, 140)}
                              {(r.desc || "").length > 140 ? "…" : ""}
                            </small>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {maskName(r.reporterName || r.reporterEmail || "-")}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span className="rounded-full border px-2 py-1 text-xs">
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {fmtDate(r.createdAt)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {Array.isArray(r.evidenceFiles) && r.evidenceFiles.length ? (
                            <div className="flex flex-wrap gap-1">
                              {r.evidenceFiles.slice(0, 3).map((u, i) => (
                                <a
                                  key={i}
                                  href={u}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="rounded-full border px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                                >
                                  Ek {i + 1}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">yok</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-slate-500">
                İlişkili ihbar bulunamadı.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
