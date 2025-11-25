// src/pages/Report.jsx — ULTRA PRO (tek dosya, CSS gömülü)
// 3-step ihbar formu + draft + güvenli dosya yönetimi + doğrulama token flow
// shadcn bağımsız, Tailwind varsa onu kullanır; yoksa alttaki CSS fallback devreye girer.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";

/* ===================== Embedded CSS (no extra file) ===================== */
const REPORT_CSS = `
.report-page{
  width: min(960px, 96vw);
  margin: 0 auto;
  padding: 20px 16px 48px;
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  color: #0f172a;
}

/* Card */
.report-page .rp-card{
  background:#fff;
  border:1px solid #e2e8f0;
  border-radius:16px;
  box-shadow:0 6px 18px rgba(15,23,42,.05);
}
.report-page .rp-card-header{ padding:16px 16px 0; }
.report-page .rp-card-title{
  font-weight:800;
  font-size:14px;
  color:#0f172a;
}
.report-page .rp-card-content{ padding:16px; }

/* Inputs */
.report-page .rp-input,
.report-page .rp-textarea{
  width:100%;
  border:1px solid #e2e8f0;
  background:#fff;
  color:#0f172a;
  border-radius:10px;
  font-size:14px;
  outline:none;
  box-shadow:0 2px 6px rgba(0,0,0,.04);
  transition:border-color .15s ease, box-shadow .15s ease;
}
.report-page .rp-input{ height:40px; padding:0 12px; }
.report-page .rp-textarea{ min-height:90px; padding:10px 12px; resize:vertical; }
.report-page .rp-input::placeholder,
.report-page .rp-textarea::placeholder{ color:#94a3b8; }
.report-page .rp-input:focus,
.report-page .rp-textarea:focus{
  border-color:#94a3b8;
  box-shadow:0 0 0 3px rgba(15,23,42,.08);
}
.report-page .border-rose-400{ border-color:#fb7185 !important; }
.report-page .focus-visible\\:ring-rose-300:focus{ box-shadow:0 0 0 3px rgba(251,113,133,.25) !important; }

/* Checkbox */
.report-page .rp-checkbox{
  width:16px;height:16px;accent-color:#0f172a;cursor:pointer;
}

/* Buttons */
.report-page .rp-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  font-weight:800;border-radius:12px;cursor:pointer;border:1px solid transparent;
  transition:transform .05s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
  user-select:none;white-space:nowrap;
}
.report-page .rp-btn:active{ transform: translateY(1px); }
.report-page .rp-btn:disabled{ opacity:.55; cursor:not-allowed; box-shadow:none!important; }

/* sizes */
.report-page .rp-btn--defaultSize{ height:40px;padding:0 16px;font-size:14px; }
.report-page .rp-btn--sm{ height:36px;padding:0 12px;font-size:13px;border-radius:10px; }
.report-page .rp-btn--icon{ height:36px;width:36px;padding:0;border-radius:10px; }

/* variants */
.report-page .rp-btn--default{
  background:#0f172a;color:#fff;box-shadow:0 6px 14px rgba(15,23,42,.18);
}
.report-page .rp-btn--default:hover{ background:#111827; }
.report-page .rp-btn--secondary{
  background:#fff;color:#0f172a;border-color:#e2e8f0;
  box-shadow:0 4px 10px rgba(15,23,42,.06);
}
.report-page .rp-btn--secondary:hover{ background:#f8fafc;border-color:#cbd5e1; }
.report-page .rp-btn--destructive{
  background:#e11d48;color:#fff;box-shadow:0 6px 14px rgba(225,29,72,.25);
}
.report-page .rp-btn--destructive:hover{ background:#be123c; }
.report-page .rp-btn--ghost{ background:transparent;color:#0f172a; }
.report-page .rp-btn--ghost:hover{ background:#f1f5f9; }

/* Stepper */
.report-page .rp-stepper{ display:flex;align-items:center;gap:8px; }
.report-page .rp-stepper-dot{
  width:10px;height:10px;border-radius:999px;background:#cbd5e1;
}
.report-page .rp-stepper-dot--done{ background:#64748b; }
.report-page .rp-stepper-dot--active{ background:#0f172a; }
.report-page .rp-stepper-line{
  width:48px;height:2px;background:#e2e8f0;border-radius:999px;
}
.report-page .rp-stepper-line--done{ background:#64748b; }

/* Hint */
.report-page .rp-hint{
  font-size:12px;border-radius:8px;padding:8px 10px;border:1px solid #e2e8f0;
}
.report-page .rp-hint--muted{ background:#f8fafc;color:#475569; }
.report-page .rp-hint--warn{ background:#fffbeb;color:#92400e;border-color:#fde68a; }
.report-page .rp-hint--err{ background:#fff1f2;color:#9f1239;border-color:#fecdd3; }

/* Chips */
.report-page .rp-chip{
  display:inline-flex;align-items:center;gap:6px;padding:6px 10px;font-size:12px;font-weight:700;
  border-radius:999px;border:1px solid transparent;cursor:pointer;
  transition:background .15s ease, border-color .15s ease;
  margin-right:6px;margin-bottom:6px;
}
.report-page .rp-chip--blue{ background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8; }
.report-page .rp-chip--blue:hover{ background:#dbeafe; }
.report-page .rp-chip--green{ background:#ecfdf5;border-color:#a7f3d0;color:#047857; }
.report-page .rp-chip--green:hover{ background:#d1fae5; }
.report-page .rp-chip--red{ background:#fff1f2;border-color:#fecdd3;color:#be123c; }

/* Dropzone + File grid */
.report-page .rp-dropzone{
  border:2px dashed #cbd5e1;border-radius:14px;padding:22px;text-align:center;cursor:pointer;
}
.report-page .rp-filegrid{ gap:12px; }
.report-page .rp-filecard{
  border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;
}
.report-page .rp-filepreview{ position:relative; }
.report-page .rp-fileactions{ gap:6px; }

/* Popup */
.report-page .rp-popup > div{ animation: popIn .12s ease-out; }
@keyframes popIn{
  from{ transform: translateY(6px) scale(.98); opacity:.6; }
  to{ transform: translateY(0) scale(1); opacity:1; }
}

/* Responsive */
@media (max-width: 640px){
  .report-page{ padding:16px 12px 40px; }
  .report-page .rp-stepper-line{ width:32px; }
  .report-page .rp-btn--defaultSize{ width:100%; }
}
`;

