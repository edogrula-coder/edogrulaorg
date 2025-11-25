// backend/models/VerificationRequest.js — PRO / LIVE READY
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* ----------------------- constants ----------------------- */
const MAX_DOCS = 5;

/* ----------------------- helpers ----------------------- */
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const normEmail = (e) => clean(e).toLowerCase();

const toHttps = (u) => {
  const s = clean(u);
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
};

function normalizeInstagram({ username, url, legacy }) {
  let u = clean(username);
  let link = clean(url || legacy);

  if (!u && link) {
    const m = link.match(/instagram\.com\/(@?[\w.]+)/i);
    if (m) u = m[1];
  }

  u = clean(u).replace(/^@+/, "").toLowerCase();
  if (!link && u) link = `https://instagram.com/${u}`;
  if (link) link = toHttps(link);

  return { username: u || undefined, url: link || undefined };
}

function normalizePhone(raw) {
  const s = clean(raw);
  if (!s) return undefined;
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid?.()) return p.number; // E.164 (+90…)
  } catch {}
  const only = s.replace(/[^\d+]/g, "");
  return only || undefined;
}

function makePublicUrl(rel) {
  if (!rel) return undefined;
  if (/^https?:\/\//i.test(rel)) return rel;

  const base = (process.env.FILE_BASE_URL || "").replace(/\/+$/, "");
  const cleanRel = String(rel)
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");

  return base ? `${base}/${cleanRel}` : `/${cleanRel}`;
}

function capAndNormalizeDocs(docs = []) {
  const arr = (docs || [])
    .map((d) => {
      if (!d) return null;

      if (typeof d === "string") {
        const path = String(d).replace(/^\/+/, "").replace(/\/{2,}/g, "/");
        return { path, url: makePublicUrl(path) };
      }

      const doc = { ...d };

      if (!doc.mimetype && doc.mime) doc.mimetype = doc.mime;
      if (!doc.originalname && doc.name) doc.originalname = doc.name;

      if (doc.path) {
        doc.path = String(doc.path).replace(/^\/+/, "").replace(/\/{2,}/g, "/");
      }

      if (!doc.url && doc.path) doc.url = makePublicUrl(doc.path);
      if (doc.url) doc.url = toHttps(doc.url) || doc.url;

      doc.blur = Boolean(doc.blur);
      if (typeof doc.note === "string") doc.note = doc.note.trim();
      if (doc.size != null) doc.size = Number(doc.size) || 0;

      return doc;
    })
    .filter(Boolean);

  // uniq: path/url bazlı tekrarı azalt
  const seen = new Set();
  const uniq = [];
  for (const d of arr) {
    const key = d.path || d.url || JSON.stringify(d);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(d);
  }

  return uniq.slice(0, MAX_DOCS);
}

function normCity(s) {
  const v = clean(s).slice(0, 64);
  return v || undefined;
}
function normDistrict(s) {
  const v = clean(s).slice(0, 64);
  return v || undefined;
}

const pruneUndefined = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
};

/* ----------------------- file sub-schema ----------------------- */
const FileSchema = new mongoose.Schema(
  {
    path: { type: String, trim: true },
    url: { type: String, trim: true },

    originalname: { type: String, trim: true },
    mimetype: { type: String, trim: true },
    size: Number,

    blur: { type: Boolean, default: false },
    note: { type: String, trim: true },
  },
  { _id: false }
);

