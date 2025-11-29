// frontend/src/pages/Apply.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import apiDefault, { api as apiNamed, API_ORIGIN } from "@/api/axios-boot";

/* ====================== Helpers ====================== */
const PHONE_RE = /(\+90\s?)?0?\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}\b/g;
const prettyPhone = (p = "") =>
  String(p).replace(/\D/g, "").replace(/^0?(\d{3})(\d{3})(\d{2})(\d{2}).*/, "0$1 $2 $3 $4");
const digitsOnly = (p = "") => String(p).replace(/\D/g, "");
const usernameFromUrl = (url = "") => {
  const m = /instagram\.com\/([A-Za-z0-9._]{2,30})/i.exec(url);
  return m?.[1] || "";
};
const sanitizeName = (s = "") => s.replace(/[^\w.\- ]+/g, "_");
const fileSig = (f) => `${f.name}-${f.size}-${f.lastModified}`;
const imgSrc = (requestId, name) => `/uploads/apply/${encodeURIComponent(requestId)}/${name}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Canvas tabanlı görsel küçültme (maxDim ~ 2000px, hedef <10MB) */
async function compressImage(
  file,
  { maxDim = 2000, quality = 0.9, mime = "image/jpeg", targetMaxBytes = 10 * 1024 * 1024 } = {}
) {
  if (!file?.type?.startsWith("image/")) return file;
  if (file.size <= targetMaxBytes && (file.type === "image/jpeg" || file.type === "image/webp")) return file;

  const img = await blobToImageBitmap(file).catch(() => null);
  if (!img) return file;

  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, tw, th);

  let q = quality;
  let outBlob = await new Promise((res) => canvas.toBlob(res, mime, q));
  let tries = 5;
  while (outBlob && outBlob.size > targetMaxBytes && tries-- > 0) {
    q = Math.max(0.5, q - 0.1);
    outBlob = await new Promise((res) => canvas.toBlob(res, mime, q));
  }
  if (!outBlob) return file;

  if (outBlob.size >= file.size) return file;

  const newName =
    sanitizeName(file.name.replace(/\.(jpe?g|png|webp|gif|bmp|tiff)$/i, "")) +
    (mime === "image/webp" ? ".webp" : ".jpg");
  return new File([outBlob], newName, { type: outBlob.type, lastModified: Date.now() });
}

async function blobToImageBitmap(file) {
  if ("createImageBitmap" in window) {
    return await createImageBitmap(file);
  }
  const dataUrl = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(file);
  });
  return await new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = dataUrl;
  });
}

/* ====================== Stil yardımcıları ====================== */
const card = {
  background: "#fff",
  border: "1px solid #eaeaea",
  borderRadius: 14,
  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  padding: 20,
};
const label = { fontSize: 13, color: "#6b7280", marginBottom: 6 };
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  background: "#eef6ff",
  border: "1px solid #cfe5ff",
  borderRadius: 999,
  fontSize: 13,
  marginRight: 8,
  marginBottom: 8,
  cursor: "pointer",
};
const btn = {
  padding: "12px 18px",
  background: "#27ae60",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};
const subtleBtn = {
  padding: "8px 12px",
  background: "#f1f5f9",
  color: "#111827",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
};
const stepDot = (active, done) => ({
  width: 10,
  height: 10,
  borderRadius: 999,
  background: active ? "#111827" : done ? "#6b7280" : "#d1d5db",
});
const inputStyle = (ok = true) => ({
  display: "block",
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1.5px solid ${ok ? "#d0d7de" : "#f87171"}`,
  outline: "none",
  fontSize: 15,
  marginBottom: 12,
});

/* ====================== Sınırlar ====================== */
const MAX_IMAGES = 5;
const MAX_IMG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB

// Ortak axios instance + origin
const api = apiNamed || apiDefault;
const API_BASE = API_ORIGIN || "";