function ReportStyles() {
  return <style>{REPORT_CSS}</style>;
}

/* ===================== Mini UI Kit (shadcn-free, CSS fallback ready) ===================== */

const cx = (...a) => a.filter(Boolean).join(" ");

function Button({
  variant = "default",
  size = "default",
  className = "",
  type,
  disabled,
  ...props
}) {
  const base =
    "rp-btn inline-flex items-center justify-center gap-2 rounded-xl font-extrabold transition " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 " +
    "disabled:opacity-50 disabled:pointer-events-none active:translate-y-[1px]";

  const variants = {
    default:
      "rp-btn--default bg-slate-900 text-white hover:bg-slate-800 shadow-sm",
    secondary:
      "rp-btn--secondary bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm",
    destructive:
      "rp-btn--destructive bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
    ghost:
      "rp-btn--ghost bg-transparent text-slate-900 hover:bg-slate-100",
  };

  const sizes = {
    default: "rp-btn--defaultSize h-10 px-4 text-sm",
    sm: "rp-btn--sm h-9 px-3 text-sm rounded-lg",
    icon: "rp-btn--icon h-9 w-9 p-0 rounded-lg",
  };

  return (
    <button
      type={type || "button"}
      disabled={disabled}
      className={cx(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

function Input({ className = "", ...props }) {
  return (
    <input
      className={cx(
        "rp-input h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 " +
          "placeholder:text-slate-400 shadow-sm outline-none transition " +
          "focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10",
        className
      )}
      {...props}
    />
  );
}

function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={cx(
        "rp-textarea w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 " +
          "placeholder:text-slate-400 shadow-sm outline-none transition resize-y " +
          "focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10",
        className
      )}
      {...props}
    />
  );
}

function Checkbox({ checked, onCheckedChange, className = "", ...props }) {
  return (
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cx(
        "rp-checkbox h-4 w-4 rounded border border-slate-300 text-slate-900 " +
          "focus:ring-2 focus:ring-slate-900/20",
        className
      )}
      {...props}
    />
  );
}

function Card({ className = "", ...props }) {
  return (
    <div
      className={cx(
        "rp-card rounded-2xl border border-slate-200 bg-white shadow-sm",
        className
      )}
      {...props}
    />
  );
}
function CardHeader({ className = "", ...props }) {
  return (
    <div className={cx("rp-card-header px-4 pt-4", className)} {...props} />
  );
}
function CardTitle({ className = "", ...props }) {
  return (
    <div
      className={cx("rp-card-title text-sm font-extrabold text-slate-900", className)}
      {...props}
    />
  );
}
function CardContent({ className = "", ...props }) {
  return (
    <div className={cx("rp-card-content p-4", className)} {...props} />
  );
}

/* ===================== Config & Helpers ===================== */

const IS_BROWSER = typeof window !== "undefined";

function normalizeOrigin(raw) {
  const RAW = String(raw || "").trim();
  let t = "";
  if (!RAW) return "";
  if (/^https?:\/\//i.test(RAW)) t = RAW;
  else if (/^:\d+$/.test(RAW)) t = `http://localhost${RAW}`;
  else t = `http://${RAW}`;
  return t.replace(/\/+$/, "").replace(/\/api$/i, "");
}

const API_ORIGIN = normalizeOrigin(
  import.meta.env.VITE_API_URL || import.meta.env.VITE_API_ROOT
);

const AX = axios.create({
  baseURL: API_ORIGIN || undefined,
  withCredentials: true,
  timeout: 30000,
  headers: { Accept: "application/json", "x-edogrula-client": "web" },
});

const genRID = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

function getVerifyToken() {
  if (!IS_BROWSER) return null;
  const keys = [
    "emailVerifyToken",
    "verifyEmailToken",
    "verify_token",
    "verifyToken",
  ];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }
  try {
    const vt = new URLSearchParams(window.location.search).get("vt");
    if (vt) {
      localStorage.setItem("emailVerifyToken", vt);
      sessionStorage.setItem("emailVerifyToken", vt);
      return vt;
    }
  } catch {}
  return null;
}

/* ---- Anti-adblock remap (report -> rpt) ---- */
function remapForAdblock(pathLike) {
  const u = String(pathLike || "");
  try {
    if (/^https?:\/\//i.test(u)) {
      const url = new URL(u);
      url.pathname = remapForAdblock(url.pathname);
      return url.origin + url.pathname + url.search + url.hash;
    }
  } catch {}
  return u.replace(/\/report(\/|$)/gi, "/rpt$1");
}

const RETRY_FLAG = "__antiBlockRetried";
const isCancel = (e) =>
  e?.code === "ERR_CANCELED" ||
  e?.name === "CanceledError" ||
  (typeof axios.isCancel === "function" && axios.isCancel(e));

if (!AX.__hasReqInterceptor) {
  AX.interceptors.request.use((cfg) => {
    const vt = getVerifyToken();
    if (vt) {
      cfg.headers["x-verify-token"] = vt;
      cfg.headers["X-Verify-Token"] = vt;
    }
    cfg.headers["x-request-id"] = genRID();
    try {
      cfg.headers["x-tz"] =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {}
    if (import.meta.env.VITE_APP_VERSION)
      cfg.headers["x-app-version"] = String(import.meta.env.VITE_APP_VERSION);
    return cfg;
  });
  AX.__hasReqInterceptor = true;
}

if (!AX.__hasResInterceptor) {
  AX.interceptors.response.use(
    (r) => r,
    async (err) => {
      if (isCancel(err)) return Promise.reject(err);

      const cfg = err?.config || {};
      const urlStr = String(cfg.url || "");
      const looksBlocked =
        !err?.response &&
        (err?.code === "ERR_BLOCKED_BY_CLIENT" ||
          err?.code === "ERR_NETWORK" ||
          err?.message?.toLowerCase?.().includes("blocked") ||
          err?.message?.toLowerCase?.().includes("network error"));

      if (looksBlocked && /\/api\/report/i.test(urlStr) && !cfg[RETRY_FLAG]) {
        cfg[RETRY_FLAG] = true;
        const remapped = remapForAdblock(urlStr);
        if (remapped !== urlStr) {
          try {
            return await AX.request({ ...cfg, url: remapped });
          } catch (e2) {
            return Promise.reject(e2);
          }
        }
      }

      return Promise.reject(err);
    }
  );
  AX.__hasResInterceptor = true;
}

/* ===================== Pattern Helpers ===================== */

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_FILES = 10;
const MAX_SIZE = 10 * 1024 * 1024;

const REGEX = {
  iban: /\bTR\d{24}\b/gi,
  phone: /(\+90\s?)?0?\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}\b/gi,
  instagram: /(?:@|instagram\.com\/)([A-Za-z0-9._]{2,30})/gi,
  amount:
    /(?:₺|TL|TRY)\s?([0-9]{1,3}(\.[0-9]{3})*(,[0-9]{1,2})?|[0-9]+([.,][0-9]{1,2})?)/gi,
  date:
    /\b(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-](20\d{2})\b/gi,
};

const extractSignals = (text) => {
  const src = (text || "").toString();
  const pick = (re) => {
    const out = [];
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(src))) out.push(m[0]);
    return [...new Set(out)];
  };
  const igHandles = [];
  {
    const r = new RegExp(REGEX.instagram.source, REGEX.instagram.flags);
    let m;
    while ((m = r.exec(src))) {
      const h = (m[1] || "").replace(/^@+/, "");
      if (h) igHandles.push(h);
    }
  }
  return {
    ibans: pick(REGEX.iban),
    phones: pick(REGEX.phone),
    instagrams: [...new Set(igHandles)],
    amounts: pick(REGEX.amount),
    dates: pick(REGEX.date),
  };
};

