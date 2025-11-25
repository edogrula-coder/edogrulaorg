// backend/middleware/devOnly.js
import rateLimit from "express-rate-limit";
import crypto from "crypto";

const IS_DEV = process.env.NODE_ENV === "development";

// Dev-only allowlist (loopback). İstersen PRIVATE_DEV_IPS ile genişletirsin.
const BASE_LOCAL_IPS = new Set(["127.0.0.1", "::1"]);
const EXTRA_IPS = (process.env.PRIVATE_DEV_IPS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
for (const ip of EXTRA_IPS) BASE_LOCAL_IPS.add(ip);

/** Proxy ortamlarında gerçek IP’yi almaya çalış */
function getClientIp(req) {
  // Vercel -> x-vercel-forwarded-for, fallback x-forwarded-for
  const xf =
    req.headers?.["x-vercel-forwarded-for"] ||
    req.headers?.["x-forwarded-for"] ||
    req.headers?.["x-real-ip"];

  if (xf && typeof xf === "string") {
    // x-forwarded-for list olabilir: "client, proxy1, proxy2"
    const first = xf.split(",")[0].trim();
    if (first) return first.replace("::ffff:", "");
  }

  return (req.ip || "").replace("::ffff:", "");
}

/** Sabit zamanlı string karşılaştırması (ufak güvenlik bonusu) */
function safeEq(a = "", b = "") {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export const supwLimiter = rateLimit({
  windowMs: 60 * 1000,
  // v6 uyumu için max, v7+ için limit bırakıyoruz
  max: 10,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,

  // Proxy/Serverless ortamlarında tüm kullanıcılar tek IP sayılmasın
  keyGenerator: (req) => getClientIp(req) || "unknown",
});

export function devOnly(req, res, next) {
  // Production/test/staging'de tamamen kapalı
  if (!IS_DEV) {
    return res.status(403).json({ error: "Disabled in production" });
  }

  // Sadece local IP'lerden izin ver
  const ip = getClientIp(req);
  if (!BASE_LOCAL_IPS.has(ip)) {
    return res.status(403).json({ error: "Local only" });
  }

  // Güçlü bir header anahtarı iste
  const key = req.get("x-admin-dev-key");
  const expected = process.env.ADMIN_DEV_KEY;

  if (!expected || !key || !safeEq(key, expected)) {
    return res.status(401).json({ error: "Missing/invalid dev key" });
  }

  return next();
}
