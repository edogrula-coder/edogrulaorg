// backend/syncBusinessPhotosToDb.js
// R2'ye upload edilen business_photos klasörünü MongoDB'deki Business'lara işler.

import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Business from "./models/Business.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 📌 Mongo bağlantısı
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URL;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI .env içinde bulunamadı.");
  process.exit(1);
}

// 📌 Foto klasörü (lokal)
const PHOTOS_ROOT = path.join(__dirname, "business_photos");

// 📌 R2 public base URL
const RAW_BUCKET_URL = (process.env.R2_BUCKET_URL || "").replace(/\/+$/, "");
const BUCKET_NAME = process.env.R2_BUCKET_NAME || "edogrula-uploads";

/**
 * İstersen .env'ye:
 *   R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev
 * ekleyebilirsin. Yoksa klasik endpoint/bucket kullanılır.
 */
const R2_PUBLIC_BASE =
  (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "") ||
  `${RAW_BUCKET_URL}/${BUCKET_NAME}`;

async function main() {
  console.log("🧠 MongoDB bağlanıyor...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ MongoDB bağlı.");

  if (!fs.existsSync(PHOTOS_ROOT)) {
    console.error("❌ business_photos klasörü bulunamadı:", PHOTOS_ROOT);
    process.exit(1);
  }

  const entries = fs.readdirSync(PHOTOS_ROOT, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  let matched = 0;
  let notFound = 0;

  for (const folder of folders) {
    // 0833_deco-home -> slug: deco-home
    const parts = folder.split("_");
    if (parts.length < 2) {
      console.warn("⚠️ Klasör ismi beklenen formatta değil, atlanıyor:", folder);
      continue;
    }
    const slug = parts.slice(1).join("_");

    const folderPath = path.join(PHOTOS_ROOT, folder);
    const files = fs
      .readdirSync(folderPath)
      .filter((f) => /^photo_\d+\.(jpe?g|png|webp)$/i.test(f));

    if (!files.length) {
      console.log(`📂 ${folder} -> boş (foto yok).`);
      continue;
    }

    // Dosya adlarını numaraya göre sırala
    files.sort((a, b) => {
      const na = Number(a.match(/photo_(\d+)/)?.[1] || 0);
      const nb = Number(b.match(/photo_(\d+)/)?.[1] || 0);
      return na - nb;
    });

    // R2 public URL'leri
    const urls = files.map((file) => {
      const key = `business_photos/${folder}/${file}`;
      return `${R2_PUBLIC_BASE}/${key}`;
    });

    try {
      // 🔴 findOneAndUpdate yerine → updateOne (hook yok, çatışma yok)
      const res = await Business.updateOne(
        { slug },
        { $set: { galleryAbs: urls } },
        { strict: false }
      );

      if (res.matchedCount === 0) {
        console.log(
          `❌ İşletme bulunamadı, klasör atlandı: ${folder} (slug: ${slug})`
        );
        notFound++;
      } else {
        console.log(
          `✅ ${folder} -> slug: ${slug} -> ${urls.length} foto kaydedildi.`
        );
        matched++;
      }
    } catch (err) {
      console.error(
        `🔥 Güncelleme hatası: ${folder} (slug: ${slug}) -`,
        err.message
      );
    }
  }

  console.log("\n📊 Özet:");
  console.log("  Eşleşen klasör:", matched);
  console.log("  İşletmesi bulunamayan klasör:", notFound);

  await mongoose.disconnect();
  console.log("🔌 MongoDB bağlantısı kapatıldı.");
}

main().catch((err) => {
  console.error("🔥 Genel hata:", err);
  process.exit(1);
});
