// backend/models/VerificationCode.js — PRO / LIVE READY
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * BCRYPT maliyeti: OTP için 6–10 makul. (Üst sınır 14)
 * .env → BCRYPT_COST_OTP=8
 */
const COST = (() => {
  const n = parseInt(process.env.BCRYPT_COST_OTP || "8", 10);
  return Number.isFinite(n) ? Math.min(14, Math.max(6, n)) : 8;
})();

/* ===== Helpers ===== */
const normEmail = (e) => String(e || "").trim().toLowerCase();

const isBcryptHash = (v = "") =>
  typeof v === "string" &&
  /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(v);

function genNumericCode(len = 6) {
  const L = Math.min(8, Math.max(4, Number(len) || 6)); // 4–8 arası
  let out = "";
  for (let i = 0; i < L; i++) out += crypto.randomInt(0, 10);
  return out;
}

/**
 * Şema
 */
const VerificationCodeSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      set: normEmail,
      index: true,
    },

    purpose: {
      type: String,
      enum: ["verify_email", "login", "reset_password", "2fa"],
      default: "verify_email",
      index: true,
    },

    codeHash: { type: String, required: true, select: false },

    attempts: { type: Number, default: 0, select: false },
    usedAt: { type: Date, default: null, index: true },

    expiresAt: { type: Date, required: true },

    ip: { type: String, trim: true },
    ua: { type: String, trim: true },
    fp: { type: String, trim: true },
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

/* ===== Indexes ===== */
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
VerificationCodeSchema.index({ email: 1, purpose: 1, createdAt: -1 });

/* ===== Hooks ===== */
// codeHash zaten bcrypt ise tekrar hashleme (yanlış kullanımda bile güvenli)
VerificationCodeSchema.pre("save", async function (next) {
  if (this.isModified("codeHash") && this.codeHash && !isBcryptHash(this.codeHash)) {
    this.codeHash = await bcrypt.hash(String(this.codeHash), COST);
  }
  next();
});

/* ===== Instance Helpers ===== */
VerificationCodeSchema.methods.isExpired = function () {
  return this.expiresAt && this.expiresAt < new Date();
};

/* ===== Statics ===== */

/**
 * Yeni kod üretir (hash’ler), aynı (email,purpose) için önceki kodları kaldırır
 * ve HAM kodu geri döndürür.
 */
VerificationCodeSchema.statics.issue = async function ({
  email,
  purpose = "verify_email",
  ttlSeconds = 300,
  codeLength = 6,
  meta = {},
} = {}) {
  const em = normEmail(email);
  const ttl = Math.max(30, Math.min(3600, Number(ttlSeconds) || 300));
  const code = genNumericCode(codeLength);
  const codeHash = await bcrypt.hash(code, COST);
  const expiresAt = new Date(Date.now() + ttl * 1000);

  await this.deleteMany({ email: em, purpose });

  const doc = await this.create({
    email: em,
    purpose,
    codeHash,
    expiresAt,
    ip: meta.ip,
    ua: meta.ua,
    fp: meta.fp,
  });

  return { doc, code, ttlSeconds: ttl };
};

/**
 * Kodu doğrular; başarıda tüketir (usedAt set).
 * Race-safe + attempts atomic.
 */
VerificationCodeSchema.statics.verify = async function ({
  email,
  purpose = "verify_email",
  code,
  maxAttempts = 5,
} = {}) {
  const em = normEmail(email);
  const now = new Date();

  const rec = await this.findOne({ email: em, purpose })
    .sort({ createdAt: -1 })
    .select("+codeHash +attempts");

  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.usedAt) return { ok: false, reason: "used" };
  if (rec.expiresAt <= now) return { ok: false, reason: "expired" };
  if ((rec.attempts || 0) >= maxAttempts) return { ok: false, reason: "locked" };

  const match = await bcrypt.compare(String(code || ""), rec.codeHash);

  if (!match) {
    // attempts atomic artış (paralel denemelerde kayıp olmaz)
    const incRes = await this.findOneAndUpdate(
      {
        _id: rec._id,
        usedAt: null,
        expiresAt: { $gt: now },
        attempts: { $lt: maxAttempts },
      },
      { $inc: { attempts: 1 } },
      { new: true }
    ).select("attempts");

    return {
      ok: false,
      reason: "mismatch",
      attempts: incRes?.attempts ?? (rec.attempts || 0) + 1,
    };
  }

  // Başarıda tüketmeyi race-safe yap
  const consumed = await this.findOneAndUpdate(
    {
      _id: rec._id,
      usedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: maxAttempts },
    },
    { $set: { usedAt: now } },
    { new: true }
  ).select("+attempts");

  if (!consumed) {
    // arada başka süreç tüketmiş/expire olmuş olabilir
    const fresh = await this.findById(rec._id).select("usedAt expiresAt attempts");
    if (!fresh) return { ok: false, reason: "not_found" };
    if (fresh.usedAt) return { ok: false, reason: "used" };
    if (fresh.expiresAt <= now) return { ok: false, reason: "expired" };
    return { ok: false, reason: "locked" };
  }

  return { ok: true, doc: consumed };
};

/* ===== Output shaping ===== */
VerificationCodeSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.codeHash;
    delete ret.attempts;
    return ret;
  },
});

export default mongoose.models.VerificationCode ||
  mongoose.model("VerificationCode", VerificationCodeSchema);
