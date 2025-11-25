// backend/models/Blacklist.js — PRO / LIVE READY
import mongoose from "mongoose";

/* -------- helpers -------- */
const normStr = (v) => (v == null ? v : String(v).trim());
const normHandle = (h) => {
  const s = normStr(h);
  if (!s) return s;
  return s.replace(/^@+/, "").toLowerCase();
};
const normUrl = (u) => {
  const s = normStr(u);
  if (!s) return s;
  if (!/^https?:\/\//i.test(s)) return "https://" + s.replace(/^\/+/, "");
  return s;
};
const digitsOnly = (p) => {
  const s = normStr(p);
  if (!s) return "";
  return s.replace(/\D/g, "");
};

/* -------- sub schema -------- */
const FingerprintSchema = new mongoose.Schema(
  {
    // örn: "phone", "instagram", "custom"
    type: { type: String, trim: true, set: (v) => normStr(v)?.toLowerCase() },
    value: { type: String, trim: true, set: normStr },
    note: { type: String, trim: true, set: normStr },
  },
  { _id: false, timestamps: { createdAt: "createdAt", updatedAt: false } }
);

/* -------- main schema -------- */
const BlacklistSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, index: true, set: normStr },

    // DB’de @’sız tutulması garanti
    instagramUsername: {
      type: String,
      trim: true,
      index: true,
      set: normHandle,
    },

    instagramUrl: { type: String, trim: true, set: normUrl },

    // phone aynen saklanır (aktif UI kırılmasın)
    phone: { type: String, trim: true, index: true, set: normStr },

    // arama hızlandırmak için ek alan (additive)
    phoneDigits: { type: String, trim: true, index: true },

    desc: { type: String, trim: true, set: normStr },

    fingerprints: {
      type: [FingerprintSchema],
      default: [],
      set: (arr) =>
        Array.isArray(arr)
          ? arr
              .map((f) => ({
                type: normStr(f?.type)?.toLowerCase(),
                value: normStr(f?.value),
                note: normStr(f?.note),
              }))
              .filter((f) => f.type || f.value || f.note)
          : [],
    },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    collection: "blacklists",
    collation: { locale: "tr", strength: 2 },
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* -------- indexes -------- */
// text arama (opsiyonel)
BlacklistSchema.index({
  name: "text",
  instagramUsername: "text",
  desc: "text",
});

/* -------- virtuals -------- */
// UI’da gerekirse @ ile göstermek için
BlacklistSchema.virtual("instagramHandle").get(function () {
  const h = this.instagramUsername;
  return h ? `@${h}` : "";
});

/* -------- hooks -------- */
BlacklistSchema.pre("save", function (next) {
  if (this.instagramUsername)
    this.instagramUsername = normHandle(this.instagramUsername);

  if (this.instagramUrl)
    this.instagramUrl = normUrl(this.instagramUrl);

  if (this.phone)
    this.phoneDigits = digitsOnly(this.phone);

  next();
});

export default mongoose.models.Blacklist ||
  mongoose.model("Blacklist", BlacklistSchema, "blacklists");
