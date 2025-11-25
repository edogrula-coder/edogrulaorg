// backend/models/Article.js — PRO / LIVE READY
import mongoose from "mongoose";

const normStr = (v) => (v == null ? v : String(v).trim());
const normSlug = (v) => {
  const s = normStr(v);
  return s ? s.toLowerCase() : s;
};
const normTagArr = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((t) => normStr(t))
    .filter(Boolean)
    .map((t) => t.toLowerCase());
};

const ArticleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      set: normSlug,
      index: true, // unique zaten index açıyor ama query hızına katkı sağlıyor (tekrar etmez)
    },

    excerpt: { type: String, default: "", set: normStr },  // kart altındaki özet
    content: { type: String, default: "" },               // HTML veya Markdown
    coverImage: { type: String, default: "", set: normStr }, // kart görseli (opsiyonel)

    place: { type: String, default: "", trim: true, set: normStr }, // Sapanca vb. filtre

    tags: {
      type: [String],
      default: [],
      set: normTagArr,
    },

    pinned: { type: Boolean, default: false }, // “Planlayın” bölümünde görünür
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
      index: true,
    },

    order: { type: Number, default: 0 },

    // SEO
    seoTitle: { type: String, default: "", set: normStr },
    seoDescription: { type: String, default: "", set: normStr },

    datePublished: { type: Date },
    dateModified: { type: Date },
  },
  {
    timestamps: true, // createdAt / updatedAt
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Filtreyi hızlandırır
ArticleSchema.index({ place: 1, pinned: 1, status: 1, order: 1, createdAt: -1 });

/** Yayın / güncelleme tarihlerini otomatik tut */
ArticleSchema.pre("save", function (next) {
  // slug/title güvenliliği
  if (this.slug) this.slug = normSlug(this.slug);
  if (this.title) this.title = normStr(this.title);

  // tags normalize
  if (this.tags) this.tags = normTagArr(this.tags);

  // status yayınlandıysa ilk yayın tarihini set et
  if (this.status === "published" && !this.datePublished) {
    this.datePublished = this.createdAt || new Date();
  }

  // her kayıtta modified güncelle
  this.dateModified = new Date();

  next();
});

export default mongoose.models.Article ||
  mongoose.model("Article", ArticleSchema);