/* ----------------------- main schema ----------------------- */
const VerificationRequestSchema = new mongoose.Schema(
  {
    /* ----- yeni alanlar ----- */
    name: { type: String, trim: true },
    tradeTitle: { type: String, trim: true },
    type: { type: String, trim: true },

    instagramUsername: { type: String, trim: true },
    instagramUrl: { type: String, trim: true },

    phone: { type: String, trim: true },
    landline: { type: String, trim: true },

    city: { type: String, trim: true, maxlength: 64, index: true },
    district: { type: String, trim: true, maxlength: 64, index: true },

    address: { type: String, trim: true, maxlength: 256 },

    email: { type: String, trim: true, lowercase: true, index: true },
    website: { type: String, trim: true },

    note: { type: String, trim: true, default: "" },

    documents: { type: [FileSchema], default: [] },

    status: {
      type: String,
      enum: ["pending", "in_review", "approved", "rejected", "archived", "spam"],
      default: "pending",
      index: true,
    },
    rejectReason: { type: String, trim: true, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    reviewedAt: { type: Date },

    business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", index: true },

    /* ----- legacy alanlar ----- */
    businessName: { type: String, trim: true },
    legalName: { type: String, trim: true },
    phoneMobile: { type: String, trim: true },
    phoneFixed: { type: String, trim: true },
    instagram: { type: String, trim: true },
    docs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    images: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strict: true,
    versionKey: false,
    collection: "applyrequests",
  }
);

/* ----------------------- virtuals ----------------------- */
VerificationRequestSchema.virtual("requestId").get(function () {
  return this._id?.toString();
});

VerificationRequestSchema.virtual("nameResolved").get(function () {
  return this.name || this.businessName || "";
});
VerificationRequestSchema.virtual("tradeTitleResolved").get(function () {
  return this.tradeTitle || this.legalName || "";
});
VerificationRequestSchema.virtual("phoneResolved").get(function () {
  return this.phone || this.phoneMobile || "";
});
VerificationRequestSchema.virtual("landlineResolved").get(function () {
  return this.landline || this.phoneFixed || "";
});
VerificationRequestSchema.virtual("instagramUrlResolved").get(function () {
  return this.instagramUrl || this.instagram || "";
});
VerificationRequestSchema.virtual("cityResolved").get(function () {
  return this.city || "";
});
VerificationRequestSchema.virtual("districtResolved").get(function () {
  return this.district || "";
});

/* ----------------------- normalization ----------------------- */
function applyNormalization(carrier, opts = {}) {
  if (!carrier) return;
  const partial = !!opts.partial;

  // IG
  const hasIgInput =
    carrier.instagramUsername !== undefined ||
    carrier.instagramUrl !== undefined ||
    carrier.instagram !== undefined;

  if (!partial || hasIgInput) {
    const { username, url } = normalizeInstagram({
      username: carrier.instagramUsername,
      url: carrier.instagramUrl,
      legacy: carrier.instagram,
    });
    carrier.instagramUsername = username;
    carrier.instagramUrl = url;
  }

  // Telefonlar
  const hasPhoneInput =
    carrier.phone !== undefined ||
    carrier.landline !== undefined ||
    carrier.phoneMobile !== undefined ||
    carrier.phoneFixed !== undefined;

  if (!partial || hasPhoneInput) {
    carrier.phone = normalizePhone(carrier.phone || carrier.phoneMobile);
    carrier.landline = normalizePhone(carrier.landline || carrier.phoneFixed);
  }

  // Email / Website
  if (!partial || carrier.email !== undefined) {
    if (carrier.email) carrier.email = normEmail(carrier.email);
  }
  if (!partial || carrier.website !== undefined) {
    if (carrier.website) carrier.website = toHttps(carrier.website);
  }

  // İl/İlçe
  const hasLocInput =
    carrier.city !== undefined ||
    carrier.district !== undefined;

  if (!partial || hasLocInput) {
    carrier.city = normCity(carrier.city);
    carrier.district = normDistrict(carrier.district);
  }

  // Address fallback (partial'da sadece loc input geldiyse)
  if ((!partial || hasLocInput) && !carrier.address) {
    const parts = [carrier.district, carrier.city].filter(Boolean);
    if (parts.length) carrier.address = parts.join(", ");
  }

  // Belgeler: partial update’te sadece gelenleri normalize et (DB’dekileri ezme)
  const hasDocsInput =
    carrier.documents !== undefined ||
    carrier.docs !== undefined ||
    carrier.images !== undefined;

  if (!partial || hasDocsInput) {
    const docsCombined = []
      .concat(carrier.documents !== undefined ? carrier.documents : [])
      .concat(carrier.docs !== undefined ? carrier.docs : [])
      .concat(carrier.images !== undefined ? carrier.images : []);

    carrier.documents = capAndNormalizeDocs(docsCombined);
  }

  pruneUndefined(carrier);
}

VerificationRequestSchema.pre("save", function (next) {
  applyNormalization(this, { partial: false });
  next();
});

VerificationRequestSchema.pre("findOneAndUpdate", function (next) {
  const upd = this.getUpdate() || {};
  const $set = { ...(upd.$set || {}) };
  const $setOnInsert = { ...(upd.$setOnInsert || {}) };

  if (Object.keys($set).length) applyNormalization($set, { partial: true });
  if (Object.keys($setOnInsert).length) applyNormalization($setOnInsert, { partial: false });

  pruneUndefined($set);
  pruneUndefined($setOnInsert);

  this.setUpdate({ ...upd, $set, $setOnInsert });
  next();
});

/* ----------------------- indexes ----------------------- */
VerificationRequestSchema.index({ createdAt: -1 });
VerificationRequestSchema.index({ email: 1, status: 1, createdAt: -1 });
VerificationRequestSchema.index({ instagramUsername: 1 });
VerificationRequestSchema.index({ phone: 1 });
VerificationRequestSchema.index({ city: 1, district: 1, createdAt: -1 });

VerificationRequestSchema.index(
  {
    name: "text",
    businessName: "text",
    address: "text",
    instagramUsername: "text",
    city: "text",
    district: "text",
  },
  {
    weights: {
      name: 5,
      businessName: 5,
      instagramUsername: 3,
      city: 2,
      district: 2,
      address: 1,
    },
  }
);

/* ----------------------- clean json ----------------------- */
VerificationRequestSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.name = ret.name || ret.businessName || "";
    ret.tradeTitle = ret.tradeTitle || ret.legalName || "";
    ret.phone = ret.phone || ret.phoneMobile || "";
    ret.landline = ret.landline || ret.phoneFixed || "";
    ret.instagramUrl = ret.instagramUrl || ret.instagram || "";

    if (!ret.instagramUsername && ret.instagramUrl) {
      const m = /instagram\.com\/(@?[\w.]+)/i.exec(ret.instagramUrl);
      if (m) ret.instagramUsername = m[1].replace(/^@/, "").toLowerCase();
    }

    if (!ret.documents?.length) {
      const merged = []
        .concat(ret.documents || [])
        .concat(ret.docs || [])
        .concat(ret.images || []);
      ret.documents = capAndNormalizeDocs(merged);
    }

    ret.city = ret.city || "";
    ret.district = ret.district || "";

    if (!ret.address) {
      const parts = [ret.district || "", ret.city || ""].filter(Boolean);
      ret.address = parts.join(", ");
    }

    delete ret.docs;
    delete ret.images;
    delete ret.phoneMobile;
    delete ret.phoneFixed;
    delete ret.legalName;
    delete ret.businessName;
    delete ret.instagram;
    return ret;
  },
});

export default mongoose.models.VerificationRequest ||
  mongoose.model("VerificationRequest", VerificationRequestSchema, "applyrequests");