const prettyPhone = (p) =>
  String(p || "")
    .replace(/\D/g, "")
    .replace(
      /^0?(\d{3})(\d{3})(\d{2})(\d{2}).*/,
      "0$1 $2 $3 $4"
    );

const normIgHandle = (h) =>
  String(h || "").replace(/\s/g, "").replace(/^@+/, "");

const isValidEmail = (s) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

const fileKey = (f) =>
  `${f?.name || ""}-${f?.size || 0}-${f?.lastModified || 0}`;

/* ===================== Small UI Bits ===================== */

function Stepper({ step }) {
  const dotClass = (active, done) =>
    cx(
      "rp-stepper-dot h-2.5 w-2.5 rounded-full",
      active
        ? "rp-stepper-dot--active bg-slate-900"
        : done
        ? "rp-stepper-dot--done bg-slate-500"
        : "bg-slate-300"
    );
  const lineClass = (done) =>
    cx(
      "rp-stepper-line h-0.5 w-12",
      done ? "rp-stepper-line--done bg-slate-500" : "bg-slate-200"
    );

  return (
    <div className="rp-stepper flex items-center gap-2" aria-label="Adımlar">
      <span className={dotClass(step === 1, step > 1)} />
      <span className={lineClass(step > 1)} />
      <span className={dotClass(step === 2, step > 2)} />
      <span className={lineClass(step > 2)} />
      <span className={dotClass(step === 3, false)} />
    </div>
  );
}

