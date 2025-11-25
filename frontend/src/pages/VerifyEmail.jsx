// src/pages/VerifyEmail.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";

/** API kökü (Vite proxy varsa boş kalır) */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

// Tek axios instance
const api = axios.create({
  baseURL: API_BASE || "",
  withCredentials: true,
});

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();

  // ---- state
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email"); // "email" | "code"
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0); // saniye

  /** redirect hedefi: ?redirect -> state.from -> localStorage -> "/" */
  const redirectTarget = useMemo(() => {
    const p = new URLSearchParams(location.search);
    const q = p.get("redirect");
    const from = location.state?.from;
    const saved = localStorage.getItem("redirectAfterVerify");
    const target = decodeURIComponent(q || from || saved || "/");
    // Güvenlik: verify sayfasına tekrar dönmesin
    return target.startsWith("/verify-email") ? "/" : target;
  }, [location.search, location.state]);

  // İlk yüklemede redirect hedefini sakla
  useEffect(() => {
    localStorage.setItem("redirectAfterVerify", redirectTarget);
  }, [redirectTarget]);

  // E-posta ön-dolum: ?email=, localStorage.verifiedEmail
  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const paramEmail = search.get("email");
    const stored = localStorage.getItem("verifiedEmail");
    const initial = paramEmail || stored || "";
    if (initial) setEmail(initial);

    // URL'de ?code= varsa otomatik code alanına yaz
    const urlCode = search.get("code");
    if (urlCode) {
      setCode(urlCode.trim());
      setStep("code");
    }
  }, [location.search]);

  // Zaten doğrulanmışsa gönder
  useEffect(() => {
    const token =
      localStorage.getItem("emailVerifyToken") ||
      sessionStorage.getItem("emailVerifyToken");
    const flag =
      localStorage.getItem("isVerifiedEmail") ||
      sessionStorage.getItem("isVerifiedEmail");
    if (token || flag) {
      setTimeout(() => navigate(redirectTarget, { replace: true }), 0);
    }
  }, [navigate, redirectTarget]);

  // Cooldown sayacı
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // JWT exp okuma (opsiyonel)
  const saveTokenWithExp = (token) => {
    try {
      const payload = JSON.parse(
        atob(String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
      );
      if (payload?.exp) {
        localStorage.setItem("emailVerifyTokenExp", String(payload.exp * 1000));
      }
    } catch {
      /* sessiz geç */
    }
    localStorage.setItem("emailVerifyToken", token);
    sessionStorage.setItem("emailVerifyToken", token);
    localStorage.setItem("isVerifiedEmail", "true");
    sessionStorage.setItem("isVerifiedEmail", "true");
  };

  // ---- actions
  const sendCode = async () => {
    const cleanEmail = String(email || "").trim();
    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      setMsg("Lütfen geçerli bir e-posta adresi girin.");
      return;
    }
    if (cooldown > 0) return;

    try {
      setLoading(true);
      setMsg("");
      const res = await api.post("/api/auth/send-code", { email: cleanEmail });

      setStep("code");
      setMsg("Kod e-posta adresinize gönderildi.");
      localStorage.setItem("verifiedEmail", cleanEmail);

      // Sunucu 'Retry-After' başlığı verirse onu dikkate al
      const retryHeader = res?.headers?.["retry-after"] || res?.headers?.["Retry-After"];
      const cd = Number.parseInt(retryHeader, 10);
      setCooldown(Number.isFinite(cd) && cd > 0 ? cd : 60);
    } catch (err) {
      const status = err?.response?.status;
      const m =
        err?.response?.data?.message ||
        (status === 404
          ? "Kod gönderme servisi bulunamadı. Lütfen yöneticinizle iletişime geçin."
          : status === 429
          ? "Çok sık denediniz. Lütfen biraz sonra tekrar deneyin."
          : "Kod gönderilemedi. Lütfen tekrar deneyin.");
      setMsg(m);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    const clean = String(code || "").trim();
    const cleanEmail = String(email || "").trim();

    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      setMsg("Lütfen geçerli bir e-posta adresi girin.");
      setStep("email");
      return;
    }
    if (clean.length < 4) {
      setMsg("Lütfen e-postanıza gelen doğrulama kodunu girin.");
      return;
    }

    try {
      setLoading(true);
      setMsg("");

      const res = await api.post("/api/auth/verify-code", {
        email: cleanEmail,
        code: clean,
      });

      // Olası anahtar adları
      const token =
        res?.data?.emailVerifyToken ||
        res?.data?.verifyToken ||
        res?.data?.token ||
        "";

      if (token) saveTokenWithExp(token);

      setMsg("Doğrulama başarılı 🎉");
      const target =
        localStorage.getItem("redirectAfterVerify") || redirectTarget || "/";
      localStorage.removeItem("redirectAfterVerify");
      navigate(target, { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      const m =
        err?.response?.data?.message ||
        (status === 400
          ? "Kod yanlış veya süresi dolmuş."
          : status === 404
          ? "Doğrulama servisi bulunamadı."
          : "Doğrulama başarısız. Lütfen tekrar deneyin.");
      setMsg(m);
    } finally {
      setLoading(false);
    }
  };

  const canSend = /\S+@\S+\.\S+/.test(email);
  const canVerify = String(code || "").trim().length >= 4;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>E-posta Doğrulama</h2>
      <p style={{ marginBottom: 15 }}>
        {step === "email"
          ? "Devam etmek için e-posta adresinizi giriniz."
          : "E-postanıza gelen doğrulama kodunu giriniz."}
      </p>

      {step === "email" && (
        <>
          <input
            type="email"
            placeholder="E-posta adresiniz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSend && !loading && sendCode()}
            style={styles.input}
            autoFocus
          />
          <button
            onClick={sendCode}
            style={styles.btn}
            disabled={!canSend || loading || cooldown > 0}
          >
            {loading
              ? "Gönderiliyor…"
              : cooldown > 0
              ? `Tekrar gönder (${cooldown})`
              : "Kod Gönder"}
          </button>
        </>
      )}

      {step === "code" && (
        <>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d*"
            placeholder="Doğrulama kodu"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && canVerify && !loading && verifyCode()}
            style={styles.input}
            autoFocus
          />
          <button onClick={verifyCode} style={styles.btn} disabled={!canVerify || loading}>
            {loading ? "Doğrulanıyor…" : "Doğrula"}
          </button>
          <button
            type="button"
            onClick={sendCode}
            style={{ ...styles.btn, background: "#6b7280", marginTop: 8 }}
            disabled={loading || cooldown > 0}
            title={cooldown > 0 ? `Yeniden göndermek için ${cooldown} sn` : ""}
          >
            {cooldown > 0 ? `Kodu Tekrar Gönder (${cooldown})` : "Kodu Tekrar Gönder"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setMsg("");
            }}
            style={{ ...styles.btn, background: "#e5e7eb", color: "#111827", marginTop: 8 }}
            disabled={loading}
          >
            E-postayı Değiştir
          </button>
        </>
      )}

      {msg && <p style={{ marginTop: 15, color: "#2c3e50" }}>{msg}</p>}
    </div>
  );
}

/* ---- styles ---- */
const styles = {
  container: {
    padding: 40,
    maxWidth: 420,
    margin: "40px auto",
    textAlign: "center",
    fontFamily: "Segoe UI, Inter, system-ui, sans-serif",
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    marginBottom: 15,
    color: "#1f2937",
  },
  input: {
    margin: "10px 0",
    padding: 12,
    width: "100%",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 15,
  },
  btn: {
    padding: "12px 20px",
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    width: "100%",
    fontWeight: 800,
    fontSize: 15,
    marginTop: 10,
  },
};
