// frontend/src/pages/AdminLogin.jsx — Ultra Pro Admin Login
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import apiDefault, { api as apiNamed } from "@/api/axios-boot"; // ✅ projedeki standart

const api = apiNamed || apiDefault;

/* ------------- Token yardımcıları (UYUMLU) ------------- */
const TOKEN_KEYS = ["authToken", "token"]; // eski anahtar uyumu

const getToken = () => {
  try {
    for (const k of TOKEN_KEYS) {
      const v = localStorage.getItem(k);
      if (v) return v;
    }
    return "";
  } catch {
    return "";
  }
};

const setTokenEverywhere = (token) => {
  if (!token) return;
  try {
    for (const k of TOKEN_KEYS) localStorage.setItem(k, token);
  } catch {}
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
  api.defaults.headers.common["x-auth-token"] = token;
};

const clearTokenEverywhere = () => {
  try {
    for (const k of TOKEN_KEYS) localStorage.removeItem(k);
  } catch {}
  delete api.defaults.headers.common.Authorization;
  delete api.defaults.headers.common["x-auth-token"];
};

/* ------------------ Oturum doğrulama ------------------ */
/** Sadece token varsa çalışır; user.isAdmin/role=admin bekler. */
async function verifySession() {
  const tok = getToken();
  if (!tok) return { ok: false, code: 401, from: "no-token" };

  try {
    const r = await api.get("/auth/me", { timeout: 10000 });
    const u = r?.data?.user || r?.data || {};

    if (u?.isAdmin || u?.role === "admin")
      return { ok: true, from: "auth/me", user: u };

    // admin endpoint ping (opsiyonel)
    try {
      await api.get("/admin/featured", { params: { limit: 1 }, timeout: 8000 });
      return { ok: true, from: "admin/featured", user: u };
    } catch {
      return { ok: false, code: 403, from: "admin/featured" };
    }
  } catch (e) {
    return {
      ok: false,
      code: e?.response?.status || 0,
      from: "auth/me",
    };
  }
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const mounted = useRef(true);

  const [email, setEmail] = useState(
    () => localStorage.getItem("lastAdminEmail") || ""
  );
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const redirectTarget = useMemo(() => {
    const q = new URLSearchParams(location.search);
    const fromQ = q.get("redirect");
    const saved = localStorage.getItem("redirectAfterAdminLogin");

    let raw = fromQ || saved || "/admin/dashboard";
    try {
      raw = decodeURIComponent(raw);
    } catch {
      raw = "/admin/dashboard";
    }

    // ✅ Güvenlik: sadece app içi path
    let target = String(raw || "/admin/dashboard");
    if (!target.startsWith("/")) target = "/admin/dashboard";
    if (target.startsWith("http")) target = "/admin/dashboard";
    if (target.startsWith("/login") || target.startsWith("/admin/login"))
      target = "/admin/dashboard";

    return target;
  }, [location.search]);

  // /admin/login?switch=1 → logout
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("switch") === "1") {
      (async () => {
        try {
          await api.post("/auth/logout", {}, { timeout: 8000 });
        } catch {}
        clearTokenEverywhere();
        if (!mounted.current) return;
        setMsg("Oturum kapatıldı. Yeni hesapla giriş yapabilirsiniz.");
      })();
    }
  }, [location.search]);

  // Sayfa açılışında mevcut token ile doğrulama
  useEffect(() => {
    mounted.current = true;
    localStorage.setItem("redirectAfterAdminLogin", redirectTarget);

    let ignore = false;
    (async () => {
      const tok = getToken();
      if (!tok) return;
      setTokenEverywhere(tok);

      const res = await verifySession();
      if (ignore || !mounted.current) return;

      if (res.ok) {
        navigate(redirectTarget, { replace: true });
      } else if (res.code === 403) {
        setMsg("Bu kullanıcı admin yetkisine sahip değil.");
        clearTokenEverywhere();
      }
    })();

    return () => {
      ignore = true;
      mounted.current = false;
    };
  }, [redirectTarget, navigate]);

  const canSubmit =
    /\S+@\S+\.\S+/.test(email) && (password?.length || 0) >= 6;

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    setMsg("");

    const e = email.trim();
    if (!/\S+@\S+\.\S+/.test(e) || password.length < 6) {
      setMsg("Lütfen geçerli e-posta ve en az 6 karakterli şifre girin.");
      return;
    }

    try {
      setLoading(true);

      // 1) login
      const { data } = await api.post(
        "/auth/login",
        { email: e, password },
        { timeout: 15000 }
      );

      // 2) token
      const token =
        data?.token ||
        data?.accessToken ||
        data?.jwt ||
        data?.idToken ||
        "";
      if (!token) throw new Error("Sunucudan token dönmedi.");

      setTokenEverywhere(token);
      localStorage.setItem("lastAdminEmail", e);

      // 3) verify admin
      const res = await verifySession();
      if (!res.ok) {
        clearTokenEverywhere();
        setMsg(
          res.code === 403
            ? "Bu kullanıcı admin yetkisine sahip değil."
            : "Giriş doğrulanamadı. Lütfen tekrar deneyin."
        );
        return;
      }

      navigate(redirectTarget, { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      const text =
        err?.response?.data?.message ||
        (status === 401
          ? "E-posta/şifre hatalı."
          : status === 429
          ? "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin."
          : "Giriş başarısız.");
      setMsg(text);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [email, password, loading, navigate, redirectTarget]);

  const onKeyDown = (e) => {
    if (e.getModifierState?.("CapsLock")) setCapsOn(true);
    else setCapsOn(false);
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div style={st.wrap}>
      <div style={st.card}>
        <img
          src="/logo.png"
          alt="E-Doğrula"
          style={{ height: 36, marginBottom: 10 }}
        />
        <h2 style={{ margin: "4px 0 14px", fontSize: 20 }}>
          Yönetici Girişi
        </h2>

        <label style={st.lbl}>E-posta</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="admin@edogrula.org"
          autoComplete="username"
          style={st.input}
        />

        <label style={st.lbl}>Şifre</label>
        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ ...st.input, paddingRight: 44, marginBottom: 4 }}
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Şifreyi gizle" : "Şifreyi göster"}
            style={st.eyeBtn}
          >
            {showPw ? "🙈" : "👁️"}
          </button>
        </div>

        {capsOn && (
          <div style={st.caps} role="status">
            Caps Lock açık olabilir
          </div>
        )}

        {msg && (
          <div style={st.err} role="alert">
            {msg}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          style={{
            ...st.btn,
            opacity: !canSubmit || loading ? 0.7 : 1,
          }}
          aria-busy={loading ? "true" : "false"}
        >
          {loading ? "Giriş yapılıyor…" : "Giriş"}
        </button>

        <div style={st.meta}>
          <small>
            Versiyon:{" "}
            <code>{import.meta.env.VITE_APP_VERSION || "web"}</code>
          </small>
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

/* --- STYLES --- */
const st = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background:
      "radial-gradient(1200px 800px at -10% -20%, #e6f0ff 0%, transparent 55%), radial-gradient(1200px 800px at 120% 0%, #ffe9e6 0%, transparent 55%), #ffffff",
    fontFamily: "Inter, system-ui, Segoe UI, Tahoma, sans-serif",
    padding: 16,
  },
  card: {
    width: "min(420px, 94vw)",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    boxShadow: "0 18px 40px rgba(0,0,0,.08)",
    padding: 20,
    textAlign: "left",
  },
  lbl: {
    fontSize: 13,
    color: "#6b7280",
    margin: "6px 0 4px",
    display: "block",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    outline: "none",
    fontSize: 15,
    marginBottom: 8,
  },
  eyeBtn: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    cursor: "pointer",
  },
  btn: {
    marginTop: 8,
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(90deg, #2d8cf0, #5db2ff)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 900,
    cursor: "pointer",
    transition: ".15s",
  },
  err: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#b91c1c",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 700,
    margin: "8px 0 8px",
  },
  caps: {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    color: "#92400e",
    padding: "6px 8px",
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 12,
    marginBottom: 6,
  },
  meta: { marginTop: 10, textAlign: "center", color: "#64748b" },
};

const css = `
  input:focus{
    box-shadow:0 0 0 3px rgba(45,140,240,.25);
    border-color:#93c5fd;
  }
  button:disabled{ cursor:not-allowed; }
`;

