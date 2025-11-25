// backend/routes/dev.supw.js — Dev Superpower (Ultra Pro, dev-only, live-safe)
import { Router } from "express";
import jwt from "jsonwebtoken";
import { devOnly, supwLimiter } from "../middleware/devOnly.js";

const router = Router();

const isProd = process.env.NODE_ENV === "production";
const JWT_SECRET = (process.env.JWT_SECRET || "").trim();

/**
 * DEV ping (opsiyonel)
 * GET /api/dev/supw/ping
 */
router.get("/ping", devOnly, (_req, res) => {
  res.json({ ok: true, where: "dev.supw" });
});

/**
 * Yalnızca development + local + x-admin-dev-key ile erişim
 * POST /api/dev/supw/issue-token
 *
 * Not: Body'den role/email override YOK.
 * Dev token’ı sabit ve kısa süreli.
 */
router.post("/issue-token", supwLimiter, devOnly, (req, res) => {
  try {
    // Ekstra canlı koruma (middleware olsa bile)
    if (isProd) {
      return res.status(404).json({ ok: false, message: "not_found" });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({
        ok: false,
        error: "JWT_SECRET_MISSING",
        message: "JWT_SECRET tanımlı değil. Dev token basılamaz.",
      });
    }

    // Sabit ve güvenli payload (override yok)
    const payload = {
      sub: "dev-admin",
      email: "dev@localhost",
      role: "admin",
      iss: "e-dogrula-dev",
      aud: "e-dogrula-admin",
    };

    const expiresInSec = 10 * 60; // 10 dk
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });

    // Secret loglama yok — sadece bilgi
    if (process.env.NODE_ENV !== "test") {
      console.warn("[SUPW] Temporary admin token issued for local dev (10m)");
    }

    return res.json({ ok: true, token, expiresIn: expiresInSec });
  } catch (err) {
    console.error("[SUPW] issue-token error:", err);
    return res.status(500).json({
      ok: false,
      error: "ISSUE_TOKEN_FAILED",
      message: "Failed to issue dev admin token",
    });
  }
});

export default router;
