// backend/models/Featured.js — PRO / LIVE READY
import mongoose from "mongoose";
const { Schema } = mongoose;

const normStr = (v) => (v == null ? v : String(v).trim());
const normKey = (v) => {
  const s = normStr(v);
  return s ? s.toLowerCase() : s;
};

const FeaturedSchema = new Schema(
  {
    place:    { type: String, trim: true, index: true, set: normStr }, // örn: "Sapanca"
    type:     { type: String, trim: true, index: true, set: normStr }, // örn: "bungalov"

    business: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },

    order:    { type: Number, default: 0 },
    active:   { type: Boolean, default: true, index: true },

    startAt:  { type: Date, default: null },
    endAt:    { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Aynı kombinasyon tekil olsun (aktif yapın korunuyor)
FeaturedSchema.index({ place: 1, type: 1, business: 1 }, { unique: true });

// Sık kullanılan listelemeler için yardımcı index
FeaturedSchema.index({ active: 1, order: 1, createdAt: -1 });

/**
 * Şu an gerçekten aktif mi?
 * - active=false ise zaten değil
 * - startAt/endAt varsa zaman penceresine bakar
 */
FeaturedSchema.virtual("isActiveNow").get(function () {
  if (!this.active) return false;

  const now = new Date();
  if (this.startAt && now < this.startAt) return false;
  if (this.endAt && now > this.endAt) return false;

  return true;
});

/* -------- hooks -------- */
FeaturedSchema.pre("save", function (next) {
  // place/type normalize (case farkı yüzünden duplicate olmasın)
  if (this.place) this.place = normKey(this.place);
  if (this.type) this.type = normKey(this.type);

  // Tarihleri düzelt: endAt < startAt olmasın
  if (this.startAt && this.endAt && this.endAt < this.startAt) {
    const tmp = this.startAt;
    this.startAt = this.endAt;
    this.endAt = tmp;
  }

  next();
});

export default mongoose.models.Featured ||
  mongoose.model("Featured", FeaturedSchema);
