// backend/middlewares/requireAuth.js — PRO / LIVE READY
import jwt from "jsonwebtoken";

const DEV_FALLBACK = "dev_secret_change_me";
const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACK;
const IS_PROD = process.env.NODE_ENV === "production";

/** Basit JWT format kontrolü (x.y.z) */
function looksLikeJwt(t = "") {
  return typeof t === "string" && t.split(".").length === 3;
}

/** Authorization/cookie/query’den token çıkar (prod-safe) */
function extractToken(req) {
  // 1) Authorization: Bearer <token>
  const auth =
    req.get("authorization") ||
    req.get("Authorization") ||
    req.headers?.authorization ||
    req.headers?.Authorization;

  if (auth && typeof auth === "string") {
    const trimmed = auth.trim();
    const m = trimmed.match(/^bearer\s+(.+)$/i);
    if (m && m[1]) return m[1].trim();
    if (looksLikeJwt(trimmed)) return trimmed; // geri uyumluluk
  }

  // 2) Cookie: token / accessToken
  const c = req.cookies || req.signedCookies || {};
  if (c.token) return c.token;
  if (c.accessToken) return c.accessToken;

  // 3) Query token (sadece dev’de debugging)
  if (!IS_PROD && req.query?.token) {
    const qt = String(req.query.token).trim();
    if (qt) return qt;
  }

  return null;
}

export function requireAuth(req, res, next) {
  try {
    // Prod’da default secret ile çalışmayı engelle
    if (IS_PROD && JWT_SECRET === DEV_FALLBACK) {
      return res.status(500).json({
        ok: false,
        code: "SERVER_MISCONFIG",
        message: "Sunucu yapılandırması hatalı (JWT_SECRET eksik).",
      });
    }

    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({
        ok: false,
        code: "NO_TOKEN",
        message: "Missing token",
      });
    }

    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      clockTolerance: 5,
    });

    if (!payload) {
      return res.status(401).json({
        ok: false,
        code: "INVALID_PAYLOAD",
        message: "Invalid token",
      });
    }

    req.user = payload;          // payload.email varsa requireAdminEmail çalışır
    req.token = token;           // lazım olursa downstream kullanır
    return next();
  } catch (e) {
    if (e?.name === "TokenExpiredError") {
      return res.status(401).json({
        ok: false,
        code: "TOKEN_EXPIRED",
        message: "Oturum süresi doldu",
      });
    }
    if (e?.name === "JsonWebTokenError") {
      return res.status(401).json({
        ok: false,
        code: "JWT_ERROR",
        message: "Invalid token",
      });
    }
    return res.status(401).json({
      ok: false,
      code: "AUTH_ERROR",
      message: "Invalid token",
    });
  }
}
