// src/pages/BlacklistProfile.jsx — Public Kara Liste Profili (Ultra Pro, id + slug tolerant)
import React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";

const api = apiNamed || apiDefault;

/* ========== Helpers ========== */
const fmtDate = (d) => {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "-";
    return dt.toLocaleString("tr-TR");
  } catch {
    return "-";
  }
};

const fmtDateShort = (d) => {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "-";
    return dt.toLocaleDateString("tr-TR");
  } catch {
    return "-";
  }
};

const isObjectId = (s) => /^[0-9a-fA-F]{24}$/.test(String(s || ""));
const digitsOnly = (p = "") => String(p).replace(/\D/g, "");
const prettyPhone = (p = "") =>
  String(p)
    .replace(/\D/g, "")
    .replace(/^0?(\d{3})(\d{3})(\d{2})(\d{2}).*/, "0$1 $2 $3 $4");

/**
 * "Ali Yılmaz" -> "A*** Y****"
 * "a" -> "A*"
 * Boşsa "Anonim"
 */
function maskName(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Anonim";
  const parts = s.split(/\s+/);
  return parts
    .map((p, idx) => {
      const first = p[0] || "";
      if (!first) return "";
      const restLen = Math.max(p.length - 1, 1);
      const stars = "*".repeat(restLen);
      return (idx === 0 ? first.toUpperCase() : first.toLowerCase()) + stars;
    })
    .join(" ");
}

