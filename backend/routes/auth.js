// backend/routes/auth.js — PRO / LIVE READY (VerificationCode.issue + verify uyumlu)
import express from "express";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

import User from "../models/User.js";
import VerificationCode from "../models/VerificationCode.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/* ------------ Config ------------ */
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const isProd = process.env.NODE_ENV === "production";

/* ------------ Cookie opts ------------ */
const COOKIE_NAME = "token";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 gün
};

/* ------------ Helpers ------------ */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const normEmail = (e) => String(e || "").trim().toLowerCase();
const safeStr = (s, max = 5000) => String(s || "").trim().slice(0, max);

const signEmailVerifyToken = (email) =>
  jwt.sign(
    { sub: "email-verify", email },
    JWT_SECRET,
    { expiresIn: "10m" } // 10 dk
  );

/* ------------ Mail transporter ------------ */
function buildTransporter() {
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_SECURE } = process.env;
  if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASS) return null;

  return nodemailer.createTransport({
    host: MAIL_HOST,
    port: Number(MAIL_PORT),
    secure: String(MAIL_SECURE || "").toLowerCase() === "true",
    auth: { user: MAIL_USER, pass: MAIL_PASS },
  });
}

const mailFrom = process.env.MAIL_FROM || "E-Doğrula <noreply@edogrula.org>";
const mailTx = buildTransporter();

/* =========================================
 * GET /api/auth/ping
 * =======================================*/
router.get("/ping", (_req, res) => {
  res.json({ ok: true, where: "auth" });
});

/* =========================================
 * (DEV ONLY) Debug uçları
 * =======================================*/
router.get("/_dev/peek-code", async (req, res) => {
  if (isProd) return res.status(404).end();

  const email = normEmail(req.query.email);
  const doc = await VerificationCode.findOne({ email })
    .sort({ createdAt: -1 })
    .select("+attempts +codeHash")
    .lean();

  if (!doc) return res.json({ ok: false, found: false });

  res.json({
    ok: true,
    found: true,
    email: doc.email,
    purpose: doc.purpose,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    attempts: doc.attempts,
    hasCodeHash: !!doc.codeHash,
    usedAt: doc.usedAt,
  });
});

router.post("/_dev/test-verify", async (req, res) => {
  if (isProd) return res.status(404).end();

  const email = normEmail(req.body?.email);
  const code = safeStr(req.body?.code, 20);

  const rec = await VerificationCode.findOne({ email, purpose: "verify_email" })
    .sort({ createdAt: -1 })
    .select("+codeHash +attempts")
    .lean();

  if (!rec) return res.json({ ok: false, reason: "CODE_NOT_FOUND" });

  const expired = rec.expiresAt && new Date(rec.expiresAt) < new Date();
  const matches = rec.codeHash
    ? await bcrypt.compare(code, rec.codeHash)
    : false;

  res.json({
    ok: true,
    expired,
    matches,
    attempts: rec.attempts,
    expiresAt: rec.expiresAt,
    createdAt: rec.createdAt,
  });
});

/* =========================================
 * POST /api/auth/send-code
 * Body: { email }
 * DEV:  ?force=1  → throttle bypass
 *       ?clean=1  → eski kayıtları temizle
 * =======================================*/
