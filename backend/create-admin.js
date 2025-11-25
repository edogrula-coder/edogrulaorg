// create-admin.js — Ultra Pro (live-safe)
// Kullanım:
//  node create-admin.js --email admin@edogrula.org --password "SENIN_SIFREN" --force
//  node create-admin.js --email admin@edogrula.org --force --allow-prod
//
// ENV alternatifleri:
//  ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_ROLE, BCRYPT_COST
//
// NOT: Prod veritabanında çalıştıracaksan mutlaka --allow-prod ver.

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

/* ------------------------- küçük CLI parser ------------------------- */
function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs();

const isProd = process.env.NODE_ENV === "production";
const allowProd = !!(args["allow-prod"] || args.allowProd);

const email =
  (args.email || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
let password =
  (args.password || process.env.ADMIN_PASSWORD || "").toString();
const name =
  (args.name || process.env.ADMIN_NAME || "Admin").toString().trim();
const role =
  (args.role || process.env.ADMIN_ROLE || "admin").toString().trim();

const force = !!args.force;
const showHash = !!(args["show-hash"] || args.showHash);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/* ------------------------- safety checks ------------------------- */
function die(msg, code = 1) {
  console.error("❌ " + msg);
  process.exit(code);
}

if (!process.env.MONGO_URI) {
  die("MONGO_URI env boş. .env içine doğru Atlas URI koy.");
}
if (!emailRegex.test(email)) {
  die("Geçerli bir admin email vermelisin. (--email veya ADMIN_EMAIL)");
}
if (isProd && !allowProd) {
  die(
    "NODE_ENV=production görünüyor. Prod DB’de çalıştırmak için bilinçli olarak --allow-prod ver."
  );
}

/* ------------------------- helpers ------------------------- */
function genStrongPassword(len = 20) {
  return crypto.randomBytes(Math.ceil(len))
    .toString("base64url")
    .slice(0, len);
}

async function main() {
  let conn;
  try {
    conn = await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB bağlandı");

    const User = (await import("./models/User.js")).default;

    // Şifre yoksa üret
    let generated = false;
    if (!password) {
      password = genStrongPassword(22);
      generated = true;
    }

    const cost = Number(process.env.BCRYPT_COST || 12);
    const hashed = await bcrypt.hash(password, Math.max(8, cost));

    // Kullanıcıyı case-insensitive bul
    const existing = await User.findOne({
      email: new RegExp("^" + email + "$", "i"),
    });

    if (existing) {
      if (!force) {
        die(
          `Bu email ile kullanıcı zaten var (${existing.email}). Güncellemek için --force ver.`
        );
      }

      existing.email = email;
      existing.password = hashed;
      existing.role = role;
      existing.name = name || existing.name;

      await existing.save();
      console.log("✅ Mevcut kullanıcı GÜNCELLENDİ (force)");
    } else {
      const newUser = new User({
        email,
        password: hashed,
        role,
        name,
      });
      await newUser.save();
      console.log("✅ Yeni admin kullanıcısı oluşturuldu");
    }

    console.log("📧 Email:", email);
    console.log("🛡️ Role :", role);
    console.log("👤 Name :", name);

    if (generated) {
      console.log("🔑 Üretilen şifre (1 kere gösterilir):", password);
      console.log("⚠️  Bu şifreyi hemen güvenli yere kaydet.");
    } else {
      console.log("🔑 Şifre: (gizli) — sen verdin");
    }

    if (showHash) {
      console.log("🔐 Hash:", hashed);
    }

    console.log("✅ İşlem tamam.");
  } catch (err) {
    console.error("❌ Hata:", err?.message || err);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.connection.close();
    } catch {}
  }
}

main();
