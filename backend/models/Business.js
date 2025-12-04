// backend/models/Business.js — Ultra Pro / LIVE READY
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* ============ helpers ============ */

const clean = (s) => (typeof s === "string" ? s.trim() : "");

/**
 * "Sapanca Kule Bungalov" -> "sapanca-kule-bungalov"
 */
const slugify = (str = "") =>
  clean(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * "ornek.com" -> "https://ornek.com"
 */
const toHttps = (u) => {
  const s = clean(u);
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

/**
 * Instagram kullanıcı adı + link normalize eder.
 */
function normalizeInstagram({ username, url }) {
  let u = clean(username);
  let link = clean(url);

  if (!u && link) {
    const m = link.match(/instagram\.com\/(@?[\w.]+)/i);
    if (m) u = m[1];
  }

  u = u.replace(/^@/, "").toLowerCase();

  if (!link && u) link = `https://instagram.com/${u}`;
  else if (link) link = toHttps(link);

  const instagramUsername = u ? `@${u}` : undefined;
  const handle = u || undefined;

  return {
    instagramUsername,
    instagramUrl: link || undefined,
    handle,
  };
}

/**
 * Telefon numarasını E.164 formatına çeker, olmazsa sadeleştirir.
 * "undefined", "null" gibi çöpleri otomatik olarak atar.
 */
function normalizePhone(raw) {
  const s0 =
    raw === null || raw === undefined ? "" : String(raw).trim();
  if (!s0) return undefined;

  const lower = s0.toLowerCase();
  if (lower === "undefined" || lower === "null" || lower === "nan") {
    return undefined;
  }

  try {
    const p = parsePhoneNumberFromString(s0, "TR");
    if (p?.isValid?.()) return p.number; // E.164: +9053...
  } catch {
    // sessiz yut
  }

  const only = s0.replace(/[^\d+]/g, "");
  return only || undefined;
}

/**
 * String dizisini trim + uniq yapar.
 */
const uniqStrArr = (arr) => [
  ...new Set(
    (arr || [])
      .map((v) => clean(String(v)))
      .filter(Boolean)
  ),
];

/**
 * gallery / images / photos alanından **string URL listesi** üretir.
 */
function extractGalleryStrings(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  const out = [];

  for (const v of arr) {
    if (!v) continue;
    if (typeof v === "string") {
      const s = clean(v);
      if (s) out.push(s);
    } else if (typeof v === "object") {
      const s = clean(
        v.url ||
          v.href ||
          v.path ||
          v.src ||
          v.location
      );
      if (s) out.push(s);
    }
  }

  return uniqStrArr(out);
}

const pruneUndefined = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
};

/* ============ sub-schemas ============ */

const LocationSchema = new mongoose.Schema(
  {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    district: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: false }
);

/* ============ main schema ============ */

const BusinessSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    type: { type: String, default: "Bilinmiyor", trim: true, maxlength: 80 },
    slug: { type: String, trim: true, maxlength: 180 },

    /* Sosyal & iletişim */
    handle: { type: String, trim: true, maxlength: 80 },
    instagramUsername: { type: String, trim: true, maxlength: 80 },
    instagramUrl: { type: String, trim: true, maxlength: 300 },

    phone: { type: String, trim: true, maxlength: 32 },
    phones: { type: [String], default: [] },

    email: { type: String, trim: true, maxlength: 160 },
    website: { type: String, trim: true, maxlength: 300 },
    bookingUrl: { type: String, trim: true, maxlength: 300 },

    /* Adres */
    address: { type: String, trim: true, maxlength: 400 },
    city: { type: String, trim: true, maxlength: 120 },
    district: { type: String, trim: true, maxlength: 120 },
    location: { type: LocationSchema, default: {} },

    /* İçerik */
    description: { type: String, trim: true, default: "", maxlength: 5000 },
    summary: { type: String, trim: true, default: "", maxlength: 800 },
    features: { type: [String], default: [] },

    // R2 key listesi (relative) + public URL listesi (absolute)
    gallery: { type: [String], default: [] },     // legacy / relative
    galleryAbs: { type: [String], default: [] },  // public absolute URL

    licenceNo: { type: String, trim: true, maxlength: 120 },

    /* E-Doğrula iç puanı */
    rating: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 },

    /* Google entegrasyonu */
    googlePlaceId: { type: String, trim: true, maxlength: 120 },
    googleRating: { type: Number, default: 0 },
    googleReviewsCount: { type: Number, default: 0 },
    google: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Excel'deki google_maps_url kolonu için alan
    googleMapsUrl: { type: String, trim: true, maxlength: 600 },

    /* Doğrulama durumu */
    verified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "pending",
    },

    // opsiyonel: kaynağı (excel, panel vs.)
    source: { type: String, trim: true, maxlength: 80 },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strict: true,
    versionKey: false,
  }
);

/* ============ virtual aliases (frontend uyumu) ============ */

