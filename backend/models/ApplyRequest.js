// backend/models/ApplyRequest.js — PRO / LIVE READY
import mongoose from "mongoose";

/* -------- helpers -------- */
const normalizeUploadPath = (p) => {
  if (!p) return p;
  let s = String(p).trim();
  s = s.replace(/\\+/g, "/");      // Windows ters slash -> forward slash
  s = s.replace(/\/{2,}/g, "/");  // çoklu slash sadeleştir
  return s;
};

const normalizeUrl = (u) => {
  if (!u) return u;
  let s = String(u).trim();
  if (!s) return s;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  return s;
};

const normalizePathArray = (v) => {
  if (Array.isArray(v)) return v.map(normalizeUploadPath).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [normalizeUploadPath(v)];
  return [];
};

/* -------- schema -------- */
const ApplyRequestSchema = new mongoose.Schema(
  {
    // Başvuru formundaki metin alanları
    businessName: { type: String, required: true, trim: true, minlength: 2 },
    legalName: { type: String, trim: true, alias: "tradeTitle" },
    type: { type: String, trim: true },
    address: { type: String, trim: true },

    phoneMobile: { type: String, trim: true, alias: "phone" },
    phoneFixed: { type: String, trim: true, alias: "landline" },

    instagram: { type: String, trim: true, alias: "instagramUsername" },
    website: {
      type: String,
      trim: true,
      set: normalizeUrl,
    },

    // Yüklenen dosyaların relative path’leri (/uploads/... şeklinde)
    docs: {
      type: [String],
      default: [],
      set: normalizePathArray,
    },
    images: {
      type: [String],
      default: [],
      set: normalizePathArray,
    },

    // Otomatik sayımlar (pre-save'de set edilir)
    docCount: { type: Number, default: 0 },
    imageCount: { type: Number, default: 0 },

    // Klasör yolu (örn: /uploads/apply/abc123)
    folder: { type: String, trim: true, set: normalizeUploadPath },

    // Süreç bilgileri
    status: {
      type: String,
      // geriye uyumlu şekilde genişlettim (eski değerler aynen geçerli)
      enum: ["pending", "in_review", "approved", "rejected", "archived", "spam"],
      default: "pending",
      index: true,
    },
    termsAccepted: { type: Boolean, default: false },

    // Admin değerlendirme alanları (opsiyonel)
    reviewerNote: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* -------- indexes -------- */
ApplyRequestSchema.index({ createdAt: -1, status: 1 });

/* -------- virtuals -------- */
// İlk görselin/belgenin ait olduğu klasörden 'folderId' üret
ApplyRequestSchema.virtual("folderId").get(function () {
  const src = (this.images?.[0] || this.docs?.[0] || "") + "";
  const m = src.match(/^\/uploads\/apply\/([^/]+)/i);
  return m ? m[1] : undefined;
});

// Controller’larda geçen app.place -> address ile eşleşsin (geri uyumluluk)
ApplyRequestSchema.virtual("place")
  .get(function () {
    return this.address;
  })
  .set(function (v) {
    this.address = v;
  });

/* -------- hooks -------- */
ApplyRequestSchema.pre("save", function (next) {
  // normalize (olur da dışarıdan garip format gelirse)
  if (this.images) this.images = normalizePathArray(this.images);
  if (this.docs) this.docs = normalizePathArray(this.docs);

  // sayımlar
  this.imageCount = Array.isArray(this.images) ? this.images.length : 0;
  this.docCount = Array.isArray(this.docs) ? this.docs.length : 0;

  // folder alanı boşsa, path'ten türet
  if (!this.folder) {
    const id = this.folderId;
    if (id) this.folder = `/uploads/apply/${id}`;
  } else {
    this.folder = normalizeUploadPath(this.folder);
  }

  next();
});

/* -------- export (idempotent) -------- */
export default mongoose.models.ApplyRequest ||
  mongoose.model("ApplyRequest", ApplyRequestSchema);
