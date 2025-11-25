// frontend/src/components/AdminContent.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/axios-boot";

/* ============================ Utils ============================ */

const toSlug = (s = "") =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const normalizeList = (data) =>
  data?.items || data?.articles || data?.pages || data?.data?.items || [];

const parseTags = (v) =>
  String(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/* ============================ Root ============================ */

export default function AdminContent() {
  const [tab, setTab] = useState("articles");

  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", padding: "0 16px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>İçerik Yönetimi</h1>
          <div style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>
            Makale ve sayfaları buradan yönetebilirsin.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <TabBtn active={tab === "articles"} onClick={() => setTab("articles")}>
            Makaleler
          </TabBtn>
          <TabBtn active={tab === "pages"} onClick={() => setTab("pages")}>
            Sayfalar
          </TabBtn>
        </div>
      </header>

      <div style={{ marginTop: 14 }}>
        {tab === "articles" ? <ArticlesAdmin /> : <PagesAdmin />}
      </div>

      <GlobalStyles />
    </div>
  );
}

function TabBtn({ active, children, ...rest }) {
  return (
    <button
      {...rest}
      className={active ? "btn-primary" : "btn"}
      type="button"
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      :root{
        --border:#e5e7eb; --muted:#64748b; --card:#fff; --bg:#f8fafc; --brand:#2563eb;
      }
      .btn{
        border:1px solid var(--border);
        padding:8px 12px;border-radius:10px;background:#fff;
        cursor:pointer;font-weight:700;font-size:14px;
        transition: all .15s ease;
      }
      .btn:hover{ background:#f1f5f9 }
      .btn:disabled{ opacity:.6; cursor:not-allowed }
      .btn-primary{
        border:1px solid var(--brand);
        background:var(--brand);color:#fff;
        padding:8px 12px;border-radius:10px;cursor:pointer;font-weight:800;font-size:14px;
        transition: all .15s ease;
      }
      .btn-primary:hover{ filter:brightness(.95) }
      input,textarea,select{
        width:100%;border:1px solid var(--border);border-radius:10px;padding:9px 10px;background:#fff;
        font-size:14px; outline:none; transition:border .15s ease, box-shadow .15s ease;
      }
      input:focus,textarea:focus,select:focus{
        border-color:#94a3b8; box-shadow:0 0 0 3px rgba(148,163,184,.25);
      }
      label{
        font-weight:800;margin-top:10px;display:block;font-size:13px;color:#0f172a;
      }
      table{
        width:100%;border-collapse:collapse;margin-top:12px;background:#fff;border:1px solid var(--border);
        border-radius:12px; overflow:hidden;
      }
      thead th{
        position:sticky;top:0;background:#f8fafc;z-index:1;
      }
      th,td{
        border-bottom:1px solid var(--border);padding:10px 12px;text-align:left;font-size:14px;vertical-align:top;
      }
      tbody tr:hover td{ background:#fafafa }
      .grid2{ display:grid; grid-template-columns: 2fr 1fr; gap:12px; }
      @media (max-width: 900px){ .grid2{ grid-template-columns: 1fr; } }
      .card{
        background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px;
      }
      .section-title{
        font-weight:900;font-size:16px;margin:0 0 8px 0;
      }
      .muted{ color:var(--muted); font-size:12px; }
    `}</style>
  );
}

/* ============================ Toast ============================ */

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
      style={{
        position: "fixed",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        background: toast.type === "error" ? "#ef4444" : toast.type === "success" ? "#10b981" : "#0f172a",
        color: "#fff",
        padding: "8px 12px",
        borderRadius: 10,
        fontWeight: 800,
        fontSize: 14,
        boxShadow: "0 10px 26px rgba(0,0,0,.18)",
        zIndex: 99999,
      }}
    >
      {toast.msg}
    </div>
  ) : null;

  return { show, Toast };
}

/* ============================ Articles ============================ */

function ArticlesAdmin() {
  const { show, Toast } = useToast();

  const blank = useMemo(
    () => ({
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      coverImage: "",
      place: "Sapanca",
      tags: "",
      pinned: false,
      status: "published",
      order: 0,
      seoTitle: "",
      seoDescription: "",
    }),
    []
  );

  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const load = useCallback(async () => {
    const ac = new AbortController();
    setLoading(true);
    try {
      const { data } = await api.get("/cms/articles", { signal: ac.signal });
      setItems(normalizeList(data));
    } catch (e) {
      if (e?.name !== "CanceledError") {
        console.error("Articles load error:", e);
        show("Makaleler yüklenemedi.", "error");
      }
    } finally {
      setLoading(false);
    }
    return () => ac.abort();
  }, [show]);

  useEffect(() => {
    let cleanup;
    (async () => (cleanup = await load()))();
    return () => cleanup?.();
  }, [load]);

  // Auto-slug: title değişince ve slug elle dokunulmadıysa
  useEffect(() => {
    if (slugTouched) return;
    const auto = toSlug(form.title);
    setForm((f) => ({ ...f, slug: f.slug ? f.slug : auto }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title]);

  const startEdit = (it) => {
    setEditing(it);
    setSlugTouched(true); // edit modunda slugı otomatik kurcalama
    setForm({
      ...blank,
      ...it,
      tags: (it.tags || []).join(", "),
      order: Number(it.order || 0),
      pinned: !!it.pinned,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditing(null);
    setSlugTouched(false);
    setForm(blank);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return show("Başlık zorunlu.", "error");

    setSaving(true);
    try {
      const payload = {
        ...form,
        slug: toSlug(form.slug || form.title),
        tags: parseTags(form.tags),
        order: Number(form.order || 0),
      };

      if (editing?._id) {
        await api.put(`/cms/articles/${editing._id}`, payload);
        show("Makale güncellendi.", "success");
      } else {
        await api.post(`/cms/articles`, payload);
        show("Makale oluşturuldu.", "success");
      }

      resetForm();
      await load();
    } catch (e2) {
      console.error("Save article error:", e2);
      show(e2?.response?.data?.message || "Kaydetme sırasında hata oluştu.", "error");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Silinsin mi?")) return;
    try {
      await api.delete(`/cms/articles/${id}`);
      show("Makale silindi.", "success");
      await load();
    } catch (e) {
      console.error("Delete article error:", e);
      show("Silme sırasında hata oluştu.", "error");
    }
  };

  return (
    <>
      <form onSubmit={save} className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 className="section-title">
            {editing ? "Makale Düzenle" : "Yeni Makale"}
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={load} disabled={loading}>
              Yenile
            </button>
            {editing && (
              <button type="button" className="btn" onClick={resetForm} disabled={saving}>
                Vazgeç
              </button>
            )}
          </div>
        </div>

        <div className="grid2">
          <div>
            <label>Başlık</label>
            <input
              value={form.title}
              onChange={(e) => {
                setForm({ ...form, title: e.target.value });
                if (!editing) setSlugTouched(false);
              }}
              placeholder="Makale başlığı"
            />

            <label>Slug</label>
            <input
              placeholder="otomatik üretilecek"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm({ ...form, slug: e.target.value });
              }}
            />
            <div className="muted">
              URL: /blog/{toSlug(form.slug || form.title || "ornek")}
            </div>

            <label>Özet (excerpt)</label>
            <input
              value={form.excerpt}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              placeholder="Kısa özet"
            />

            <label>İçerik (HTML/Markdown)</label>
            <textarea
              rows={10}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="İçerik..."
            />
          </div>

          <div>
            <label>Kapak Görseli URL</label>
            <input
              value={form.coverImage}
              onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
              placeholder="https://..."
            />

            <label>Yer (place)</label>
            <input
              value={form.place}
              onChange={(e) => setForm({ ...form, place: e.target.value })}
              placeholder="Sapanca"
            />

            <label>Etiketler (virgül ile)</label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="sapanca, bungalov, gezi"
            />

            <label>Durum</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="published">published</option>
              <option value="draft">draft</option>
            </select>

            <label>Sıra (order)</label>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value || 0) })}
              min={0}
            />

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={!!form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              Planlayın’da Göster (Pinned)
            </label>

            <label>SEO Title</label>
            <input
              value={form.seoTitle}
              onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
            />

            <label>SEO Description</label>
            <textarea
              rows={3}
              value={form.seoDescription}
              onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? "Kaydediliyor…" : editing ? "Güncelle" : "Oluştur"}
              </button>
              {!editing && (
                <button type="button" className="btn" onClick={resetForm} disabled={saving}>
                  Temizle
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div className="card">Yükleniyor…</div>
        ) : items.length === 0 ? (
          <div className="card muted">Henüz makale yok.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Başlık</th>
                <th>Yer</th>
                <th>Pinned</th>
                <th>Durum</th>
                <th>Sıra</th>
                <th style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it._id}>
                  <td style={{ fontWeight: 700 }}>
                    {it.title}
                    <div className="muted">/{it.slug}</div>
                  </td>
                  <td>{it.place || "-"}</td>
                  <td>{it.pinned ? "✓" : "—"}</td>
                  <td>{it.status}</td>
                  <td>{Number(it.order || 0)}</td>
                  <td style={{ whiteSpace: "nowrap", display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => startEdit(it)}>
                      Düzenle
                    </button>
                    <button className="btn" onClick={() => del(it._id)}>
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {Toast}
    </>
  );
}

/* ============================ Pages ============================ */

function PagesAdmin() {
  const { show, Toast } = useToast();

  const blank = useMemo(
    () => ({
      title: "",
      slug: "",
      content: "",
      status: "published",
      order: 0,
      seoTitle: "",
      seoDescription: "",
      coverImage: "",
    }),
    []
  );

  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const load = useCallback(async () => {
    const ac = new AbortController();
    setLoading(true);
    try {
      const { data } = await api.get("/cms/pages", { signal: ac.signal });
      setItems(normalizeList(data));
    } catch (e) {
      if (e?.name !== "CanceledError") {
        console.error("Pages load error:", e);
        show("Sayfalar yüklenemedi.", "error");
      }
    } finally {
      setLoading(false);
    }
    return () => ac.abort();
  }, [show]);

  useEffect(() => {
    let cleanup;
    (async () => (cleanup = await load()))();
    return () => cleanup?.();
  }, [load]);

  useEffect(() => {
    if (slugTouched) return;
    const auto = toSlug(form.title);
    setForm((f) => ({ ...f, slug: f.slug ? f.slug : auto }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title]);

  const startEdit = (it) => {
    setEditing(it);
    setSlugTouched(true);
    setForm({ ...blank, ...it, order: Number(it.order || 0) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditing(null);
    setSlugTouched(false);
    setForm(blank);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return show("Başlık zorunlu.", "error");
    if (!form.slug.trim()) return show("Slug zorunlu.", "error");

    setSaving(true);
    try {
      const payload = {
        ...form,
        slug: toSlug(form.slug),
        order: Number(form.order || 0),
      };

      if (editing?._id) {
        await api.put(`/cms/pages/${editing._id}`, payload);
        show("Sayfa güncellendi.", "success");
      } else {
        await api.post(`/cms/pages`, payload);
        show("Sayfa oluşturuldu.", "success");
      }

      resetForm();
      await load();
    } catch (e2) {
      console.error("Save page error:", e2);
      show(e2?.response?.data?.message || "Kaydetme sırasında hata oluştu.", "error");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Silinsin mi?")) return;
    try {
      await api.delete(`/cms/pages/${id}`);
      show("Sayfa silindi.", "success");
      await load();
    } catch (e) {
      console.error("Delete page error:", e);
      show("Silme sırasında hata oluştu.", "error");
    }
  };

  return (
    <>
      <form onSubmit={save} className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 className="section-title">
            {editing ? "Sayfa Düzenle" : "Yeni Sayfa"}
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={load} disabled={loading}>
              Yenile
            </button>
            {editing && (
              <button type="button" className="btn" onClick={resetForm} disabled={saving}>
                Vazgeç
              </button>
            )}
          </div>
        </div>

        <label>Başlık</label>
        <input
          value={form.title}
          onChange={(e) => {
            setForm({ ...form, title: e.target.value });
            if (!editing) setSlugTouched(false);
          }}
          placeholder="Sayfa başlığı"
        />

        <label>Slug</label>
        <input
          placeholder="kvkk, gizlilik, hakkimizda..."
          value={form.slug}
          onChange={(e) => {
            setSlugTouched(true);
            setForm({ ...form, slug: e.target.value });
          }}
        />
        <div className="muted">URL: /sayfa/{toSlug(form.slug || form.title || "ornek")}</div>

        <label>İçerik (HTML/Markdown)</label>
        <textarea
          rows={10}
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
        />

        <label>Kapak Görseli</label>
        <input
          value={form.coverImage}
          onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
          placeholder="https://..."
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label>Durum</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="published">published</option>
              <option value="draft">draft</option>
            </select>
          </div>
          <div>
            <label>Sıra</label>
            <input
              type="number"
              min={0}
              value={form.order}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value || 0) })}
            />
          </div>
        </div>

        <label>SEO Title</label>
        <input
          value={form.seoTitle}
          onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
        />

        <label>SEO Description</label>
        <textarea
          rows={3}
          value={form.seoDescription}
          onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "Kaydediliyor…" : editing ? "Güncelle" : "Oluştur"}
          </button>
          {!editing && (
            <button type="button" className="btn" onClick={resetForm} disabled={saving}>
              Temizle
            </button>
          )}
        </div>
      </form>

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div className="card">Yükleniyor…</div>
        ) : items.length === 0 ? (
          <div className="card muted">Henüz sayfa yok.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Başlık</th>
                <th>Slug</th>
                <th>Durum</th>
                <th>Sıra</th>
                <th style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it._id}>
                  <td style={{ fontWeight: 700 }}>{it.title}</td>
                  <td>/{it.slug}</td>
                  <td>{it.status}</td>
                  <td>{Number(it.order || 0)}</td>
                  <td style={{ whiteSpace: "nowrap", display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => startEdit(it)}>
                      Düzenle
                    </button>
                    <button className="btn" onClick={() => del(it._id)}>
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {Toast}
    </>
  );
}
