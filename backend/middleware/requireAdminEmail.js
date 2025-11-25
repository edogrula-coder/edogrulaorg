// backend/middlewares/requireAdminEmail.js — PRO VERSION
export function requireAdminEmail(allowed = "admin@edogrula.org") {
  // allowed: string | string[] | "a@x.com,b@y.com"
  const allowedList = Array.isArray(allowed)
    ? allowed
    : String(allowed || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

  const allowedSet = new Set(allowedList.map(e => e.toLowerCase()));

  return function (req, res, next) {
    // auth middleware sonrası req.user dolu olmalı
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Kimlik doğrulanmadı",
      });
    }

    const email = String(req.user.email || "").toLowerCase();

    if (allowedSet.size === 0) {
      // yanlış kullanımda kimse geçmesin
      return res.status(403).json({
        ok: false,
        code: "FORBIDDEN",
        message: "Admin only",
      });
    }

    if (allowedSet.has(email)) return next();

    return res.status(403).json({
      ok: false,
      code: "FORBIDDEN",
      message: "Admin only",
    });
  };
}