router.post("/send-code", async (req, res, next) => {
  try {
    const email = normEmail(req.body?.email);
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Geçersiz e-posta" });
    }

    // DEV parametreleri
    const force =
      !isProd &&
      (String(req.query?.force || "") === "1" ||
        String(req.query?.f || "") === "1");

    const clean =
      !isProd && String(req.query?.clean || "") === "1";

    if (clean) {
      await VerificationCode.deleteMany({ email, purpose: "verify_email" });
    }

    // Basit throttle (45 sn)
    if (!force) {
      const last = await VerificationCode.findOne({
        email,
        purpose: "verify_email",
      })
        .sort({ createdAt: -1 })
        .lean();

      if (last?.createdAt) {
        const diff = Date.now() - new Date(last.createdAt).getTime();
        if (diff < 45 * 1000) {
          return res.status(429).json({ success: false, message: "TOO_SOON" });
        }
      }
    }

    // Meta (rate-limit/fraud için ileride işine yarar)
    const meta = {
      ip: req.ip,
      ua: req.get("user-agent"),
      fp: req.get("x-fp") || undefined,
    };

    // Yeni model yolu: issue() => ham kodu döner
    const { code, ttlSeconds } = await VerificationCode.issue({
      email,
      purpose: "verify_email",
      ttlSeconds: 600, // 10 dk
      codeLength: 6,
      meta,
    });

    // SMTP varsa gönder
    if (mailTx) {
      const html = `
        <div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5">
          <p>Merhaba,</p>
          <p>E-Doğrula doğrulama kodunuz:</p>
          <p style="font-size:26px;letter-spacing:4px;margin:12px 0">
            <b>${code}</b>
          </p>
          <p>Bu kod <b>${Math.round(ttlSeconds / 60)} dakika</b> içinde geçerlidir.</p>
        </div>`;

      try {
        await mailTx.sendMail({
          from: mailFrom,
          to: email,
          subject: "E-Doğrula — Doğrulama Kodunuz",
          html,
        });

        const resp = { success: true, message: "Kod gönderildi" };
        if (!isProd) resp.devCode = code;
        return res.json(resp);
      } catch (mailErr) {
        // Dev’de mail patlarsa yine devCode göster
        if (!isProd) {
          console.warn("[auth][send-code] SMTP hata (dev):", mailErr?.message);
          return res.json({
            success: true,
            message: "Kod üretildi (DEV, mail gönderilemedi)",
            devCode: code,
          });
        }
        return res
          .status(500)
          .json({ success: false, message: "MAIL_SEND_FAILED" });
      }
    }

    // SMTP yoksa dev fallback
    if (!isProd) {
      console.log(`[auth][DEV] send-code -> ${email} : ${code}`);
      return res.json({ success: true, message: "Kod üretildi (DEV)", devCode: code });
    }

    // Prod’da SMTP yoksa açıkça hata dön
    return res.status(500).json({
      success: false,
      message: "MAIL_NOT_CONFIGURED",
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================
 * POST /api/auth/verify-code
 * Body: { email, code }
 * Returns: { success, emailVerifyToken, expiresIn }
 * =======================================*/
router.post("/verify-code", async (req, res, next) => {
  try {
    const email = normEmail(req.body?.email);
    const code = safeStr(req.body?.code, 12);

    if (!emailRegex.test(email) || !/^\d{4,8}$/.test(code)) {
      return res.status(400).json({ success: false, message: "Geçersiz giriş" });
    }

    const result = await VerificationCode.verify({
      email,
      purpose: "verify_email",
      code,
      maxAttempts: 5,
    });

    if (!result.ok) {
      const map = {
        not_found: "CODE_NOT_FOUND",
        used: "CODE_USED",
        expired: "CODE_EXPIRED",
        locked: "CODE_LOCKED",
        mismatch: "CODE_INVALID",
      };
      return res.status(400).json({
        success: false,
        message: map[result.reason] || "CODE_INVALID",
        attempts: result.attempts,
      });
    }

    const emailVerifyToken = signEmailVerifyToken(email);
    return res.json({
      success: true,
      emailVerifyToken,
      expiresIn: 600,
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { success, token, user }
 * =======================================*/
router.post("/login", async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "E-posta ve şifre zorunlu",
      });
    }

    const auth = await User.authenticate(email, password);

    if (auth && auth.lockedUntil) {
      return res.status(423).json({
        success: false,
        code: "LOCKED",
        message: "Hesap geçici olarak kilitlendi.",
        retryAt: auth.lockedUntil,
      });
    }

    if (!auth) {
      return res.status(401).json({
        success: false,
        message: "Geçersiz kimlik bilgileri",
      });
    }

    const user = auth;
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role || "user",
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);

    return res.json({
      success: true,
      message: "Giriş başarılı",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role || "user",
        name: user.name || null,
        isVerified: !!user.isVerified,
        isAdmin: (user.role || "user") === "admin",
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası",
    });
  }
});

/* =========================================
 * GET /api/auth/me
 * Header: Authorization Bearer <token> (veya cookie)
 * =======================================*/
router.get("/me", authenticate, async (req, res) => {
  try {
    const { id, email, role } = req.user || {};
    if (!id && !email) {
      return res.status(401).json({ success: false, message: "Geçersiz token" });
    }

    let userDoc = null;
    if (id) {
      userDoc = await User.findById(id).select("email role name isVerified");
    } else if (email) {
      userDoc = await User.findOne({ email }).select("email role name isVerified");
    }

    if (!userDoc) {
      return res.status(401).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    return res.json({
      success: true,
      user: {
        id: userDoc._id,
        email: userDoc.email,
        role: userDoc.role || role || "user",
        name: userDoc.name || null,
        isVerified: !!userDoc.isVerified,
        isAdmin: (userDoc.role || role || "user") === "admin",
      },
    });
  } catch {
    return res.status(401).json({ success: false, message: "Geçersiz token" });
  }
});

/* =========================================
 * POST /api/auth/logout
 * Cookie'yi temizler
 * =======================================*/
router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    ...COOKIE_OPTS,
    expires: new Date(0),
  });
  return res.json({ success: true, message: "Çıkış yapıldı" });
});

export default router;