export default function Apply() {
  /* ---------------- State ---------------- */
  const [form, setForm] = useState({
    name: "", // İşletme Adı
    tradeTitle: "", // Ticari Ünvan
    type: "",
    instagramUsername: "",
    instagramUrl: "",
    website: "",
    phone: "", // Mobil (zorunlu)
    landline: "", // Sabit (opsiyonel)
    city: "", // İl (zorunlu)
    district: "", // İlçe (zorunlu)
    note: "",
    terms: false,
  });
  const [biz, setBiz] = useState(null); // {_id, name, slug}

  // Belgeler
  const [taxPdf, setTaxPdf] = useState(null); // Vergi Levhası (PDF, zorunlu)
  const [permitPdf, setPermitPdf] = useState(null); // İşyeri Açma ve Çalıştırma Ruhsatı (PDF, zorunlu)

  // Yalnızca GÖRSEL ve max 5
  const [files, setFiles] = useState([]); // { file: File, note: string, blur: boolean, name?: string, sig?:string }
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // UI
  const [step, setStep] = useState(1);
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Server cevabı
  const [serverReqId, setServerReqId] = useState("");
  const [serverFiles, setServerFiles] = useState([]);

  const fileInputRef = useRef(null);
  const pasteRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const DRAFT_KEY = "applyDraft.v4"; // sürüm arttı (city/district)

  /* ---------------- E-posta doğrulama kapısı ---------------- */
  useEffect(() => {
    const token = localStorage.getItem("emailVerifyToken");
    const verified = localStorage.getItem("isVerifiedEmail");
    if (!token && !verified) {
      navigate("/verify-email?redirect=/apply", { state: { from: location.pathname }, replace: true });
    }
  }, [navigate, location]);

  /* ---------------- Prefill (query/state) ---------------- */
  useEffect(() => {
    const fromState = location.state?.business;
    const params = new URLSearchParams(location.search);
    const qId = params.get("id");
    const qSlug = params.get("slug");
    const qName = params.get("name");

    const prefillFromBusiness = (b) => {
      if (!b) return;
      setBiz({ _id: b._id, name: b.name || "", slug: b.slug || b.handle || "" });
      const igUser =
        b.instagramUsername ||
        (typeof b.instagram === "string" ? b.instagram.replace(/^@/, "") : "") ||
        "";
      const igUrl = b.instagramUrl || (igUser ? `https://instagram.com/${igUser}` : "") || "";
      const phone = prettyPhone(b.phone || (Array.isArray(b.phones) ? b.phones[0] : "") || "");

      // Şehir/İlçe muhtemel alanları topla
      const city = b.city || b.province || b.location?.city || b.addressCity || "";
      const district = b.district || b.town || b.county || b.location?.district || b.addressDistrict || "";

      setForm((prev) => ({
        ...prev,
        name: b.name || prev.name,
        tradeTitle: b.tradeTitle || b.legalName || prev.tradeTitle || "",
        type: b.type || b.category || prev.type,
        city: city || prev.city,
        district: district || prev.district,
        phone,
        instagramUsername: igUser ? `@${igUser}` : prev.instagramUsername,
        instagramUrl: igUrl || prev.instagramUrl,
        website: b.website || prev.website,
        landline: b.landline || prev.landline,
      }));
    };

    if (fromState) {
      prefillFromBusiness(fromState);
      return;
    }

    (async () => {
      try {
        if (qId) {
          const { data } = await api.get(`/api/businesses/${encodeURIComponent(qId)}`);
          const b = data?.business || data || null;
          if (b) prefillFromBusiness(b);
        } else if (qSlug) {
          const tryUrls = [
            `/api/businesses/by-slug/${encodeURIComponent(qSlug)}`,
            `/api/businesses/handle/${encodeURIComponent(qSlug)}`,
            `/api/businesses/search?q=${encodeURIComponent(qSlug)}`,
          ];
          for (const u of tryUrls) {
            try {
              const { data } = await api.get(u);
              const b =
                data?.business ||
                data?.result ||
                data?.businesses?.[0] ||
                (data?._id ? data : null);
              if (b) {
                prefillFromBusiness(b);
                break;
              }
            } catch {}
          }
        } else if (qName) {
          const { data } = await api.get(`/api/businesses/search?q=${encodeURIComponent(qName)}`);
          const b = data?.businesses?.[0];
          if (b) prefillFromBusiness(b);
        }
      } catch {}
    })();
  }, [location]);

  /* ---------------- Taslak yükle / kaydet ---------------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.form) setForm({ terms: false, ...parsed.form });
        if (Array.isArray(parsed.filesMeta)) {
          setFiles(
            parsed.filesMeta.map((m) => ({
              file: null,
              note: m.note || "",
              blur: !!m.blur,
              name: m.name || "",
              sig: m.sig || "",
            }))
          );
        }
        if (parsed.biz) setBiz(parsed.biz);
        if (parsed.taxPdf) setTaxPdf(parsed.taxPdf);
        if (parsed.permitPdf) setPermitPdf(parsed.permitPdf);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      const filesMeta = files.map((f) => ({
        name: f.file?.name || f.name || "",
        note: f.note,
        blur: !!f.blur,
        sig: f.sig || "",
      }));
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          form,
          filesMeta,
          biz,
          taxPdf: taxPdf ? { name: taxPdf.name, size: taxPdf.size } : null,
          permitPdf: permitPdf ? { name: permitPdf.name, size: permitPdf.size } : null,
        })
      );
    }, 400);
    return () => clearTimeout(id);
  }, [form, files, biz, taxPdf, permitPdf]);

  /* ---------------- Öneriler ---------------- */
  const igSuggestion = useMemo(() => usernameFromUrl(form.instagramUrl), [form.instagramUrl]);

  /* ---------------- Validasyon ---------------- */
  const v = {
    name: (form.name || "").trim().length >= 2,
    tradeTitle: (form.tradeTitle || "").trim().length >= 2,
    type: (form.type || "").trim().length >= 2,
    phone: digitsOnly(form.phone || "").length >= 10,
    city: (form.city || "").trim().length >= 2,
    district: (form.district || "").trim().length >= 2,
    taxPdf: !!taxPdf,
    permitPdf: !!permitPdf,
    imagesOk: files.length > 0 && files.length <= MAX_IMAGES, // 1..5
    terms: !!form.terms,
  };
  const canNext1 = v.name && v.tradeTitle && v.type && v.city && v.district;
  const canNext2 = v.phone;
  const canSubmit = canNext1 && canNext2 && v.taxPdf && v.permitPdf && v.imagesOk && v.terms;

  /* ---------------- Görsel girişleri ---------------- */
  async function addFiles(list) {
    setUploadError("");
    const incoming = Array.from(list || []);
    if (!incoming.length) return;

    const existingSigs = new Set(files.map((f) => f.sig).filter(Boolean));
    const next = [];
    let rejectedTypeOrSize = false;

    for (const f of incoming) {
      if (!f.type.startsWith("image/")) {
        rejectedTypeOrSize = true;
        continue;
      }
      if (f.size > 60 * 1024 * 1024) {
        rejectedTypeOrSize = true;
        continue;
      }
      const sig = fileSig(f);
      if (existingSigs.has(sig)) continue;

      const preferWebp = "image/webp";
      const targetMime =
        f.type === "image/jpeg" || f.type === "image/webp" ? f.type : preferWebp;
      const compressed = await compressImage(f, {
        maxDim: 2000,
        quality: 0.92,
        mime: targetMime,
        targetMaxBytes: MAX_IMG_SIZE,
      }).catch(() => f);
      if (compressed.size > MAX_IMG_SIZE) {
        rejectedTypeOrSize = true;
        continue;
      }
      next.push({ file: compressed, note: "", blur: false, name: compressed.name, sig });
    }

    let merged = [...files, ...next];
    if (merged.length > MAX_IMAGES) {
      merged = merged.slice(0, MAX_IMAGES);
      setUploadError(`En fazla ${MAX_IMAGES} görsel kabul edilir. Fazlası otomatik çıkarıldı.`);
    } else if (rejectedTypeOrSize) {
      setUploadError(
        "Sadece uygun boyutta görseller (JPG/WEBP, her biri 10MB'ı geçmemeli) kabul ediliyor."
      );
    }
    setFiles(merged);
  }

  const onPickFiles = (list) => addFiles(list);
  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    setFiles((prev) => {
      const c = [...prev];
      const j = i + dir;
      if (j < 0 || j >= c.length) return c;
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  };

  // Yapıştırma ile resim ekleme
  useEffect(() => {
    const el = pasteRef.current;
    if (!el) return;
    const onPaste = async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imgs = await Promise.all(
        items
          .filter((it) => it.type?.startsWith?.("image/"))
          .map((it, idx) => {
            const blob = it.getAsFile();
            if (!blob) return null;
            const named = new File([blob], `pasted-${Date.now()}-${idx}.jpg`, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            return named;
          })
      );
      const filtered = imgs.filter(Boolean);
      if (filtered.length) addFiles(filtered);
    };
    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, []);

  /* ---------------- PDF Yükleyiciler ---------------- */
  function onPickPdf(kind, file) {
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    if (!isPdf || file.size > MAX_PDF_SIZE) {
      alert("Lütfen PDF formatında ve 20MB'dan küçük bir dosya seçin.");
      return;
    }
    if (kind === "tax") setTaxPdf(file);
    if (kind === "permit") setPermitPdf(file);
  }

  /* ---------------- Gönder ---------------- */
  const handleSubmit = async () => {
    try {
      setError("");

      if (!canSubmit) {
        let msg = "Lütfen zorunlu alanları tamamlayın:";
        const miss = [];
        if (!v.name) miss.push("İşletme Adı");
        if (!v.tradeTitle) miss.push("Ticari Ünvan");
        if (!v.type) miss.push("İşletme Türü");
        if (!v.city) miss.push("İl");
        if (!v.district) miss.push("İlçe");
        if (!v.phone) miss.push("Telefon (mobil)");
        if (!v.taxPdf) miss.push("Vergi Levhası (PDF)");
        if (!v.permitPdf) miss.push("İşyeri Açma ve Çalıştırma Ruhsatı (PDF)");
        if (!v.imagesOk) miss.push("1–5 Adet Görsel");
        if (!v.terms) miss.push("Koşullar Onayı");
        if (miss.length) msg += " " + miss.join(", ") + ".";
        setError(msg);
        return;
      }

      setSubmitting(true);
      setProgress(5);

      // Payload'ı normalize et
      const norm = {
        ...form,
        instagramUsername: (form.instagramUsername || "").replace(/^@/, ""),
        phone: digitsOnly(form.phone || ""),
        landline: digitsOnly(form.landline || ""),
      };

      // FormData
      const fd = new FormData();
      Object.entries(norm).forEach(([k, v]) => fd.append(k, v == null ? "" : v));
      if (biz?._id) fd.append("business", biz._id);

      // Belgeler
      fd.append("taxCertificate", taxPdf);
      fd.append("workPermit", permitPdf);

      const notes = [];
      files.forEach((f, idx) => {
        if (f.file) fd.append("documents", f.file);
        notes.push({
          index: idx,
          note: f.note || "",
          blur: !!f.blur,
          name: f.file?.name || f.name || "",
        });
      });
      fd.append("documentNotes", JSON.stringify(notes));

      const verifyToken = localStorage.getItem("emailVerifyToken") || "";

      const resp = await api.post(`/api/apply`, fd, {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(verifyToken ? { "x-verify-token": verifyToken } : {}),
        },
        onUploadProgress: (pe) => {
          if (!pe.total) return;
          const pct = Math.round((pe.loaded / pe.total) * 100);
          setProgress(Math.min(95, Math.max(10, pct)));
        },
      });

      setProgress(100);

      const rid = resp?.data?.requestId || resp?.data?._id || resp?.data?.id || "";

      // 🔑 Sunucunun verdiği hazır önizleme URL’leri
      let previews =
        (resp?.data?.preview &&
          Array.isArray(resp.data.preview.images) &&
          resp.data.preview.images) ||
        [];

      // 🔁 Gerekirse /api/img ile üret
      if (!previews.length && Array.isArray(resp?.data?.images)) {
        previews = resp.data.images.map((p) =>
          `${API_BASE}/api/img?src=${encodeURIComponent(p)}&w=800&dpr=2`
        );
      }

      setServerReqId(rid);
      setServerFiles(previews);

      setShowPopup(true);
      setStep(4);

      // Formu temizle
      setForm({
        name: "",
        tradeTitle: "",
        type: "",
        instagramUsername: "",
        instagramUrl: "",
        website: "",
        phone: "",
        landline: "",
        city: "",
        district: "",
        note: "",
        terms: false,
      });
      setFiles([]);
      setTaxPdf(null);
      setPermitPdf(null);
      setBiz(null);
      localStorage.removeItem(DRAFT_KEY);

      await sleep(300);
      setProgress(0);

      // Otomatik ana sayfaya yönlendirme
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        (err?.response ? `Sunucu hatası (${err.response.status})` : "Ağ/istemci hatası");
      setError(msg);
      console.error("[apply] submit error:", err);
      if (err?.response?.status === 401) {
        navigate("/verify-email?redirect=/apply", { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------- Render ---------------- */
  return (
    <div
      ref={pasteRef}
      style={{
        padding: 28,
        maxWidth: 960,
        margin: "0 auto",
        fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
      }}
    >
      {/* Başlık + Stepper */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
        aria-label="Adım göstergesi"
      >
        <h2 style={{ margin: 0, color: "#111827", fontWeight: 800 }}>
          İşletme Doğrulama Başvurusu
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/")} style={subtleBtn} title="Anasayfaya dön">
            ⟵ Anasayfaya Dön
          </button>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8 }}
            role="list"
            aria-label="Adımlar"
          >
            <div
              style={stepDot(step === 1, step > 1)}
              role="listitem"
              title="1. İşletme Bilgileri"
            />
            <div
              style={{
                width: 50,
                height: 2,
                background: step > 1 ? "#6b7280" : "#e5e7eb",
              }}
            />
            <div
              style={stepDot(step === 2, step > 2)}
              role="listitem"
              title="2. İletişim & Sosyal"
            />
            <div
              style={{
                width: 50,
                height: 2,
                background: step > 2 ? "#6b7280" : "#e5e7eb",
              }}
            />
            <div
              style={stepDot(step === 3, step > 3)}
              role="listitem"
              title="3. Belgeler & Galeri"
            />
            <div
              style={{
                width: 50,
                height: 2,
                background: step > 3 ? "#6b7280" : "#e5e7eb",
              }}
            />
            <div style={stepDot(step === 4, false)} role="listitem" title="4. Gönder" />
          </div>
        </div>
      </div>

      {/* Prefill bilgi çubuğu */}
      {biz && (
        <div
          style={{
            ...card,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fffb",
          }}
        >
          <div>
            <b>Seçili İşletme:</b> {biz.name || "-"}{" "}
            {biz.slug ? <span style={{ opacity: 0.7 }}>({biz.slug})</span> : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {biz.slug && (
              <a
                href={`/isletme/${biz.slug}`}
                className="lnk"
                style={{ ...subtleBtn, textDecoration: "none" }}
              >
                Profili Aç
              </a>
            )}
            <button
              style={{ ...subtleBtn, background: "#fff1f2", borderColor: "#fecdd3" }}
              onClick={() => setBiz(null)}
              aria-label="Seçili işletme bağını kaldır"
            >
              Bağı Kaldır
            </button>
          </div>
        </div>
      )}

      {/* Yasal mini uyarı */}
      <div
        style={{
          ...card,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          marginBottom: 16,
          background: "#f8fffb",
        }}
      >
        <div style={{ fontSize: 20 }}>ℹ️</div>
        <div style={{ fontSize: 14, color: "#374151" }}>
          Lütfen doğru ve güncel bilgiler girin. Yükleyeceğiniz <b>Vergi Levhası</b> ve{" "}
          <b>İşyeri Açma ve Çalıştırma Ruhsatı</b> PDF formatında olmalıdır. Görseller yalnızca
          doğrulama amacıyla incelenir.
        </div>
      </div>

      {/* Adım 1: İşletme Bilgileri */}
      {step === 1 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={label}>İşletme Adı *</div>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={inputStyle(v.name)}
                placeholder="Örn: Kule Sapanca"
                aria-invalid={!v.name}
              />
            </div>
            <div>
              <div style={label}>Ticari Ünvan *</div>
              <input
                value={form.tradeTitle}
                onChange={(e) => setForm({ ...form, tradeTitle: e.target.value })}
                style={inputStyle(v.tradeTitle)}
                placeholder="Örn: Kule Turizm ve Tic. Ltd. Şti."
                aria-invalid={!v.tradeTitle}
              />
            </div>
            <div>
              <div style={label}>İşletme Türü *</div>
              <input
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={inputStyle(v.type)}
                placeholder="Örn: Otel, Kafe, Mağaza"
                aria-invalid={!v.type}
              />
            </div>

            <div>
              <div style={label}>İl *</div>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                style={inputStyle(v.city)}
                placeholder="Örn: Sakarya"
                aria-invalid={!v.city}
              />
            </div>

            <div>
              <div style={label}>İlçe *</div>
              <input
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                style={inputStyle(v.district)}
                placeholder="Örn: Serdivan"
                aria-invalid={!v.district}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={label}>Başvuru Notu (opsiyonel)</div>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={{ ...inputStyle(true), minHeight: 90 }}
                placeholder="Kısaca ek bilgi/bağlam ekleyebilirsiniz."
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button
              onClick={() => {
                setForm({
                  name: "",
                  tradeTitle: "",
                  type: "",
                  instagramUsername: "",
                  instagramUrl: "",
                  website: "",
                  phone: "",
                  landline: "",
                  city: "",
                  district: "",
                  note: "",
                  terms: false,
                });
                setFiles([]);
                setTaxPdf(null);
                setPermitPdf(null);
                setBiz(null);
                localStorage.removeItem(DRAFT_KEY);
              }}
              style={subtleBtn}
            >
              Taslağı Temizle
            </button>
            <button
              disabled={!canNext1}
              onClick={() => setStep(2)}
              style={{ ...btn, opacity: canNext1 ? 1 : 0.5 }}
            >
              Devam Et ➜
            </button>
          </div>
        </div>
      )}

      {/* Adım 2: İletişim & Sosyal */}
      {step === 2 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={label}>Telefon (Mobil) *</div>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: prettyPhone(e.target.value) })}
                style={inputStyle(v.phone)}
                placeholder="0XXX XXX XX XX"
                aria-invalid={!v.phone}
              />
            </div>

            <div>
              <div style={label}>Sabit Telefon (opsiyonel)</div>
              <input
                value={form.landline}
                onChange={(e) => setForm({ ...form, landline: prettyPhone(e.target.value) })}
                style={inputStyle(true)}
                placeholder="0XXX XXX XX XX"
              />
            </div>

            <div>
              <div style={label}>Instagram Kullanıcı Adı</div>
              <input
                value={form.instagramUsername}
                onChange={(e) =>
                  setForm({ ...form, instagramUsername: e.target.value.replace(/\s/g, "") })
                }
                onBlur={() => {
                  if (!form.instagramUrl && form.instagramUsername.trim()) {
                    const u = form.instagramUsername.replace(/^@/, "");
                    setForm((prev) => ({
                      ...prev,
                      instagramUrl: `https://instagram.com/${u}`,
                    }));
                  }
                }}
                style={inputStyle(true)}
                placeholder="@kullanici"
              />
            </div>
            <div>
              <div style={label}>Instagram URL</div>
              <input
                value={form.instagramUrl}
                onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
                onBlur={() => {
                  if (!form.instagramUsername && form.instagramUrl) {
                    const u = usernameFromUrl(form.instagramUrl);
                    if (u) setForm((prev) => ({ ...prev, instagramUsername: "@" + u }));
                  }
                }}
                style={inputStyle(true)}
                placeholder="https://instagram.com/hesap"
              />
              {!!igSuggestion && (
                <div style={{ marginTop: 6 }}>
                  <span
                    style={chip}
                    title="Kullanıcı adını doldur"
                    onClick={() => setForm({ ...form, instagramUsername: "@" + igSuggestion })}
                  >
                    @{igSuggestion}
                  </span>
                </div>
              )}
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={label}>Web Sitesi</div>
              <input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                style={inputStyle(true)}
                placeholder="https://edogrula.org"
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button onClick={() => setStep(1)} style={subtleBtn}>
              ⟵ Geri
            </button>
            <button
              disabled={!canNext2}
              onClick={() => setStep(3)}
              style={{ ...btn, opacity: canNext2 ? 1 : 0.5 }}
            >
              Devam Et ➜
            </button>
          </div>
        </div>
      )}

      {/* Adım 3: Belgeler & Galeri */}
      {step === 3 && (
        <div style={{ ...card, marginBottom: 16 }}>
          {/* Zorunlu PDF'ler */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Vergi Levhası (PDF) *</div>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => onPickPdf("tax", e.target.files?.[0])}
              />
              {taxPdf && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#374151" }}>
                  Seçildi: <b>{taxPdf.name}</b> ({Math.round(taxPdf.size / 1024)} KB)
                  <button
                    onClick={() => setTaxPdf(null)}
                    style={{ ...subtleBtn, marginLeft: 10 }}
                  >
                    Kaldır
                  </button>
                </div>
              )}
              {!v.taxPdf && (
                <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>
                  Bu alan zorunludur.
                </div>
              )}
            </div>

            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                İşyeri Açma ve Çalıştırma Ruhsatı (PDF) *
              </div>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => onPickPdf("permit", e.target.files?.[0])}
              />
              {permitPdf && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#374151" }}>
                  Seçildi: <b>{permitPdf.name}</b> ({Math.round(permitPdf.size / 1024)} KB)
                  <button
                    onClick={() => setPermitPdf(null)}
                    style={{ ...subtleBtn, marginLeft: 10 }}
                  >
                    Kaldır
                  </button>
                </div>
              )}
              {!v.permitPdf && (
                <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>
                  Bu alan zorunludur.
                </div>
              )}
            </div>
          </div>

          {/* Görseller */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onPickFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#10b981" : "#d1d5db"}`,
              borderRadius: 14,
              padding: 20,
              textAlign: "center",
              background: dragOver ? "rgba(16,185,129,0.06)" : "transparent",
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827" }}>
              İşletme Görselleri (en fazla {MAX_IMAGES} adet)
            </div>
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
              JPG/WEBP – <b>en fazla {MAX_IMAGES} görsel</b>, her biri maks 10MB
            </div>
            <input
              ref={fileInputRef}
              style={{ display: "none" }}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => onPickFiles(e.target.files)}
            />
          </div>

          {uploadError && (
            <div
              role="alert"
              aria-live="polite"
              style={{ color: "#b91c1c", marginBottom: 8, fontWeight: 600 }}
            >
              {uploadError}
            </div>
          )}

          {!!files.length && (
            <>
              <div style={{ marginBottom: 6, fontSize: 13, color: "#374151" }}>
                Seçilen görseller: {files.length}/{MAX_IMAGES}{" "}
                {v.imagesOk ? "✓" : "(en az 1, en fazla 5 görsel)"}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
                  gap: 12,
                }}
              >
                {files.map((item, idx) => {
                  const url = item.file ? URL.createObjectURL(item.file) : "";
                  return (
                    <div
                      key={idx}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#fff",
                      }}
                      aria-label={`Görsel ${idx + 1}`}
                    >
                      <div
                        style={{
                          position: "relative",
                          height: 140,
                          background: "#f8fafc",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              filter: item.blur ? "blur(6px)" : "none",
                              transition: "filter .2s",
                            }}
                          />
                        ) : (
                          <div style={{ color: "#9ca3af", fontSize: 13 }}>
                            Önizleme yok
                          </div>
                        )}
                        <div
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            display: "flex",
                            gap: 6,
                          }}
                        >
                          <button
                            onClick={() =>
                              setFiles((p) =>
                                p.map((f, i) =>
                                  i === idx ? { ...f, blur: !f.blur } : f
                                )
                              )
                            }
                            style={subtleBtn}
                            title="Önizlemede bulanıklaştır"
                          >
                            Blur
                          </button>
                          <button
                            onClick={() => move(idx, -1)}
                            style={subtleBtn}
                            title="Yukarı taşı"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => move(idx, +1)}
                            style={subtleBtn}
                            title="Aşağı taşı"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => removeFile(idx)}
                            style={{
                              ...subtleBtn,
                              background: "#fff1f2",
                              borderColor: "#fecdd3",
                            }}
                            title="Kaldır"
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                      <div style={{ padding: 10 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#6b7280",
                            marginBottom: 6,
                          }}
                        >
                          {item.file?.name || item.name || "Görsel"}
                        </div>
                        <textarea
                          placeholder="Kısa not (örn. 'Ön cephe')"
                          value={item.note}
                          onChange={(e) =>
                            setFiles((prev) =>
                              prev.map((f, i) =>
                                i === idx ? { ...f, note: e.target.value } : f
                              )
                            )
                          }
                          style={{ ...inputStyle(true), minHeight: 70, marginBottom: 0 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button onClick={() => setStep(2)} style={subtleBtn}>
              ⟵ Geri
            </button>
            <button onClick={() => setStep(4)} style={btn}>
              Devam Et ➜
            </button>
          </div>
        </div>
      )}

      {/* Adım 4: Önizleme & Gönder */}
      {step === 4 && (
        <div style={{ ...card }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
            <div>
              <div
                style={{
                  ...card,
                  padding: 16,
                  border: "1px dashed #e5e7eb",
                  background: "#fbfbff",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: 8,
                    color: "#111827",
                  }}
                >
                  Özet
                </div>
                <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                  {biz && (
                    <>
                      <b>İşletme Kaydı:</b> {biz.name}{" "}
                      {biz.slug ? `(${biz.slug})` : ""}
                      <br />
                    </>
                  )}
                  <b>İşletme:</b> {form.name || "-"} <br />
                  <b>Ticari Ünvan:</b> {form.tradeTitle || "-"} <br />
                  <b>Tür:</b> {form.type || "-"} <br />
                  <b>İl:</b> {form.city || "-"} <br />
                  <b>İlçe:</b> {form.district || "-"} <br />
                  <b>Telefon (mobil):</b> {form.phone || "-"} <br />
                  <b>Sabit:</b> {form.landline || "-"} <br />
                  <b>Instagram:</b> {form.instagramUsername || form.instagramUrl || "-"}{" "}
                  <br />
                  <b>Web:</b> {form.website || "-"} <br />
                  {!!form.note && (
                    <>
                      <b>Not:</b> {form.note}
                    </>
                  )}
                </div>
              </div>

              {/* Sunucuya yüklenen belgeler */}
              {serverReqId && (
                <div style={{ ...card, padding: 16, marginTop: 16 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>
                    Sunucuya Yüklenen Belgeler
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {serverFiles.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`doc-${i + 1}`}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        className="w-full h-28 object-cover rounded"
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                    Klasör: <code>/uploads/apply/{serverReqId}</code>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div style={{ ...card, padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Son Kontrol</div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    color: "#374151",
                    fontSize: 14,
                  }}
                >
                  <li>Bilgiler doğru ve günceldir.</li>
                  <li>Vergi levhası ve ruhsat PDF olarak eklendi.</li>
                  <li>
                    İşletme görselleri <b>en fazla 5 adet</b>tir (en az 1 görsel gereklidir).
                  </li>
                  <li>Gizlilik ve kullanım şartlarını kabul ediyorum.</li>
                </ul>

                {/* Koşullar onayı */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.terms}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, terms: e.target.checked }))
                    }
                  />
                  <span>
                    <b>Koşulları kabul ediyorum.</b>
                  </span>
                </label>

                {error && (
                  <p
                    role="alert"
                    aria-live="assertive"
                    style={{
                      color: "#b91c1c",
                      marginTop: 12,
                      fontWeight: 700,
                    }}
                  >
                    {error}
                  </p>
                )}

                {/* Yükleme ilerlemesi */}
                {submitting && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        height: 8,
                        background: "#f1f5f9",
                        borderRadius: 999,
                        overflow: "hidden",
                        border: "1px solid #e5e7eb",
                      }}
                      aria-label="Yükleme ilerlemesi"
                    >
                      <div
                        style={{
                          width: `${progress}%`,
                          height: "100%",
                          background: "#27ae60",
                          transition: "width .2s",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginTop: 6,
                      }}
                    >
                      {progress}%
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <button onClick={() => setStep(3)} style={subtleBtn}>
                    ⟵ Belgeler & Galeriye Dön
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit}
                    style={{
                      ...btn,
                      background: submitting ? "#9ca3af" : "#27ae60",
                    }}
                    aria-disabled={submitting || !canSubmit}
                  >
                    {submitting ? "Gönderiliyor…" : "Başvuruyu Gönder"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Başarı Popup */}
      {showPopup && (
        <div style={popupOverlay} role="dialog" aria-label="Başarı mesajı">
          <div style={popupBox}>
            <h3>Başvurunuz Değerlendirmeye Alınmıştır</h3>
            <p>En kısa sürede değerlendirilip size bilgi verilecektir.</p>
            <button
              onClick={() => setShowPopup(false)}
              style={{ ...btn, padding: "10px 16px" }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Popup styles */
const popupOverlay = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};
const popupBox = {
  backgroundColor: "#fff",
  padding: 24,
  borderRadius: 14,
  maxWidth: 520,
  textAlign: "center",
  boxShadow: "0px 10px 28px rgba(0,0,0,0.25)",
};