BusinessSchema.virtual("desc")
  .get(function () {
    return this.description;
  })
  .set(function (v) {
    this.description = v;
  });

BusinessSchema.virtual("photos")
  .get(function () {
    return this.gallery;
  })
  .set(function (arr) {
    this.gallery = extractGalleryStrings(arr);
  });

BusinessSchema.virtual("images")
  .get(function () {
    return this.gallery;
  })
  .set(function (arr) {
    this.gallery = extractGalleryStrings(arr);
  });

/* ============ normalization ============ */

function applyNormalization(doc, opts = {}) {
  const partial = !!opts.partial;

  // slug
  if (!doc.slug && doc.name) doc.slug = slugify(doc.name);
  if (doc.slug) doc.slug = slugify(doc.slug);

  // instagram (partial update'te sadece input geldiyse dokun)
  const hasIgInput =
    doc.instagramUsername !== undefined ||
    doc.instagramUrl !== undefined ||
    doc.handle !== undefined;

  if (!partial || hasIgInput) {
    const ig = normalizeInstagram({
      username: doc.instagramUsername,
      url: doc.instagramUrl,
    });

    if (hasIgInput || !partial) {
      doc.instagramUsername = ig.instagramUsername;
      doc.instagramUrl = ig.instagramUrl;
      if (!doc.handle && ig.handle) doc.handle = ig.handle;
    }
    if (doc.handle) doc.handle = String(doc.handle).toLowerCase();
  }

  // telefonlar (partial update'te sadece input geldiyse dokun)
  const hasPhoneInput =
    doc.phone !== undefined ||
    doc.phones !== undefined;

  if (!partial || hasPhoneInput) {
    const main = normalizePhone(doc.phone);
    const extraPhones = Array.isArray(doc.phones) ? doc.phones : [];
    const normalizedAll = uniqStrArr(
      [main, ...extraPhones]
        .map((p) => normalizePhone(p))
        .filter(Boolean)
    );

    doc.phone = main || normalizedAll[0] || undefined;
    doc.phones = uniqStrArr([doc.phone, ...normalizedAll]).filter(Boolean);
  }

  // e-posta & linkler
  if (doc.email !== undefined && doc.email) doc.email = clean(doc.email);
  if (doc.website !== undefined && doc.website) doc.website = toHttps(doc.website);
  if (doc.bookingUrl !== undefined && doc.bookingUrl) doc.bookingUrl = toHttps(doc.bookingUrl);

  // özellikler
  if (!partial || doc.features !== undefined) {
    if (Array.isArray(doc.features)) doc.features = uniqStrArr(doc.features);
  }

  // galeri (relative) max 8
  if (!partial || doc.gallery !== undefined) {
    doc.gallery = extractGalleryStrings(doc.gallery).slice(0, 8);
  }
  // galeri absolute (R2) max 16
  if (!partial || doc.galleryAbs !== undefined) {
    doc.galleryAbs = extractGalleryStrings(doc.galleryAbs).slice(0, 16);
  }

  // googleMapsUrl sadece trim
  if (doc.googleMapsUrl !== undefined && doc.googleMapsUrl) {
    doc.googleMapsUrl = clean(doc.googleMapsUrl);
  }

  // location/address sync
  const hasLocInput =
    doc.location !== undefined ||
    doc.address !== undefined ||
    doc.city !== undefined ||
    doc.district !== undefined;

  if (!partial || hasLocInput) {
    if (!doc.location) doc.location = {};

    if (!doc.location.address && doc.address) doc.location.address = doc.address;
    if (!doc.address && doc.location.address) doc.address = doc.location.address;

    if (!doc.location.city && doc.city) doc.location.city = doc.city;
    if (!doc.city && doc.location.city) doc.city = doc.location.city;

    if (!doc.location.district && doc.district)
      doc.location.district = doc.district;
    if (!doc.district && doc.location.district)
      doc.district = doc.location.district;
  }

  // Negatif saçma değerleri clamp'le
  if (doc.rating !== undefined && doc.rating < 0) doc.rating = 0;
  if (doc.reviewsCount !== undefined && doc.reviewsCount < 0) doc.reviewsCount = 0;
  if (doc.googleRating !== undefined && doc.googleRating < 0) doc.googleRating = 0;
  if (doc.googleReviewsCount !== undefined && doc.googleReviewsCount < 0) doc.googleReviewsCount = 0;
}

/* ============ hooks ============ */

BusinessSchema.pre("save", function (next) {
  applyNormalization(this, { partial: false });
  next();
});

BusinessSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const $set = { ...(update.$set || {}) };
  const $setOnInsert = { ...(update.$setOnInsert || {}) };

  if (Object.keys($set).length) {
    applyNormalization($set, { partial: true });
    pruneUndefined($set);
  }

  if (Object.keys($setOnInsert).length) {
    applyNormalization($setOnInsert, { partial: false });
    pruneUndefined($setOnInsert);
  }

  // ConflictingUpdateOperators hatasını engellemek için
  this.setUpdate({
    ...update,
    $set,
    $setOnInsert,
  });
  next();
});

