// src/lib/admin/ensureAccess.js
import apiDefault, { api as apiNamed } from "@/api/axios-boot";

/**
 * ensureAccess()
 * - /auth/me üzerinden admin yetkisi var mı kontrol eder.
 * - Live ortamda response shape / baseURL farklılıklarına toleranslıdır.
 * - Başarısız olursa false döner.
 */
export async function ensureAccess() {
  const api = apiNamed || apiDefault;

  // Build-time admin ayarları (opsiyonel)
  const ADMIN_EMAILS = parseList(import.meta?.env?.VITE_ADMIN_EMAILS, [
    "admin@edogrula.org",
  ]).map((e) => e.toLowerCase());

  const ADMIN_ROLES = parseList(import.meta?.env?.VITE_ADMIN_ROLES, [
    "admin",
    "superadmin",
    "owner",
  ]).map((r) => r.toLowerCase());

  // BaseURL varyasyonlarına fallback
  const candidates = ["/auth/me", "/api/auth/me"];

  for (const url of candidates) {
    try {
      const res = await api.get(url, { _quiet: true });
      const data = res?.data ?? {};

      // Response toleransı
      const u = data.user || data.data?.user || data;
      const email = String(u?.email || data?.email || "").toLowerCase();
      const role = String(u?.role || data?.role || "").toLowerCase();

      const isAdminFlag =
        Boolean(u?.isAdmin ?? data?.isAdmin) ||
        Boolean(u?.admin ?? data?.admin);

      if (isAdminFlag) return true;
      if (email && ADMIN_EMAILS.includes(email)) return true;
      if (role && ADMIN_ROLES.includes(role)) return true;

      // bazı backendler roles:[] döndürebilir
      const rolesArr = Array.isArray(u?.roles) ? u.roles : Array.isArray(data?.roles) ? data.roles : [];
      if (rolesArr.some((r) => ADMIN_ROLES.includes(String(r).toLowerCase()))) return true;

      return false;
    } catch (e) {
      const st = e?.response?.status;
      // 404/405 ise diğer candidate'e geç; diğer hatalarda false
      if (st === 404 || st === 405) continue;
      return false;
    }
  }

  return false;
}

/* ---------------- helpers ---------------- */

function parseList(raw, fallback = []) {
  try {
    const s = String(raw || "").trim();
    if (!s) return fallback;
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  } catch {
    return fallback;
  }
}
