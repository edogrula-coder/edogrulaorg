// src/pages/Supw.jsx
import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_ROOT = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export default function Supw() {
  const nav = useNavigate();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ❗ Bu sayfa sadece development'ta açık
  if (import.meta.env.MODE !== "development") {
    return (
      <div style={{ padding: 24 }}>
        <h1>403</h1>
        <p>Bu sayfa yalnızca yerel geliştirme ortamında aktiftir.</p>
      </div>
    );
  }

  async function handleGetAdmin() {
    setError("");
    if (!key) {
      setError("Lütfen dev anahtarını gir");
      return;
    }
    setLoading(true);
    try {
      const url = `${API_ROOT || ""}/api/dev/supw/issue-token`;
      const res = await axios.post(
        url,
        {},
        { headers: { "x-admin-dev-key": key } }
      );
      const { token } = res.data || {};
      if (!token) throw new Error("Token alınamadı");

      // Projenin interceptor'ı localStorage'dan token okuyorsa:
      localStorage.setItem("token", token);

      nav("/admin/dashboard");
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Hata");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 440,
        margin: "40px auto",
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Arial",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>SUPW (Local Dev)</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Yerelde kısa ömürlü admin yetkisi almak için dev anahtarını gir.
      </p>

      <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
        Dev Key
      </label>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleGetAdmin()}
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid #ddd",
          borderRadius: 8,
          outline: "none",
        }}
        placeholder="ADMIN_DEV_KEY"
        autoFocus
      />

      <button
        onClick={handleGetAdmin}
        disabled={loading}
        style={{
          marginTop: 12,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #ddd",
          cursor: "pointer",
        }}
      >
        {loading ? "Alınıyor..." : "Admin Yetkisi Al (10 dk)"}
      </button>

      {error && (
        <p style={{ color: "crimson", marginTop: 10 }} aria-live="assertive">
          {error}
        </p>
      )}
    </div>
  );
}
