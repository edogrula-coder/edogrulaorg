// reset-password.js — Ultra Pro / Live Ready
// Kullanım:
// 1) ENV ile:
//    ADMIN_EMAIL=admin@edogrula.org ADMIN_PASSWORD='YeniSifre' node reset-password.js
// 2) CLI ile:
//    node reset-password.js admin@edogrula.org 'YeniSifre'
// Not: Şifreyi loglamaz.

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_EMAIL = "admin@edogrula.org";

function pickCliArgs() {
  const [, , a, b] = process.argv;
  return { email: a, password: b };
}

function resolveInputs() {
  const cli = pickCliArgs();

  const email =
    (cli.email || process.env.ADMIN_EMAIL || DEFAULT_EMAIL || "")
      .trim()
      .toLowerCase();

  const password =
    (cli.password || process.env.ADMIN_PASSWORD || "").trim();

  return { email, password };
}

async function main() {
  const { email, password } = resolveInputs();

  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI env eksik. İşlem iptal.");
    process.exit(1);
  }
  if (!email) {
    console.error("❌ ADMIN_EMAIL/arg email boş olamaz.");
    process.exit(1);
  }
  if (!password || password.length < 6) {
    console.error("❌ ADMIN_PASSWORD/arg şifre en az 6 karakter olmalı.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB bağlandı");

    const User = (await import("./models/User.js")).default;

    console.log("🔍 Admin aranıyor:", email);

    const user = await User.findOne({
      email: new RegExp("^" + email + "$", "i"),
    }).select("email role name password");

    console.log("🔍 Mevcut kullanıcı:", user ? "BULUNDU" : "BULUNAMADI");

    const hashed = await bcrypt.hash(password, 12);

    const result = await User.findOneAndUpdate(
      { email: new RegExp("^" + email + "$", "i") },
      {
        $set: {
          password: hashed,
          role: "admin",
          name: user?.name || "Admin",
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    console.log("✅ İşlem başarılı!");
    console.log("📧 Email:", result.email);
    console.log("👤 Rol:", result.role);
    console.log("🆗 Durum:", user ? "GÜNCELLENDİ" : "OLUŞTURULDU");
    console.log("🔐 Şifre güncellendi (loglanmadı).");

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Hata:", error?.message || error);
    try { await mongoose.connection.close(); } catch {}
    process.exit(1);
  }
}

main();
