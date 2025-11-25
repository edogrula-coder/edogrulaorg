// backend/models/Page.js — PRO / LIVE READY
import mongoose from "mongoose";

const normStr = (v) => (v == null ? v : String(v).trim());
const normSlug = (v) => {
  const s = normStr(v);
  return s ? s.toLowerCase() : s;
};

const PageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, set: normStr },

    // kvkk, gizlilik, hakkimizda
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      set: normSlug,
      index: true, // unique zaten index açar ama query hızına yardımcı
    },

    content: { type: String, default: "" }, // HTML/Markdown

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
    coverImage: { type: String, default: "", set: normStr },

    // (opsiyonel, additive) — mevcut api’yi bozmaz
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

// Yaygın listeleme / sıralama hızlansın
PageSchema.index({ status: 1, order: 1, createdAt: -1 });

/** Yayın / güncelleme tarihlerini otomatik tut */
PageSchema.pre("save", function (next) {
  if (this.slug) this.slug = normSlug(this.slug);
  if (this.title) this.title = normStr(this.title);

  if (this.status === "published" && !this.datePublished) {
    this.datePublished = this.createdAt || new Date();
  }
  this.dateModified = new Date();

  next();
});

export default mongoose.models.Page ||
  mongoose.model("Page", PageSchema);
