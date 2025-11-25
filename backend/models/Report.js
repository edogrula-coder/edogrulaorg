// backend/models/Report.js — PRO / LIVE READY
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const { Schema, Types } = mongoose;

/* ========== Helpers ========== */

const clean = (s) => (typeof s === "string" ? s.trim() : "");

/**
 * URL'yi https'e çevirir; boşsa undefined döner.
 */
const toHttps = (u) => {
  const s = clean(u);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
};

/**
 * Instagram kullanıcı adı + URL normalize
 */
function normalizeInstagram({ username, url }) {
  let u = clean(username);
  let link = clean(url);

  if (!u && link) {
    const m = link.match(/instagram\.com\/(@?[\w.]+)/i);
    if (m && m[1]) u = m[1];
  }

  if (u) u = u.replace(/^@/, "").toLowerCase();

  if (!link && u) link = `https://instagram.com/${u}`;
  else if (link) link = toHttps(link);

  const instagramUsername = u ? `@${u}` : undefined;
  const instagramUrl = link || undefined;

  return { instagramUsername, instagramUrl };
}

/**
 * Telefon normalize
 */
function normalizePhone(raw) {
  const s = clean(raw);
  if (!s) return undefined;

  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p && typeof p.isValid === "function" && p.isValid()) {
      return p.number;
    }
  } catch {
    // fallback aşağıda
  }

  const only = s.replace(/[^\d+]/g, "");
  return only || undefined;
}

/**
 * consent flag'ini güvenli parse et
 */
function parseConsent(v) {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "on", "yes", "evet"].includes(s)) return true;
  }
  return false;
}

/**
 * Evidence alanlarını normalize et
 */
function normalizeEvidence(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return [
    ...new Set(
      arr
        .map((s) => clean(String(s || "")))
        .filter(Boolean)
    ),
  ];
}

const pruneUndefined = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
};

/* ========== Schema ========== */

const ReportSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 240 },

    instagramUsername: { type: String, trim: true, maxlength: 80 },
    instagramUrl: { type: String, trim: true, maxlength: 300 },

    phone: { type: String, trim: true, maxlength: 32 },

    desc: { type: String, trim: true, maxlength: 8000 },

    reporter: { type: Types.ObjectId, ref: "User" },
    reporterEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
    reporterName: { type: String, trim: true, maxlength: 160 },
    reporterPhone: { type: String, trim: true, maxlength: 32 },

    consent: { type: Boolean, required: true, default: false },
    policyVersion: { type: String, default: "v1" },
    createdByIp: { type: String },
    userAgent: { type: String },

    evidenceFiles: {
      type: [String],
      default: [],
      set: normalizeEvidence,
    },

    status: {
      type: String,
      enum: ["open", "reviewing", "closed"],
      default: "open",
      index: true,
    },

    supportCount: { type: Number, default: 0 },
    supporters: { type: [String], default: [] },
    lastSupportedAt: { type: Date },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    strict: true,
    versionKey: false,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true },
  }
);

/* ========== Normalization Hooks (partial-aware) ========== */

function applyNormalization(target, opts = {}) {
  if (!target || typeof target !== "object") return;
  const partial = !!opts.partial;

  // Instagram: sadece input geldiyse normalize et
  const hasIgInput =
    target.instagramUsername !== undefined ||
    target.instagramUrl !== undefined;

  if (!partial || hasIgInput) {
    const ig = normalizeInstagram({
      username: target.instagramUsername,
      url: target.instagramUrl,
    });
    target.instagramUsername = ig.instagramUsername;
    target.instagramUrl = ig.instagramUrl;
  }

  // Telefonlar: sadece ilgili input geldiyse normalize et
  if (!partial || ("phone" in target)) {
    if ("phone" in target) target.phone = normalizePhone(target.phone);
  }
  if (!partial || ("reporterPhone" in target)) {
    if ("reporterPhone" in target)
      target.reporterPhone = normalizePhone(target.reporterPhone);
  }

  // Email: input geldiyse normalize et
  if (!partial || target.reporterEmail !== undefined) {
    if (target.reporterEmail) {
      target.reporterEmail = clean(target.reporterEmail).toLowerCase();
    }
  }

  // Evidence: input geldiyse normalize et
  if (!partial || target.evidenceFiles !== undefined) {
    if (Array.isArray(target.evidenceFiles) || typeof target.evidenceFiles === "string") {
      target.evidenceFiles = normalizeEvidence(target.evidenceFiles);
    }
  }

  // Negatif sayıları sadece input geldiyse clamp'le
  if (target.supportCount !== undefined && target.supportCount < 0) {
    target.supportCount = 0;
  }
}

