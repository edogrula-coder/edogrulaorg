// backend/middleware/ensureAdmin.js — PRO VERSION (prod-safe)
import jwt from "jsonwebtoken";

const DEV_FALLBACK = "dev_secret_change_me";
const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACK;

const IS_PROD = process.env.NODE_ENV === "production";
const DEV_BYPASS = !IS_PROD && String(process.env.ADMIN_BYPASS || "") === "1";
const DEBUG = !IS_PROD && String(process.env.DEBUG_ADMIN || "") === "1";

/** Basit JWT format kontrolü (x.y.z) */
function looksLikeJwt(t = "") {
  return typeof t === "string" && t.split(".").length === 3;
}

/** Authorization/cookie'den token çıkar */
function extractToken(req) {
  const auth =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    req.headers?.AUTHORIZATION;

  if (auth && typeof auth === "string") {
    const trimmed = auth.trim();
    const m = trimmed.match(/^bearer\s+(.+)$/i);
    if (m && m[1]) return m[1].trim();
    if (looksLikeJwt(trimmed)) return trimmed; // geri uyumluluk
  }

  const c = req.cookies || req.signedCookies || {};
  if (c.token) return c.token;
  if (c.accessToken) return c.accessToken;

  if (!IS_PROD && req.query?.token) {
    const t = String(req.query.token).trim();
    if (t) return t;
  }

  return null;
}

export default async function ensureAdmin(req, res, next) {
  if (DEBUG) {
    console.log("🟠 ensureAdmin başladı");
    console.log("URL:", req.originalUrl);
    console.log("Method:", req.method);
  }

  // Dev bypass (sadece development'da env ile açılır)
  if (DEV_BYPASS) {
    req.isAdmin = true;
    req.admin = {
      id: "dev_bypass",
      method: "ADMIN_BYPASS=1",
      timestamp: new Date().toISOString(),
    };
    if (DEBUG) console.log("🟢 DEV BYPASS ile admin geçildi");
    return next();
  }

  // Önceden authenticate çalıştıysa buradan geçer
  if (req.isAdmin || req.user?.role === "admin") {
    req.isAdmin = true;
    req.admin = req.user || req.admin || {
      id: req.user?.id,
      method: "jwt_role",
      timestamp: new Date().toISOString(),
    };
    return next();
  }

  // Header key fallback (server-to-server veya acil admin geçişi)
  const headerKey = req.get("x-admin-key") || req.get("x-admin-secret");
  const envKey = process.env.ADMIN_ACCESS_KEY || process.env.ADMIN_KEY; // ADMIN_KEY eskiden vardı, yine destekliyorum
  if (envKey && headerKey && headerKey === envKey) {
    req.isAdmin = true;
    req.admin = {
      id: "header_key_admin",
      method: "x-admin-key",
      timestamp: new Date().toISOString(),
    };
    return next();
  }

  // Eğer req.user yoksa token doğrulamayı dene
  const token = extractToken(req);
  if (token) {
    try {
      // Prod'da default secret ile doğrulama yapma
      if (IS_PROD && JWT_SECRET === DEV_FALLBACK) {
        return res.status(500).json({
          ok: false,
          code: "SERVER_MISCONFIG",
          message: "Sunucu yapılandırması hatalı (JWT_SECRET eksik).",
        });
      }

      const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ["HS256"],
        clockTolerance: 5,
      });

      if (decoded?.role === "admin") {
        req.user = decoded;
        req.isAdmin = true;
        req.admin = decoded;
        return next();
      }
    } catch (e) {
      if (DEBUG) console.log("🔴 ensureAdmin token verify fail:", e?.message);
      // aşağıda 403 dönecek
    }
  }

  return res.status(403).json({
    ok: false,
    code: "FORBIDDEN",
    message: "Admin yetkisi gerekli",
  });
}