/* ============ statics ============ */

BusinessSchema.statics.fromPayload = function (payload = {}) {
  // 1) Telefonlar (Excel kolonları + google_telefon)
  const phoneCandidates = [
    payload.phone,
    payload.tel,
    payload.telefon,
    payload.telefonNo,
    payload.telefon_numarasi,
    payload.telefonNumarasi,
    payload["telefon numarası"],
    payload.googlePhone,
    payload.google_telefon,
  ];

  const phonesExtra = [
    ...(Array.isArray(payload.phones) ? payload.phones : []),
    ...(Array.isArray(payload.whatsapps) ? payload.whatsapps : []),
  ];

  const allPhones = uniqStrArr([...phoneCandidates, ...phonesExtra]);
  const primaryPhone = allPhones[0];

  // 2) Website (websitesi + google_websitesi vs.)
  const websiteCandidates = [
    payload.website,
    payload.web,
    payload.site,
    payload.url,
    payload.websitesi,
    payload.googleWebsite,
    payload.google_websitesi,
  ];
  const website =
    websiteCandidates.find((x) => clean(x)) || undefined;

  // 3) Adres (google_adres dahil)
  const addressCandidates = [
    payload.address,
    payload.adres,
    payload.fullAddress,
    payload.googleAddress,
    payload.google_adres,
  ];
  const address =
    addressCandidates.find((x) => clean(x)) || undefined;

  // 4) Google Maps URL
  const googleMapsUrl =
    payload.googleMapsUrl ??
    payload.google_maps_url ??
    payload.googleMapUrl ??
    payload.mapsUrl ??
    payload.maps_url ??
    undefined;

  // 5) Galeri
  const galleryRaw =
    payload.gallery ?? payload.images ?? payload.photos ?? [];

  const carrier = {
    name: payload.name,
    type: payload.type,
    slug: payload.slug,
    handle: payload.handle,
    instagramUsername: payload.instagramUsername ?? payload.instagram,
    instagramUrl: payload.instagramUrl,

    phone: primaryPhone,
    phones: allPhones,

    email: payload.email,
    website,
    bookingUrl: payload.bookingUrl,

    address,
    city: payload.city,
    district: payload.district,
    location: payload.location,

    description: payload.description ?? payload.desc,
    summary: payload.summary,
    features: payload.features,

    gallery: extractGalleryStrings(galleryRaw),
    galleryAbs: extractGalleryStrings(
      payload.galleryAbs ??
        payload.galleryAbsUrls ??
        []
    ),

    licenceNo: payload.licenceNo,

    googlePlaceId: payload.googlePlaceId,
    googleRating: payload.googleRating,
    googleReviewsCount: payload.googleReviewsCount,
    google: payload.google,
    googleMapsUrl,

    rating: payload.rating,
    reviewsCount: payload.reviewsCount,
    verified: payload.verified,
    status: payload.status,
    source: payload.source,
  };

  applyNormalization(carrier, { partial: false });
  return carrier;
};

BusinessSchema.statics.upsertByNaturalKeys = async function (payload = {}) {
  const safe = this.fromPayload(payload);
  const keys = [];

  if (safe.slug) keys.push({ slug: safe.slug });
  if (safe.handle) keys.push({ handle: safe.handle });
  if (safe.instagramUsername) keys.push({ instagramUsername: safe.instagramUsername });
  if (safe.phone) keys.push({ phone: safe.phone });

  const query = keys.length > 0 ? { $or: keys } : { name: safe.name };

  return await this.findOneAndUpdate(
    query,
    {
      $set: safe,
      $setOnInsert: { createdAt: new Date() },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
      context: "query",
    }
  );
};

/* ============ indexes ============ */

BusinessSchema.index(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: { slug: { $exists: true, $ne: "" } },
  }
);

BusinessSchema.index(
  { handle: 1 },
  {
    unique: true,
    partialFilterExpression: { handle: { $exists: true, $ne: "" } },
  }
);

BusinessSchema.index(
  { instagramUsername: 1 },
  {
    unique: true,
    partialFilterExpression: { instagramUsername: { $exists: true, $ne: "" } },
  }
);

BusinessSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $exists: true, $ne: "" } },
  }
);

BusinessSchema.index({ status: 1 });
BusinessSchema.index({ instagramUrl: 1 });
BusinessSchema.index({ verified: -1, createdAt: -1 });

BusinessSchema.index(
  {
    name: "text",
    instagramUsername: "text",
    handle: "text",
    phone: "text",
    address: "text",
  },
  {
    weights: {
      name: 5,
      instagramUsername: 4,
      handle: 4,
      phone: 3,
      address: 1,
    },
  }
);

/* ============ output shaping ============ */

BusinessSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default (
  mongoose.models.Business ||
  mongoose.model("Business", BusinessSchema)
);
