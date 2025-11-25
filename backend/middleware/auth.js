// backend/middleware/auth.js
import jwt from "jsonwebtoken";

const DEV_FALLBACK = "dev_secret_change_me";
const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACK;

// Production'da default secret ile çalışmayı engelle (canlıda güvenlik için)
const IS_PROD = process.env.NODE_ENV === "production";
if (IS_PROD && JWT_SECRET === DEV_FALLBACK) {
  console.warn("[auth] FATAL: JWT_SECRET production'da tanımlı değil!");
}

/** Basit JWT format kontrolü (x.y.z) */
function looksLikeJwt(t = "") {
  return typeof t === "string" && t.split(".").length === 3;
}

/** Authorization header/cookie'den token'ı güvenli biçimde çıkarır */
function extractToken(req) {
  // 1) Header: Authorization: Bearer <token>  (case-insensitive)
  const auth =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    req.headers?.AUTHORIZATION;

  if (auth && typeof auth === "string") {
    const trimmed = auth.trim();

    // Bearer <token>
    const m = trimmed.match(/^bearer\s+(.+)$/i);
    if (m && m[1]) return m[1].trim();

    // Bazı istemciler direkt token yazar (geriye dönük uyumluluk)
    if (looksLikeJwt(trimmed)) return trimmed;
  }

  // 2) Cookie: token / accessToken (geriye dönük + yeni isim)
  const c = req.cookies || req.signedCookies || {};
  if (c.token) return c.token;
  if (c.accessToken) return c.accessToken;

  // 3) Query (sadece debugging için — prod’da kapalı)
  if (!IS_PROD && req.query?.token) {
    const qt = String(req.query.token).trim();
    if (qt) return qt;
  }

  return null;
}

export const authenticate = (req, res, next) => {
  try {
    // Prod misconfig ise token doğrulama yapmadan net hata dön
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
        message: "Token gerekli",
      });
    }

    // Saat senkron kaymalarına tolerans ver (5 sn)
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      clockTolerance: 5,
    });

    // payload beklenen format: { id, email, role }
    if (!decoded || !decoded.role) {
      return res.status(401).json({
        ok: false,
        code: "INVALID_PAYLOAD",
        message: "Geçersiz token",
      });
    }

    req.user = decoded;
    req.token = token;
    next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({
        ok: false,
        code: "TOKEN_EXPIRED",
        message: "Oturum süresi doldu",
      });
    }
    if (error?.name === "JsonWebTokenError") {
      return res.status(401).json({
        ok: false,
        code: "JWT_ERROR",
        message: "Geçersiz token",
      });
    }
    return res.status(401).json({
      ok: false,
      code: "AUTH_ERROR",
      message: "Kimlik doğrulama başarısız",
    });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      ok: false,
      code: "UNAUTHENTICATED",
      message: "Kimlik doğrulanmadı",
    });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({
      ok: false,
      code: "FORBIDDEN",
      message: "Admin yetkisi gerekli",
    });
  }
  next();
};