ReportSchema.pre("save", function (next) {
  applyNormalization(this, { partial: false });
  next();
});

ReportSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const $set = { ...(update.$set || {}) };
  const $setOnInsert = { ...(update.$setOnInsert || {}) };

  if (Object.keys($set).length) {
    applyNormalization($set, { partial: true });
    pruneUndefined($set); // <— alan silme/ezme bug’ını bitirir
  }
  if (Object.keys($setOnInsert).length) {
    applyNormalization($setOnInsert, { partial: false });
    pruneUndefined($setOnInsert);
  }

  this.setUpdate({ ...update, $set, $setOnInsert });
  next();
});

/* ========== Statics ========== */

ReportSchema.statics.fromPayload = function (payload = {}) {
  const carrier = {
    name: payload.name,

    instagramUsername: payload.instagramUsername ?? payload.instagram,
    instagramUrl: payload.instagramUrl,

    phone: payload.phone,
    desc: payload.desc ?? payload.description,

    reporter: payload.reporterId || payload.reporter || undefined,
    reporterEmail: payload.reporterEmail ?? payload.email,
    reporterName: payload.reporterName,
    reporterPhone: payload.reporterPhone,

    consent: parseConsent(payload.consent),
    policyVersion: payload.policyVersion || "v1",
    createdByIp: payload.createdByIp,
    userAgent: payload.userAgent,

    evidenceFiles: normalizeEvidence(
      payload.evidenceFiles || payload.evidence || payload.files
    ),

    status:
      ["open", "reviewing", "closed"].includes(payload.status)
        ? payload.status
        : undefined,
  };

  applyNormalization(carrier, { partial: false });
  return carrier;
};

/**
 * Kullanıcı desteği ekler (atomic + idempotent).
 */
ReportSchema.statics.addSupport = async function (reportId, fingerprint) {
  if (!fingerprint) {
    return { updated: false, supportCount: 0 };
  }

  if (!Types.ObjectId.isValid(reportId)) {
    return { updated: false, supportCount: 0 };
  }

  const now = new Date();

  const updated = await this.findOneAndUpdate(
    { _id: reportId, supporters: { $ne: fingerprint } },
    {
      $addToSet: { supporters: fingerprint },
      $inc: { supportCount: 1 },
      $set: { lastSupportedAt: now },
    },
    { new: true, runValidators: true }
  ).select("supportCount");

  if (updated) {
    return { updated: true, supportCount: updated.supportCount };
  }

  const cur = await this.findById(reportId).select("supportCount");
  return { updated: false, supportCount: cur?.supportCount ?? 0 };
};

/* ========== Indexes ========== */

ReportSchema.index({ reporter: 1, createdAt: -1 });
ReportSchema.index({ reporterEmail: 1 }, { sparse: true });
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ instagramUsername: 1 });
ReportSchema.index({ phone: 1 });
ReportSchema.index({ createdAt: -1 });
ReportSchema.index({ createdByIp: 1 });
ReportSchema.index({ supportCount: -1, lastSupportedAt: -1 });

ReportSchema.index(
  { name: "text", desc: "text", instagramUsername: "text" },
  { weights: { name: 5, desc: 3, instagramUsername: 2 } }
);

/* ========== Output shaping ========== */

ReportSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.Report || mongoose.model("Report", ReportSchema);
