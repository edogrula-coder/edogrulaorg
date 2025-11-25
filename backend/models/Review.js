// backend/models/Review.js — PRO / LIVE READY
import mongoose from "mongoose";

/* ========== Helpers ========== */
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const pruneUndefined = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
};

export class AlreadyReviewedError extends Error {
  constructor(message = "ALREADY_REVIEWED") {
    super(message);
    this.name = "AlreadyReviewedError";
    this.code = "ALREADY_REVIEWED";
    this.status = 409;
  }
}

/* ========== Schema ========== */
const ReviewSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

    comment: {
      type: String,
      maxlength: 400,
      trim: true,
    },

    author: {
      type: String,
      maxlength: 80,
      trim: true, // “Misafir” varsayılanı hook’ta atanıyor
    },

    // Moderasyon / görünürlük
    status: {
      type: String,
      enum: ["visible", "pending", "hidden"],
      default: "visible",
      index: true,
    },

    // Kaynak bilgisi
    source: {
      type: String,
      default: "site",
      trim: true,
    },

    // Tekrarlı değerlendirmeyi engellemek için parmak izi
    fp: {
      type: String,
      trim: true,
      default: undefined,
    },

    // IP karması (opsiyonel, gizli)
    ipHash: {
      type: String,
      default: undefined,
      select: false,
    },

    // Bağlamsal meta
    ua: { type: String, default: undefined, trim: true },
    locale: { type: String, default: undefined, trim: true },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true },
    strict: true,
    versionKey: false,
  }
);

/* ========== Normalization Hooks ========== */
ReviewSchema.pre("validate", function (next) {
  // rating’i güvenle sınırla
  if (this.rating != null) {
    const r = Number(this.rating);
    this.rating = Math.min(5, Math.max(1, Number.isFinite(r) ? r : 1));
  }
  next();
});

ReviewSchema.pre("save", function (next) {
  this.comment = clean(this.comment);
  this.author = clean(this.author) || "Misafir";
  this.ua = clean(this.ua);
  this.locale = clean(this.locale);
  if (this.fp) this.fp = String(this.fp).trim();
  if (this.source) this.source = clean(this.source).toLowerCase();
  next();
});

// Partial update normalize (alan ezmesin)
ReviewSchema.pre("findOneAndUpdate", function (next) {
  const upd = this.getUpdate() || {};
  const $set = { ...(upd.$set || {}) };
  const $setOnInsert = { ...(upd.$setOnInsert || {}) };

  if ("rating" in $set) {
    const r = Number($set.rating);
    $set.rating = Math.min(5, Math.max(1, Number.isFinite(r) ? r : 1));
  }
  if ("comment" in $set) $set.comment = clean($set.comment);
  if ("author" in $set) $set.author = clean($set.author) || "Misafir";
  if ("ua" in $set) $set.ua = clean($set.ua);
  if ("locale" in $set) $set.locale = clean($set.locale);
  if ("fp" in $set && $set.fp) $set.fp = String($set.fp).trim();
  if ("source" in $set && $set.source)
    $set.source = clean($set.source).toLowerCase();

  pruneUndefined($set);
  pruneUndefined($setOnInsert);

  this.setUpdate({ ...upd, $set, $setOnInsert });
  next();
});

/* ========== Indexes ========== */
ReviewSchema.index({ business: 1, createdAt: -1 });

// visible/pending listeleri hızlandırır
ReviewSchema.index({ business: 1, status: 1, createdAt: -1 });

// fp verilmişse aynı kullanıcı aynı işletmeye ikinci kez yorum atamasın
ReviewSchema.index(
  { business: 1, fp: 1 },
  {
    unique: true,
    partialFilterExpression: { fp: { $exists: true, $ne: "" } },
  }
);

// Metin araması
ReviewSchema.index({ comment: "text", author: "text" });

/* ========== Statics ========== */
/**
 * Özet metrik: { count, avg }
 * Sadece görünür yorumlar üzerinden hesaplar.
 */
ReviewSchema.statics.getSummary = async function (businessId) {
  // Live’da cast hatası vermesin
  if (
    !businessId ||
    (typeof businessId === "string" &&
      !mongoose.Types.ObjectId.isValid(businessId))
  ) {
    return { count: 0, avg: null };
  }

  const _id =
    typeof businessId === "string"
      ? new mongoose.Types.ObjectId(businessId)
      : businessId;

  const agg = await this.aggregate([
    { $match: { business: _id, status: "visible" } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        avg: { $avg: "$rating" },
      },
    },
    { $project: { _id: 0, count: 1, avg: { $round: ["$avg", 2] } } },
  ]);

  return agg[0] || { count: 0, avg: null };
};

/**
 * Güvenli ekleme: fp varsa duplicate’i engeller.
 */
ReviewSchema.statics.safeCreate = async function (payload = {}) {
  try {
    const doc = await this.create({
      business: payload.business,
      rating: payload.rating,
      comment: payload.comment,
      author: payload.author,
      status: payload.status || "visible",
      source: payload.source || "site",
      fp: payload.fp || undefined,
      ipHash: payload.ipHash || undefined,
      ua: payload.ua,
      locale: payload.locale,
    });
    return doc;
  } catch (err) {
    if (err?.code === 11000) throw new AlreadyReviewedError();
    throw err;
  }
};

/* ========== Output shaping ========== */
ReviewSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.fp;
    delete ret.ipHash;
    return ret;
  },
});

export default mongoose.models.Review || mongoose.model("Review", ReviewSchema);