const splitSmart = (val) =>
  String(val || "")
    .split(/\n|\r|\t|,/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Kanıt girişlerini normalize eder:
 * Backend farklı alanlarda dönebilir:
 * - evidenceFiles, evidenceUrls, documents, images, preview.images, fingerprints
 */
function normalizeProofs(item) {
  const pull = (...paths) => {
    const out = [];
    for (const p of paths) {
      const v = p();
      if (Array.isArray(v)) out.push(...v);
      else if (v) out.push(v);
    }
    return out.filter(Boolean);
  };

  const raw = pull(
    () => item?.evidenceFiles,
    () => item?.evidenceUrls,
    () => item?.documents,
    () => item?.images,
    () => item?.preview?.images,
    () => item?.preview?.docs,
    () => item?.fingerprints
  );

  const proofs = raw
    .map((p) => {
      if (typeof p === "string") {
        const isUrl = /^https?:\/\//i.test(p) || p.startsWith("/uploads/");
        return {
          url: isUrl ? p : "",
          text: isUrl ? "" : p,
          note: "",
          mimetype: "",
          tag: "",
          source: "",
        };
      }
      if (typeof p === "object") {
        return {
          url: p.url || p.href || p.path || p.src || "",
          text: p.text || p.note || p.value || "",
          note: p.note || "",
          mimetype: p.mimetype || p.type || "",
          tag: p.tag || p.label || p.category || "",
          source: p.source || "",
        };
      }
      return null;
    })
    .filter((x) => x && (x.url || x.text));

  const imageProofs = proofs.filter((p) => {
    const url = p.url || "";
    const mt = (p.mimetype || "").toLowerCase();
    return mt.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(url);
  });

  const textProofs = proofs.filter((p) => !imageProofs.includes(p));

  const tags = Array.from(
    new Set(
      proofs
        .map((p) => p.tag || "")
        .filter(Boolean)
        .map((t) => String(t).toLowerCase())
    )
  );

  return { proofs, imageProofs, textProofs, tags };
}

/**
 * Destek girişlerini normalize eder:
 * - supportEntries / supports / supportersDetailed => detaylı
 * - supporters => sadece sayaç
 */
function normalizeSupports(item) {
  const detailed =
    item?.supportEntries ||
    item?.supports ||
    item?.supportersDetailed ||
    item?.supportItems;

  const arr = Array.isArray(detailed) ? detailed : [];

  const supports = arr
    .map((s, i) => {
      if (!s) return null;
      if (typeof s === "string") {
        return {
          id: `${i}-${s}`,
          name: "Anonim",
          maskedName: "Anonim",
          comment: "",
          createdAt: null,
        };
      }
      const name = s.name || s.fullName || s.displayName || "";
      const comment = s.comment || s.note || s.text || "";
      const createdAt = s.createdAt || s.supportedAt || s.date || null;
      return {
        id: s._id || `${i}-${name}-${createdAt || ""}`,
        name: name || "Anonim",
        maskedName: maskName(name),
        comment,
        createdAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

  const supportCount =
    item?.supportCount != null
      ? item.supportCount
      : Math.max(
          supports.length,
          Array.isArray(item?.supporters) ? item.supporters.length : 0
        );

  return { supports, supportCount };
}

/**
 * İlk rapor eden kişinin adını normalize eder.
 */
function getFirstReporter(item) {
  const direct = item?.firstReporterName || item?.reporterName;
  if (direct) return { raw: direct, masked: maskName(direct) };

  const reports = Array.isArray(item?.reports) ? item.reports : [];
  if (reports.length) {
    const rName = reports[0].reporterName || reports[0].name || "";
    if (rName) return { raw: rName, masked: maskName(rName) };
  }
  return null;
}

/* ========== Component ========== */
export default function BlacklistProfile() {
  const { id: key } = useParams();
  const navigate = useNavigate();

  const [state, setState] = React.useState({
    loading: true,
    error: "",
    item: null,
    supports: [],
    supportCount: 0,
  });

  const [supportForm, setSupportForm] = React.useState({ name: "", comment: "" });
  const [supportSending, setSupportSending] = React.useState(false);
  const [supportError, setSupportError] = React.useState("");

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = React.useState(null);

  const devLog = (...args) => {
    if (import.meta?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.log("[BlacklistProfile]", ...args);
    }
  };

  const tryGet = async (url) => {
    try {
      const res = await api.get(url, { _quiet: true });
      devLog("GET OK", url, res?.status, res?.data);
      return res?.data || null;
    } catch (err) {
      devLog(
        "GET FAIL",
        url,
        err?.response?.status,
        err?.response?.data || err?.message
      );
      return null;
    }
  };

  const resolveItem = (data) => {
    if (!data || typeof data !== "object") return null;

    let item =
      data.item ||
      data.blacklist ||
      data.result ||
      data.data || // bazı API'ler data: {...} dönebilir
      (data._id ? data : null);

    if (!item) {
      // İçinde _id olan ilk obje field'ı yakala (ör: { ok:true, entry:{_id:...} })
      const candidates = Object.values(data).filter(
        (v) => v && typeof v === "object" && !Array.isArray(v) && v._id
      );
      if (candidates.length) item = candidates[0];
    }

    return item || null;
  };

  const loadItem = React.useCallback(async () => {
    if (!key || String(key).trim().length < 2) {
      setState((s) => ({
        ...s,
        loading: false,
        error: "Geçersiz bağlantı.",
        item: null,
        supports: [],
        supportCount: 0,
      }));
      return;
    }

    const keyStr = String(key).trim();
    const isId = isObjectId(keyStr);
    const slug = encodeURIComponent(keyStr);

    // Denenecek endpoint listesi (sıralı)
    const idRoutes = [
      `/blacklist/${encodeURIComponent(keyStr)}`,
      `/blacklists/${encodeURIComponent(keyStr)}`,
      `/blacklist/by-id/${encodeURIComponent(keyStr)}`,
      `/blacklists/by-id/${encodeURIComponent(keyStr)}`,
      `/blacklist/public/${encodeURIComponent(keyStr)}`,
      `/blacklists/public/${encodeURIComponent(keyStr)}`,
      `/public/blacklist/${encodeURIComponent(keyStr)}`,
      `/public/blacklists/${encodeURIComponent(keyStr)}`,
    ];

    const slugRoutes = [
      `/blacklist/by-slug/${slug}`,
      `/blacklist/slug/${slug}`,
      `/blacklist/handle/${slug}`,
      `/blacklist/public/${slug}`,
      `/blacklists/public/${slug}`,
      `/public/blacklist/${slug}`,
      `/public/blacklists/${slug}`,
      `/blacklist/${slug}`, // legacy
    ];

    const searchRoutes = [];
    if (isId) searchRoutes.push(...idRoutes);
    // ID de olsa, slug rotalarını en sona ekleyelim (esneklik için)
    searchRoutes.push(...slugRoutes);

    devLog("key:", keyStr, "isId:", isId, "routes:", searchRoutes);

    let data = null;
    for (const r of searchRoutes) {
      data = await tryGet(r);
      const itemCandidate = resolveItem(data);
      if (itemCandidate) {
        devLog("HIT on route:", r);
        data = { __route: r, ...data, item: itemCandidate };
        break;
      }
    }

    const item = resolveItem(data);

    if (!item) {
      setState({
        loading: false,
        error: data?.message || "Kayıt bulunamadı.",
        item: null,
        supports: [],
        supportCount: 0,
      });
      return;
    }

    const { supports, supportCount } = normalizeSupports(item);

    setState({
      loading: false,
      error: "",
      item,
      supports,
      supportCount,
    });
  }, [key]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        await loadItem();
      } finally {
        if (!alive) return;
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadItem]);

  const { loading, error, item, supports, supportCount } = state;

  /* ========== UI primitives ========== */
  const Shell = ({ children }) => (
    <div
      style={{
        padding: 18,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "Inter, system-ui, Arial",
      }}
    >
      {children}
      <style>{css}</style>
    </div>
  );

  const Header = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <button onClick={() => navigate(-1)} className="btn btn-light">
        ‹ Geri
      </button>
      <h2 style={{ margin: 0, fontWeight: 800 }}>Kara Liste Profili</h2>
    </div>
  );

  const Card = ({ children, style }) => (
    <div
      style={{
        background: "#fff",
        border: "1px solid #f0f2f5",
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );

  const Alert = ({ children }) => (
    <div
      style={{
        background: "#fee2e2",
        border: "1px solid #fecaca",
        color: "#7f1d1d",
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );

  const SectionTitle = ({ children }) => (
    <div style={{ fontWeight: 800, marginBottom: 10 }}>{children}</div>
  );

  const Badge = ({ children, danger }) => (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        background: danger ? "#fee2e2" : "#eef2ff",
        color: danger ? "#9f1239" : "#3730a3",
        border: danger ? "1px solid #fecaca" : "1px solid #e0e7ff",
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );

  /* ========== Loading / Error ========== */
  if (loading) {
    return (
      <Shell>
        <Header />
        <Card style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
          Profil yükleniyor…
        </Card>
      </Shell>
    );
  }

  if (error || !item) {
    return (
      <Shell>
        <Header />
        <div style={{ maxWidth: 780 }}>
          <Alert>{error || "Kayıt bulunamadı (404)."}</Alert>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={loadItem}>
              ↻ Yeniden Dene
            </button>
            <Link to="/" className="btn btn-light">
              ‹ Ana sayfa
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  /* ========== Derived fields ========== */
  const name = item.businessName || item.name || "—";
  const website = item.website || "";
  const igUrl =
    item.instagramUrl ||
    (item.instagramUsername
      ? `https://instagram.com/${String(item.instagramUsername).replace(/^@/, "")}`
      : "");
  const phone = prettyPhone(item.phone || item.mobile || "");
  const address =
    item.address ||
    item.location?.address ||
    [item.city, item.district].filter(Boolean).join(" / ");
  const desc = item.desc || item.description || item.reason || "";

  const created = fmtDateShort(item.createdAt);
  const updated = fmtDateShort(item.updatedAt || item.createdAt);

  // Public durum etiketi
  const status = String(item.status || "active").toLowerCase();
  const severity = String(item.severity || "").toLowerCase();

  const statusLabel =
    status === "removed"
      ? "KAYIT KALDIRILDI"
      : status === "pending"
      ? "İNCELEMEDE"
      : status === "suspected"
      ? "OLASI DOLANDIRICI"
      : status === "confirmed"
      ? "DOĞRULANMIŞ DOLANDIRICI"
      : severity === "critical"
      ? "YÜKSEK RİSK"
      : "KARA LİSTEDE";

  const firstReporter = getFirstReporter(item);

  const { proofs, imageProofs, textProofs, tags } = normalizeProofs(item);

  const reportsArr = Array.isArray(item.reports) ? item.reports : [];
  const firstReportDate = reportsArr.length
    ? fmtDateShort(
        reportsArr
          .map((r) => r.createdAt || r.date)
          .filter(Boolean)
          .sort((a, b) => new Date(a) - new Date(b))[0]
      )
    : created;

  const lastReportDate = reportsArr.length
    ? fmtDateShort(
        reportsArr
          .map((r) => r.createdAt || r.date)
          .filter(Boolean)
          .sort((a, b) => new Date(b) - new Date(a))[0]
      )
    : updated;

  /* ========== Lightbox helpers ========== */
  const openLightbox = (idx) => imageProofs.length && setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);

  const showPrev = (e) => {
    e?.stopPropagation?.();
    setLightboxIndex((idx) =>
      idx === null ? null : (idx - 1 + imageProofs.length) % imageProofs.length
    );
  };
  const showNext = (e) => {
    e?.stopPropagation?.();
    setLightboxIndex((idx) =>
      idx === null ? null : (idx + 1) % imageProofs.length
    );
  };

  const currentImage =
    lightboxIndex !== null ? imageProofs[lightboxIndex] : null;

  /* ========== Support Submit ========== */
  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    setSupportError("");

    const sName = supportForm.name.trim() || "Anonim";
    const comment = supportForm.comment.trim();

    if (!comment) {
      setSupportError("Lütfen kısaca deneyiminizi veya desteğinizi yazın.");
      return;
    }

    const targetId = item?._id || key;

    setSupportSending(true);
    try {
      // Backend: POST /blacklist/:id/support (public)
      const res = await api.post(
        `/blacklist/${encodeURIComponent(targetId)}/support`,
        { name: sName, comment },
        { _quiet: false }
      );

      const data = res?.data || {};
      const base = data.blacklist || data.item || data.data || item;
      const { supports: normSupports, supportCount: cnt } =
        normalizeSupports(base);

      if (normSupports.length) {
        setState((prev) => ({
          ...prev,
          supports: normSupports,
          supportCount: cnt,
        }));
      } else {
        const optimistic = {
          id: "local-" + Date.now(),
          name: sName,
          maskedName: maskName(sName),
          comment,
          createdAt: new Date().toISOString(),
        };
        setState((prev) => ({
          ...prev,
          supports: [optimistic, ...prev.supports],
          supportCount: prev.supportCount + 1,
        }));
      }

      setSupportForm({ name: "", comment: "" });
    } catch (err) {
      setSupportError(
        err?.response?.data?.message ||
          "Desteğiniz kaydedilemedi. Daha sonra tekrar deneyebilirsiniz."
      );
    } finally {
      setSupportSending(false);
    }
  };

  /* ========== Render ========== */
  return (
    <Shell>
      <Header />

      {/* Üst blok */}
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: 26, letterSpacing: 0.2 }}>
              {name}
            </h1>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
              }}
            >
              <Badge danger={status !== "removed"}>{statusLabel}</Badge>

              {firstReporter && (
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  İlk rapor eden: <b>{firstReporter.masked}</b>
                </span>
              )}

              {supportCount > 0 && (
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  • {supportCount} kişi bu kaydı destekledi
                </span>
              )}
            </div>

            <div style={{ marginTop: 4, fontSize: 11, color: "#9ca3af" }}>
              İlk şikayet: {firstReportDate} • Güncel durum: {lastReportDate}
            </div>

            {status === "removed" && (
              <div style={{ marginTop: 8 }}>
                <span className="muted" style={{ color: "#b45309" }}>
                  Not: Bu kayıt daha sonra kaldırılmış/sonlandırılmış olabilir.
                  Yine de geçmiş ihbarlar görünür.
                </span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {igUrl && (
              <a
                className="iconBtn"
                href={igUrl}
                target="_blank"
                rel="noreferrer noopener"
                title="Instagram"
              >
                IG
              </a>
            )}
            {website && (
              <a
                className="iconBtn"
                href={website}
                target="_blank"
                rel="noreferrer noopener"
                title="Web"
              >
                🌐
              </a>
            )}
          </div>
        </div>
      </Card>

      {/* Temel Bilgiler */}
      <Card>
        <SectionTitle>Temel Bilgiler</SectionTitle>
        <dl className="dl">
          <dt>Web site</dt>
          <dd>
            {website ? (
              <a
                className="ext"
                href={website}
                target="_blank"
                rel="noreferrer noopener"
              >
                {website.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            ) : (
              "—"
            )}
          </dd>

          <dt>Instagram</dt>
          <dd>
            {igUrl ? (
              <a
                className="ext"
                href={igUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {igUrl.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            ) : (
              "—"
            )}
          </dd>

          <dt>Telefon</dt>
          <dd>{phone || "—"}</dd>

          <dt>Adres</dt>
          <dd>{address || "—"}</dd>
        </dl>
      </Card>

      {/* Kanıtlar */}
      <Card>
        <SectionTitle>Kanıtlar</SectionTitle>
        <div
          style={{
            color: "#111827",
            marginBottom: 8,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {imageProofs.length
            ? `${imageProofs.length} görsel kanıt`
            : "Görsel kanıt yok"}{" "}
          • Toplam {proofs.length} kayıt
        </div>

        {/* Etiketler */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          {tags.length ? (
            tags.map((t, i) => (
              <span key={i} className="chip">
                {t}
              </span>
            ))
          ) : (
            <span className="muted">Etiketlenmiş kanıt yok</span>
          )}
        </div>

        {/* Görseller */}
        {imageProofs.length ? (
          <div className="grid">
            {imageProofs.map((g, i) => {
              const src = g.url || "";
              if (!src) return null;
              return (
                <button
                  key={i}
                  type="button"
                  className="thumb thumb-btn"
                  onClick={() => openLightbox(i)}
                  title={g.note || g.text || `kanıt-${i + 1}`}
                >
                  <img
                    src={src}
                    alt={g.note || g.text || `kanıt-${i + 1}`}
                    loading="lazy"
                    onError={(e) =>
                      (e.currentTarget.style.display = "none")
                    }
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="muted">Görsel kanıt yüklenmemiş.</div>
        )}

        {/* Metin / diğer kanıtlar */}
        {textProofs.length ? (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {textProofs.map((o, i) => (
              <div key={i} className="textProof">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {o.title || o.tag || "Not"}
                </div>
                <div style={{ color: "#111827", fontSize: 13 }}>
                  {o.text || o.note || o.url || "—"}
                </div>
                {o.source && (
                  <div
                    className="muted"
                    style={{ marginTop: 4, fontSize: 11 }}
                  >
                    Kaynak: {o.source}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {/* Şikayet Özeti */}
      <Card>
        <SectionTitle>Şikayet Özeti</SectionTitle>
        <ul className="timeline">
          <li>
            <time>{firstReportDate}</time>
            <p>İlk ihbar sisteme işlendi.</p>
          </li>
          <li>
            <time>{updated}</time>
            <p>
              Güncel durum / not:{" "}
              {desc || "Bu kayıt, kullanıcı ihbarları ve delillere dayanır."}
            </p>
          </li>
        </ul>
      </Card>

      {/* Destekler */}
      <Card>
        <SectionTitle>Destekler</SectionTitle>

        {supportCount === 0 && supports.length === 0 ? (
          <div className="muted">
            Henüz destek veren olmamış. İlk deneyimi paylaşan sen olabilirsin.
          </div>
        ) : (
          <div style={{ marginBottom: 8, fontSize: 13, color: "#4b5563" }}>
            Toplam <b>{supportCount || supports.length}</b> destek kaydı.
          </div>
        )}

        {supports.length > 0 && (
          <div className="support-list">
            {supports.map((s) => (
              <div key={s.id} className="support-item">
                <div className="support-header">
                  <span className="support-name">
                    {s.maskedName || maskName(s.name)}
                  </span>
                  <span className="support-date">
                    {fmtDateShort(s.createdAt) || ""}
                  </span>
                </div>
                {s.comment && (
                  <div className="support-comment">{s.comment}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Yeni Destek Formu */}
        <form onSubmit={handleSupportSubmit} className="support-form">
          <div
            style={{
              fontSize: 12,
              color: "#6b7280",
              marginBottom: 4,
            }}
          >
            Deneyimini paylaşarak diğer kullanıcıları bilgilendirebilirsin. Adın
            kamuya <b>maskeleme ile</b> gösterilir (örn:{" "}
            <code>A*** Y****</code>).
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <input
              type="text"
              placeholder="Ad Soyad (isteğe bağlı)"
              value={supportForm.name}
              onChange={(e) =>
                setSupportForm((f) => ({ ...f, name: e.target.value }))
              }
            />
            <textarea
              rows={3}
              placeholder="Kısa yorumunuzu / desteğinizi yazın…"
              value={supportForm.comment}
              onChange={(e) =>
                setSupportForm((f) => ({ ...f, comment: e.target.value }))
              }
            />
          </div>

          {supportError && (
            <div
              className="muted"
              style={{ color: "#b91c1c", marginBottom: 4 }}
            >
              {supportError}
            </div>
          )}

          <button type="submit" className="btn" disabled={supportSending}>
            {supportSending ? "Gönderiliyor…" : "Desteğimi Paylaş"}
          </button>
        </form>
      </Card>

      {/* Hukuki Not */}
      <Card>
        <SectionTitle>Hukuki Not</SectionTitle>
        <p
          style={{
            lineHeight: 1.6,
            color: "#111827",
            fontSize: 13,
          }}
        >
          Bu sayfa, topluluk ihbarları ve kanıtlara dayalı bilgilendirme amacı
          taşır. İçerik resmî bir yargı kararı değildir. Mağdur olduğunuzu
          düşünüyorsanız ilgili kolluk kuvvetlerine ve resmî mercilere
          başvurun.
        </p>
      </Card>

      <div style={{ marginTop: 10 }}>
        <Link to="/" className="btn btn-light">
          ‹ Ana sayfaya dön
        </Link>
      </div>

      {/* Lightbox */}
      {currentImage && (
        <div className="lightbox-backdrop" onClick={closeLightbox}>
          <div
            className="lightbox-inner"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="lightbox-close"
              onClick={closeLightbox}
            >
              ✕
            </button>

            {imageProofs.length > 1 && (
              <>
                <button
                  type="button"
                  className="lightbox-arrow lightbox-arrow-left"
                  onClick={showPrev}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="lightbox-arrow lightbox-arrow-right"
                  onClick={showNext}
                >
                  ›
                </button>
              </>
            )}

            <img
              src={currentImage.url || ""}
              alt={currentImage.note || currentImage.text || "kanıt"}
              className="lightbox-img"
            />
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ========== Styles ========== */
const css = `
.btn{
  padding:8px 12px;
  border-radius:10px;
  border:1px solid #e5e7eb;
  background:#fff;
  cursor:pointer;
  font-weight:600;
  text-decoration:none;
  color:#111827;
  font-size:12px;
}
.btn-light{ background:#f8fafc; }
.btn:hover{ background:#f8fafc; }
.ext{
  color:#0f172a;
  text-decoration:none;
  font-weight:600;
  font-size:13px;
}
.ext:hover{ text-decoration:underline; }
.dl{
  display:grid;
  grid-template-columns:160px 1fr;
  gap:8px 16px;
  margin:0;
  font-size:13px;
}
.dl dt{ color:#6b7280; }
.dl dd{ margin:0; color:#111827; }
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
  gap:10px;
}
.thumb{
  display:block;
  border-radius:12px;
  overflow:hidden;
  border:1px solid #eef2f7;
  background:#fafafa;
}
.thumb img{
  width:100%;
  height:120px;
  object-fit:cover;
  display:block;
}
.thumb-btn{
  width:100%;
  padding:0;
  border:none;
  background:none;
  cursor:pointer;
}
.thumb-btn:focus-visible{
  outline:2px solid #3b82f6;
  outline-offset:2px;
}
.chip{
  padding:4px 9px;
  border:1px solid #e5e7eb;
  border-radius:999px;
  background:#f8fafc;
  font-size:11px;
  font-weight:600;
  color:#475569;
}
.muted{ color:#64748b; font-size:12px; }
.textProof{
  border:1px solid #eef2f7;
  background:#fbfbfb;
  border-radius:10px;
  padding:9px;
  font-size:12px;
}
.iconBtn{
  min-width:34px;
  height:34px;
  border-radius:10px;
  display:inline-grid;
  place-items:center;
  border:1px solid #e5e7eb;
  text-decoration:none;
  color:#111827;
  background:#fff;
  font-size:12px;
  font-weight:800;
}
.iconBtn:hover{ background:#f1f5f9; }
.timeline{
  list-style:none;
  padding:0;
  margin:0;
  display:grid;
  gap:10px;
}
.timeline li{
  display:grid;
  grid-template-columns:120px 1fr;
  gap:8px;
  align-items:flex-start;
  font-size:13px;
}
.timeline time{
  color:#64748b;
  font-size:12px;
}
.support-list{
  display:grid;
  gap:6px;
  margin:8px 0 10px;
}
.support-item{
  border:1px solid #e5e7eb;
  border-radius:10px;
  padding:8px 9px;
  background:#f9fafb;
}
.support-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:6px;
}
.support-name{
  font-weight:700;
  font-size:12px;
  color:#111827;
}
.support-date{
  font-size:11px;
  color:#9ca3af;
}
.support-comment{
  margin-top:3px;
  font-size:12px;
  color:#111827;
}
.support-form textarea{ resize:vertical; }
.support-form input,
.support-form textarea{ font-size:12px; }

/* Lightbox */
.lightbox-backdrop{
  position:fixed;
  inset:0;
  background:rgba(15,23,42,0.8);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:1200;
}
.lightbox-inner{
  position:relative;
  max-width:90vw;
  max-height:90vh;
  display:flex;
  align-items:center;
  justify-content:center;
}
.lightbox-img{
  max-width:80vw;
  max-height:80vh;
  border-radius:14px;
  box-shadow:0 20px 45px rgba(15,23,42,0.5);
}
.lightbox-arrow{
  position:absolute;
  top:50%;
  transform:translateY(-50%);
  border:none;
  border-radius:999px;
  padding:8px 11px;
  background:#e5e7eb;
  cursor:pointer;
  font-size:20px;
}
.lightbox-arrow-left{ left:-40px; }
.lightbox-arrow-right{ right:-40px; }
.lightbox-close{
  position:absolute;
  top:-40px;
  right:0;
  border:none;
  border-radius:999px;
  padding:4px 9px;
  background:#f97316;
  color:#fff;
  cursor:pointer;
  font-weight:700;
}
@media (max-width: 640px){
  .dl{ grid-template-columns:120px 1fr; }
  .timeline li{ grid-template-columns:90px 1fr; }
  .lightbox-arrow-left{ left:6px; }
  .lightbox-arrow-right{ right:6px; }
}
`;
