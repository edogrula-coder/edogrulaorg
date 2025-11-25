// backend/models/User.js — PRO / LIVE READY
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/* ========= Config ========= */
const COST = (() => {
  const n = parseInt(process.env.BCRYPT_COST || "10", 10);
  return Number.isFinite(n) ? Math.min(14, Math.max(8, n)) : 10;
})();

/* ========= Helpers ========= */
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const lower = (s) => clean(s).toLowerCase();

// bcrypt hash mi? (2a/2b/2y, 60 char civarı)
const isBcryptHash = (v = "") =>
  typeof v === "string" &&
  /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(v);

const pruneUndefined = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
};

/* ========= Schema ========= */
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      unique: true,
      index: true,
      set: lower,
    },

    // select:false -> authenticate sırasında +password ile seçiyoruz
    password: { type: String, required: true, minlength: 6, select: false },

    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
      index: true,
    },

    isVerified: { type: Boolean, default: false, index: true },
    lastLoginAt: { type: Date },

    loginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    emailVerifyToken: { type: String, select: false },
    emailVerifyExpires: { type: Date, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
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

UserSchema.index({ isVerified: 1, role: 1, createdAt: -1 });

/* ========= Hooks ========= */
UserSchema.pre("save", async function (next) {
  if (this.isModified("email") && this.email) {
    this.email = lower(this.email);
  }

  if (!this.isModified("password")) return next();

  // Zaten bcrypt hash ise tekrar hashleme (ADMIN_PASSWORD_HASH vb.)
  if (isBcryptHash(this.password)) return next();

  const salt = await bcrypt.genSalt(COST);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.pre("findOneAndUpdate", async function (next) {
  const upd = this.getUpdate() || {};
  const $set = { ...(upd.$set || {}) };
  const $setOnInsert = { ...(upd.$setOnInsert || {}) };

  if (typeof $set.email === "string") {
    $set.email = lower($set.email);
  }
  if (typeof $setOnInsert.email === "string") {
    $setOnInsert.email = lower($setOnInsert.email);
  }

  if (typeof $set.password === "string" && $set.password.length >= 6) {
    // zaten hash ise dokunma
    if (!isBcryptHash($set.password)) {
      const salt = await bcrypt.genSalt(COST);
      $set.password = await bcrypt.hash($set.password, salt);
    }
  }

  pruneUndefined($set);
  pruneUndefined($setOnInsert);

  this.setUpdate({ ...upd, $set, $setOnInsert });
  next();
});

/* ========= Methods / Statics ========= */
UserSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.markLoginSuccess = async function () {
  this.loginAttempts = 0;
  this.lockedUntil = null;
  this.lastLoginAt = new Date();
  await this.save({ validateBeforeSave: false });
};

UserSchema.methods.markLoginFailure = async function (maxAttempts = 5, lockMinutes = 15) {
  const now = new Date();
  if (this.lockedUntil && this.lockedUntil > now) return;

  this.loginAttempts = (this.loginAttempts || 0) + 1;
  if (this.loginAttempts >= maxAttempts) {
    this.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
    this.loginAttempts = 0;
  }
  await this.save({ validateBeforeSave: false });
};

UserSchema.statics.authenticate = async function (email, password) {
  const user = await this.findOne({ email: lower(email || "") })
    .select("+password +loginAttempts +lockedUntil");

  if (!user) return null;

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    return { lockedUntil: user.lockedUntil };
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    await user.markLoginFailure();
    return null;
  }

  await user.markLoginSuccess();
  return await this.findById(user._id);
};

/**
 * Admin seed:
 * - ADMIN_EMAIL zorunlu
 * - ADMIN_PASSWORD_HASH varsa direkt kullan (artık double-hash olmaz)
 * - Yoksa ADMIN_PASSWORD'ı COST ile hash'le
 */
UserSchema.statics.ensureAdminSeed = async function () {
  const email = lower(process.env.ADMIN_EMAIL || "");
  if (!email) return;

  let user = await this.findOne({ email });
  if (user) {
    if (user.role !== "admin") {
      user.role = "admin";
      await user.save({ validateBeforeSave: false });
    }
    return;
  }

  let passwordHash = clean(process.env.ADMIN_PASSWORD_HASH || "");
  if (!passwordHash && process.env.ADMIN_PASSWORD) {
    const salt = await bcrypt.genSalt(COST);
    passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, salt);
  }

  if (!passwordHash) {
    console.warn(
      "[User.ensureAdminSeed] ADMIN_PASSWORD_HASH veya ADMIN_PASSWORD tanımlı değil; admin oluşturulmadı."
    );
    return;
  }

  await this.create({
    email,
    password: passwordHash, // bcrypt hash ise pre-save artık tekrar hashlemiyor
    role: "admin",
    isVerified: true,
    name: "Platform Admin",
  });

  console.log(`[User.ensureAdminSeed] Admin kullanıcı oluşturuldu: ${email}`);
};

/* ========= Output shaping ========= */
UserSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.loginAttempts;
    delete ret.lockedUntil;
    delete ret.emailVerifyToken;
    delete ret.emailVerifyExpires;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    return ret;
  },
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);
export default User;