function Hint({ tone = "muted", children }) {
  const map = {
    muted:
      "rp-hint rp-hint--muted bg-slate-50 text-slate-600 border-slate-200",
    warn:
      "rp-hint rp-hint--warn bg-amber-50 text-amber-800 border-amber-200",
    err:
      "rp-hint rp-hint--err bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <div
      className={cx(
        "mt-1 rounded-md border px-3 py-2 text-xs",
        map[tone] || map.muted
      )}
    >
      {children}
    </div>
  );
}

function Chip({ onClick, children, tone = "blue" }) {
  const map = {
    blue:
      "rp-chip rp-chip--blue bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",
    green:
      "rp-chip rp-chip--green bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
    red:
      "rp-chip rp-chip--red bg-rose-50 border-rose-200 text-rose-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "mr-2 mb-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
        map[tone]
      )}
    >
      {children}
    </button>
  );
}

/* ===================== Component ===================== */

export default function Report() {
  const navigate = useNavigate();
  const location = useLocation();

  /* ---------- FORM ---------- */
  const [form, setForm] = useState({
    name: "",
    instagramUsername: "",
    instagramUrl: "",
    phone: "",
    desc: "",
    reporterEmail: "",
    reporterName: "",
    reporterPhone: "",
    consent: false,
  });

  const setField = useCallback((k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
  }, []);

  /* ---------- FILES ---------- */
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [fileMsg, setFileMsg] = useState("");

  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach((x) => x.url && URL.revokeObjectURL(x.url));
    };
  }, []);

  const onPickFiles = useCallback((list) => {
    const arr = Array.from(list || []);
    if (!arr.length) return;

    setFiles((prev) => {
      const existing = new Set(
        prev.map((f) => fileKey(f.file) || `${f.name}-0-0`)
      );
      const next = [];
      let dupe = 0,
        badType = 0,
        tooBig = 0;

      for (const f of arr) {
        if (!f) continue;
        const key = fileKey(f);
        if (existing.has(key)) {
          dupe++;
          continue;
        }

        const okType = ALLOWED_MIME.includes(f.type);
        const okSize = f.size <= MAX_SIZE;

        if (!okType) {
          badType++;
          continue;
        }
        if (!okSize) {
          tooBig++;
          continue;
        }

        next.push({
          file: f,
          note: "",
          blur: false,
          name: f.name,
          url: URL.createObjectURL(f),
        });
      }

      const merged = [...prev, ...next].slice(0, MAX_FILES);

      const msgs = [];
      if (dupe) msgs.push(`${dupe} kopya dosya elendi`);
      if (badType) msgs.push(`${badType} dosya türü desteklenmiyor`);
      if (tooBig) msgs.push(`${tooBig} dosya 10MB üstü`);
      if (merged.length >= MAX_FILES && prev.length + next.length > MAX_FILES)
        msgs.push(`maksimum ${MAX_FILES} dosya sınırına ulaşıldı`);

      setFileMsg(msgs.length ? msgs.join(" • ") : "");
      return merged;
    });
  }, []);

  const removeFile = useCallback((i) => {
    setFiles((prev) => {
      const c = prev.slice();
      const [rm] = c.splice(i, 1);
      if (rm?.url) URL.revokeObjectURL(rm.url);
      return c;
    });
  }, []);

  const move = useCallback((i, dir) => {
    setFiles((prev) => {
      const c = prev.slice();
      const j = i + dir;
      if (j < 0 || j >= c.length) return c;
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }, []);

  const toggleBlur = useCallback((i) => {
    setFiles((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, blur: !f.blur } : f))
    );
  }, []);

  const setNote = useCallback((i, note) => {
    setFiles((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, note } : f))
    );
  }, []);

  /* ---------- UI ---------- */
  const [step, setStep] = useState(1);
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  /* ---------- Draft ---------- */
  const DRAFT_KEY = "reportDraft.v1";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.form) setForm((p) => ({ ...p, ...parsed.form }));
      if (Array.isArray(parsed.filesMeta)) {
        setFiles(
          parsed.filesMeta.map((m) => ({
            file: null,
            note: m.note || "",
            blur: !!m.blur,
            name: m.name || "",
            url: "",
          }))
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      const filesMeta = files.map((f) => ({
        name: f.file?.name || f.name || "",
        note: f.note || "",
        blur: !!f.blur,
      }));
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, filesMeta }));
    }, 350);
    return () => clearTimeout(id);
  }, [form, files]);

  /* ---------- Paste ---------- */
  const onPaste = useCallback(
    (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const pasted = items
        .filter((it) => it.kind === "file")
        .map((it) => it.getAsFile())
        .filter(Boolean);
      if (pasted.length) onPickFiles(pasted);
    },
    [onPickFiles]
  );

  useEffect(() => {
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onPaste]);

  /* ---------- Leave warning ---------- */
  const hasUnsaved = useMemo(() => {
    const f = form;
    const nonEmpty = [
      f.name,
      f.instagramUsername,
      f.instagramUrl,
      f.phone,
      f.desc,
      f.reporterEmail,
      f.reporterName,
      f.reporterPhone,
    ].some((x) => (x || "").trim().length > 0);
    return nonEmpty || files.length > 0;
  }, [form, files]);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasUnsaved || submitting) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsaved, submitting]);

  /* ---------- Signals ---------- */
  const signals = useMemo(() => {
    const fromDesc = extractSignals(form.desc);
    const phones = new Set(fromDesc.phones);
    if (form.phone) phones.add(prettyPhone(form.phone));
    const instas = new Set(fromDesc.instagrams);
    if (form.instagramUsername)
      instas.add(normIgHandle(form.instagramUsername));
    if (form.instagramUrl) {
      const m =
        /instagram\.com\/([A-Za-z0-9._]{2,30})/i.exec(
          form.instagramUrl
        );
      if (m?.[1]) instas.add(m[1]);
    }
    return {
      ibans: fromDesc.ibans,
      phones: Array.from(phones).filter(Boolean),
      instagrams: Array.from(instas).filter(Boolean),
      amounts: fromDesc.amounts,
      dates: fromDesc.dates,
    };
  }, [
    form.desc,
    form.instagramUrl,
    form.instagramUsername,
    form.phone,
  ]);

  /* ---------- Validation ---------- */
  const v = useMemo(() => {
    return {
      name: form.name.trim().length >= 2,
      ig:
        normIgHandle(form.instagramUsername).length >= 2 ||
        /instagram\.com\//i.test(form.instagramUrl),
      phone: form.phone.replace(/\D/g, "").length >= 10,
      desc: form.desc.trim().length >= 20,
      consent: !!form.consent,
      victimEmail: isValidEmail(form.reporterEmail),
      victimName: form.reporterName.trim().length >= 3,
      victimPhone:
        form.reporterPhone.replace(/\D/g, "").length >= 10,
    };
  }, [form]);

  const canNextFrom1 =
    v.name &&
    v.ig &&
    v.phone &&
    v.desc &&
    v.victimEmail &&
    v.victimName &&
    v.victimPhone;

  const canSubmit = canNextFrom1 && v.consent;

  const validationErrors = useMemo(() => {
    const errs = [];
    if (!v.name) errs.push("İşletme adı en az 2 karakter olmalı.");
    if (!v.ig) errs.push("Instagram kullanıcı adı veya URL gerekli.");
    if (!v.phone) errs.push("İşletme telefonu geçersiz.");
    if (!v.desc) errs.push("İhbar açıklaması en az 20 karakter olmalı.");
    if (!v.victimEmail) errs.push("Mağdur e-postası geçersiz.");
    if (!v.victimName) errs.push("Mağdur adı en az 3 karakter olmalı.");
    if (!v.victimPhone) errs.push("Mağdur telefonu geçersiz.");
    return errs;
  }, [v]);

  /* ---------- Actions ---------- */
  const clearAll = useCallback(() => {
    if (
      hasUnsaved &&
      !window.confirm("Taslak ve delilleri temizlemek istiyor musun?")
    )
      return;

    setForm({
      name: "",
      instagramUsername: "",
      instagramUrl: "",
      phone: "",
      desc: "",
      reporterEmail: "",
      reporterName: "",
      reporterPhone: "",
      consent: false,
    });

    files.forEach((x) => x.url && URL.revokeObjectURL(x.url));
    setFiles([]);
    setError("");
    setFileMsg("");
    localStorage.removeItem(DRAFT_KEY);
  }, [files, hasUnsaved]);

  /* ===================== Submit ===================== */
  const handleSubmit = useCallback(async () => {
    setError("");
    setProgress(0);

    if (!canSubmit) {
      if (!v.consent) {
        setError("Lütfen yasal sorumluluk onayını işaretleyin.");
        return;
      }
      setError("Zorunlu alanlar eksik veya hatalı. Lütfen kontrol edin.");
      return;
    }

    const token = getVerifyToken();
    if (!token) {
      const target = `/verify-email?redirect=${encodeURIComponent(
        location.pathname || "/report"
      )}`;
      navigate(target, { replace: true });
      return;
    }

    try {
      setSubmitting(true);

      const fd = new FormData();
      fd.append("name", form.name.trim());
      fd.append("instagramUsername", normIgHandle(form.instagramUsername));
      fd.append("instagramUrl", form.instagramUrl.trim());
      fd.append("phone", form.phone.trim());
      fd.append("desc", form.desc.trim());

      fd.append("reporterEmail", form.reporterEmail.trim());
      fd.append("reporterName", form.reporterName.trim());
      fd.append("reporterPhone", form.reporterPhone.trim());

      fd.append("consent", "true");
      fd.append("policyVersion", "v1");
      try {
        fd.append("userAgent", navigator.userAgent || "");
      } catch {}

      const notes = [];
      files.forEach((f, idx) => {
        if (f.file) fd.append("evidence", f.file);
        notes.push({
          index: idx,
          note: f.note || "",
          blur: !!f.blur,
          name: f.file?.name || f.name || "",
        });
      });
      fd.append("evidenceNotes", JSON.stringify(notes));

      const res = await AX.post("/api/report", fd, {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const pct = Math.round((evt.loaded * 100) / evt.total);
          setProgress(pct);
        },
      });

      const refId =
        res?.data?.id ||
        res?.data?.report?._id ||
        res?.data?._id ||
        null;

      console.info("📨 Report submitted", { refId });

      setShowPopup(true);
      clearAll();
      setStep(1);
      window.scrollTo({ top: 0, behavior: "smooth" });

      setTimeout(() => setShowPopup(false), 10000);
    } catch (err) {
      const status = err?.response?.status;

      if (status === 401) {
        setError("Oturum doğrulaması gerekli. Lütfen e-posta doğrulamasını tamamlayın.");
        const target = `/verify-email?redirect=${encodeURIComponent(
          location.pathname || "/report"
        )}`;
        navigate(target, { replace: true });
      } else if (status === 413) {
        setError("Dosya boyutu çok büyük. Lütfen 10MB altı dosyalar yükleyin.");
      } else if (status === 429) {
        setError("Çok sık denediniz. Lütfen biraz sonra tekrar deneyin.");
      } else if (
        err?.code === "ERR_NETWORK" ||
        err?.message?.includes("Network Error")
      ) {
        setError("Ağ hatası. Sunucuya erişilemiyor veya CORS engeli var.");
      } else {
        setError(
          err?.response?.data?.message ||
            "❌ İhbar gönderilirken bir hata oluştu."
        );
      }
    } finally {
      setSubmitting(false);
      setProgress(0);
    }
  }, [
    canSubmit,
    v,
    files,
    form,
    location.pathname,
    navigate,
    clearAll,
  ]);

  /* ===================== Render ===================== */
  return (
    <>
      <ReportStyles />
      <div className="report-page mx-auto max-w-4xl px-4 py-7 font-sans">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-slate-900 md:text-2xl">
            Dolandırıcılık İhbarı
          </h2>
          <Stepper step={step} />
        </div>

        {/* Warning */}
        <Card className="mb-4 border-amber-200 bg-amber-50/50">
          <CardContent className="flex gap-3 p-4 text-sm text-slate-700">
            <div className="text-lg">⚠️</div>
            <div>
              Lütfen yalnızca gerçeği yansıtan bilgiler girin. İftira,
              kişisel veri ihlali veya yasa dışı içerik paylaşımı hukuki
              sorumluluk doğurur. Delil yüklerken gizlemek istediğiniz
              veriler varsa önizlemede <b>“Blur”</b> kullanabilirsiniz
              (sadece önizleme içindir).
            </div>
          </CardContent>
        </Card>

        {/* ===================== STEP 1 ===================== */}
        {step === 1 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-extrabold">
                İşletme ve Mağdur Bilgileri
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Business Name */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    İşletme Adı *
                  </label>
                  <Input
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Örn: Tatil Evi Şubesi"
                    className={!v.name ? "border-rose-400 focus-visible:ring-rose-300" : ""}
                  />
                  {!v.name && (
                    <Hint tone="err">İşletme adı en az 2 karakter olmalı.</Hint>
                  )}
                </div>

                {/* Business Phone */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    İşletme Telefonu *
                  </label>
                  <Input
                    value={form.phone}
                    onChange={(e) =>
                      setField("phone", prettyPhone(e.target.value))
                    }
                    placeholder="0XXX XXX XX XX"
                    className={!v.phone ? "border-rose-400 focus-visible:ring-rose-300" : ""}
                  />
                  {!v.phone && (
                    <Hint tone="err">Telefon 10 haneli olmalı.</Hint>
                  )}
                </div>

                {/* IG Username */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Instagram Kullanıcı Adı *
                  </label>
                  <Input
                    value={form.instagramUsername}
                    onChange={(e) =>
                      setField(
                        "instagramUsername",
                        e.target.value.replace(/\s/g, "")
                      )
                    }
                    placeholder="@kullanici"
                    className={!v.ig ? "border-rose-400 focus-visible:ring-rose-300" : ""}
                  />
                </div>

                {/* IG URL */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Instagram URL *
                  </label>
                  <Input
                    value={form.instagramUrl}
                    onChange={(e) =>
                      setField("instagramUrl", e.target.value)
                    }
                    placeholder="https://instagram.com/hesap"
                    className={!v.ig ? "border-rose-400 focus-visible:ring-rose-300" : ""}
                  />
                  {!v.ig && (
                    <Hint tone="err">
                      Kullanıcı adı <b>veya</b> URL zorunlu.
                    </Hint>
                  )}
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    İhbar Açıklaması *
                  </label>
                  <Textarea
                    value={form.desc}
                    onChange={(e) => setField("desc", e.target.value)}
                    placeholder="Ne oldu? Kim, ne zaman, hangi tutar? IBAN/WhatsApp konuşma özeti..."
                    className={cx(
                      "min-h-[120px]",
                      !v.desc ? "border-rose-400 focus-visible:ring-rose-300" : ""
                    )}
                  />
                  <div className="mt-1 text-right text-xs text-slate-500">
                    {form.desc.length} karakter
                  </div>
                  {!v.desc && (
                    <Hint tone="err">
                      Açıklama en az 20 karakter olmalı.
                    </Hint>
                  )}
                </div>
              </div>

              {/* Signals */}
              <div className="space-y-2">
                {!!signals.instagrams.length && (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-slate-500">
                      Önerilen Instagram
                    </div>
                    {signals.instagrams.slice(0, 5).map((h, i) => (
                      <Chip
                        key={`ig-${i}`}
                        onClick={() =>
                          setField(
                            "instagramUsername",
                            h.startsWith("@") ? h : "@" + h
                          )
                        }
                      >
                        @{h}
                      </Chip>
                    ))}
                  </div>
                )}

                {!!signals.phones.length && (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-slate-500">
                      Önerilen Telefon
                    </div>
                    {signals.phones.slice(0, 3).map((p, i) => (
                      <Chip
                        key={`ph-${i}`}
                        tone="green"
                        onClick={() =>
                          setField("phone", prettyPhone(p))
                        }
                      >
                        {prettyPhone(p)}
                      </Chip>
                    ))}
                  </div>
                )}

                {!!signals.ibans.length && (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-slate-500">
                      Tespit edilen IBAN
                    </div>
                    {signals.ibans.slice(0, 2).map((t, i) => (
                      <Chip key={`ib-${i}`} tone="red">
                        {t}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>

              {/* Victim */}
              <div className="rounded-lg border border-dashed border-slate-200 p-4">
                <div className="mb-3 text-sm font-extrabold text-slate-900">
                  Mağdur Bilgileri *
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">
                      E-posta *
                    </label>
                    <Input
                      value={form.reporterEmail}
                      onChange={(e) =>
                        setField("reporterEmail", e.target.value)
                      }
                      placeholder="ornek@eposta.com"
                      className={!v.victimEmail ? "border-rose-400 focus-visible:ring-rose-300" : ""}
                    />
                    {!v.victimEmail && (
                      <Hint tone="err">Geçerli e-posta girin.</Hint>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">
                      Ad Soyad *
                    </label>
                    <Input
                      value={form.reporterName}
                      onChange={(e) =>
                        setField("reporterName", e.target.value)
                      }
                      placeholder="Ad Soyad"
                      className={!v.victimName ? "border-rose-400 focus-visible:ring-rose-300" : ""}
                    />
                    {!v.victimName && (
                      <Hint tone="err">En az 3 karakter olmalı.</Hint>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">
                      Telefon *
                    </label>
                    <Input
                      value={form.reporterPhone}
                      onChange={(e) =>
                        setField(
                          "reporterPhone",
                          prettyPhone(e.target.value)
                        )
                      }
                      placeholder="0XXX XXX XX XX"
                      className={!v.victimPhone ? "border-rose-400 focus-visible:ring-rose-300" : ""}
                    />
                    {!v.victimPhone && (
                      <Hint tone="err">Telefon 10 haneli olmalı.</Hint>
                    )}
                  </div>
                </div>
              </div>

              {!!validationErrors.length && (
                <Hint tone="warn">
                  {validationErrors.map((x, i) => (
                    <div key={i}>• {x}</div>
                  ))}
                </Hint>
              )}

              <div className="flex items-center justify-between gap-2">
                <Button variant="secondary" onClick={clearAll}>
                  Taslağı Temizle
                </Button>

                <Button
                  onClick={() => setStep(2)}
                  disabled={!canNextFrom1}
                >
                  Devam Et ➜
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===================== STEP 2 ===================== */}
        {step === 2 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-extrabold">
                Deliller
              </CardTitle>
            </CardHeader>

            <CardContent>
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
                className={cx(
                  "rp-dropzone mb-3 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition",
                  dragOver
                    ? "border-emerald-500 bg-emerald-50/60"
                    : "border-slate-300 bg-transparent"
                )}
              >
                <div className="font-extrabold text-slate-900">
                  Delil yükle (sürükle-bırak, tıkla ya da Ctrl+V)
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  JPG/PNG/WEBP/PDF – max {MAX_FILES} dosya,{" "}
                  {Math.round(MAX_SIZE / (1024 * 1024))}MB
                </div>

                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={(e) => onPickFiles(e.target.files)}
                />
              </div>

              {fileMsg && <Hint>{fileMsg}</Hint>}

              {!!files.length && (
                <div className="rp-filegrid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {files.map((item, idx) => {
                    const isPDF =
                      item.file?.type === "application/pdf" ||
                      (!item.file &&
                        (item.name || "")
                          .toLowerCase()
                          .endsWith(".pdf"));

                    const url = item.url;

                    return (
                      <div
                        key={`${item.name}-${idx}`}
                        className="rp-filecard overflow-hidden rounded-xl border bg-white"
                      >
                        <div className="rp-filepreview relative flex h-36 items-center justify-center bg-slate-50">
                          {isPDF ? (
                            <div className="text-3xl">📄</div>
                          ) : url ? (
                            <img
                              src={url}
                              alt=""
                              className={cx(
                                "h-full w-full object-cover transition",
                                item.blur && "blur-md"
                              )}
                            />
                          ) : (
                            <div className="text-xs text-slate-400">
                              Önizleme yok
                            </div>
                          )}

                          <div className="rp-fileactions absolute right-2 top-2 flex gap-1">
                            <Button
                              variant="secondary"
                              size="icon"
                              onClick={() => move(idx, -1)}
                              title="Yukarı taşı"
                            >
                              ↑
                            </Button>
                            <Button
                              variant="secondary"
                              size="icon"
                              onClick={() => move(idx, +1)}
                              title="Aşağı taşı"
                            >
                              ↓
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => toggleBlur(idx)}
                              title="Blur (sadece önizleme)"
                            >
                              Blur
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => removeFile(idx)}
                              title="Kaldır"
                            >
                              Sil
                            </Button>
                          </div>
                        </div>

                        <div className="p-3">
                          <div className="mb-2 text-xs text-slate-500">
                            {item.file?.name || item.name || "Delil"}{" "}
                            {item.file?.size
                              ? `• ${(item.file.size / 1024 / 1024).toFixed(
                                  2
                                )}MB`
                              : ""}
                          </div>

                          <Textarea
                            value={item.note}
                            onChange={(e) =>
                              setNote(idx, e.target.value)
                            }
                            placeholder="Kısa not (örn. 'Kapora IBAN ekran görüntüsü')"
                            className="min-h-[70px]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="secondary"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                >
                  ⟵ Geri
                </Button>

                <Button
                  onClick={() => setStep(3)}
                  disabled={submitting}
                >
                  Devam Et ➜
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===================== STEP 3 ===================== */}
        {step === 3 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-extrabold">
                Önizleme & Gönder
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_1fr]">
                {/* Summary */}
                <Card className="border-dashed bg-indigo-50/30">
                  <CardContent className="p-4 text-sm text-slate-700">
                    <div className="mb-2 font-black text-slate-900">
                      Özet
                    </div>

                    <div className="leading-6">
                      <b>İşletme:</b> {form.name || "-"} <br />
                      <b>İşletme Telefonu:</b> {form.phone || "-"} <br />
                      <b>Instagram:</b>{" "}
                      {form.instagramUsername ||
                        form.instagramUrl ||
                        "-"}{" "}
                      <br />
                      <b>Tespitler:</b>{" "}
                      {[
                        signals.ibans.length
                          ? `${signals.ibans.length} IBAN`
                          : null,
                        signals.amounts.length
                          ? `${signals.amounts.length} tutar`
                          : null,
                        signals.dates.length
                          ? `${signals.dates.length} tarih`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "-"}
                      <br />
                      <b>Açıklama:</b>{" "}
                      {form.desc?.slice(0, 240) || "-"}
                      {form.desc?.length > 240 ? "…" : ""}
                      <br />
                      <b>Mağdur:</b>{" "}
                      {form.reporterName || "-"} <br />
                      <b>Mağdur E-posta:</b>{" "}
                      {form.reporterEmail || "-"} <br />
                      <b>Mağdur Telefon:</b>{" "}
                      {form.reporterPhone || "-"}
                    </div>
                  </CardContent>
                </Card>

                {/* Final Check */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="font-black">Son Kontrol</div>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      <li>Bilgiler doğru ve gerçeği yansıtıyor.</li>
                      <li>
                        Delillerde kişisel veriler gerekiyorsa{" "}
                        <b>bulanıklaştırıldı</b>.
                      </li>
                    </ul>

                    {/* Consent */}
                    <label className="mt-2 flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={form.consent}
                        onCheckedChange={(v) =>
                          setField("consent", !!v)
                        }
                      />
                      <span className="text-slate-900">
                        <b>Yasal Sorumluluk Onayı:</b> Bu ihbarda verdiğim
                        bilgilerin gerçeğe uygun olduğunu beyan ederim.
                        Kişisel verilerimin{" "}
                        <a
                          href="/kvkk"
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 font-semibold text-blue-600 hover:underline"
                        >
                          KVKK Aydınlatma Metni
                        </a>{" "}
                        kapsamında işlenmesini kabul ediyorum.
                      </span>
                    </label>

                    {!form.consent && (
                      <Hint tone="warn">Gönderim için onay gerekli.</Hint>
                    )}

                    {/* Progress */}
                    {submitting && (
                      <div className="pt-2">
                        <div className="h-2 w-full rounded-full bg-slate-200">
                          <div
                            className="h-2 rounded-full bg-emerald-500 transition-[width]"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {progress}%
                        </div>
                      </div>
                    )}

                    {error && <Hint tone="err">{error}</Hint>}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="secondary"
                        onClick={() => setStep(2)}
                        disabled={submitting}
                      >
                        ⟵ Delillere Dön
                      </Button>

                      <Button
                        onClick={handleSubmit}
                        disabled={submitting || !canSubmit}
                      >
                        {submitting ? "Gönderiliyor…" : "İhbarı Gönder"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Popup */}
        {showPopup && (
          <div className="rp-popup fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border bg-white p-6 text-center shadow-2xl">
              <h3 className="text-lg font-black text-slate-900">
                İhbarınız İçin Teşekkür Ederiz
              </h3>
              <p className="mt-2 text-sm text-slate-700">
                İhbarınız için gerekli incelemeleri başlatıyoruz. <br />
                <b>“Duyarlı vatandaş, güvenli toplum”</b> ilkemizi
                benimsediğiniz için teşekkür ederiz.
              </p>
              <Button
                className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setShowPopup(false)}
              >
                Kapat
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
