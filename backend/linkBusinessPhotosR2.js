// backend/linkBusinessPhotosR2.js
// İşlev: business_photos klasörlerindeki fotoları R2 public URL'leriyle
// Mongo'daki Business dökümanlarına galleryAbs alanı olarak yazmak.

import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Business from "./models/Business.js";

// ====== PATH / ENV ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname; // script backend kökünde
const PHOTOS_ROOT = path.join(ROOT, "business_photos");

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET_NAME;
const bucketUrl = (process.env.R2_BUCKET_URL || "").replace(/\/+$/, "");
const publicBaseEnv = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

// Public base URL öncelik sırası: R2_PUBLIC_BASE > (R2_BUCKET_URL + /bucket)
const PUBLIC_BASE =
  publicBaseEnv ||
  (bucketUrl && bucket
    ? `${bucketUrl}/${bucket}`
    : accountId && bucket
    ? `https://${accountId}.r2.cloudflarestorage.com/${bucket}`
    : null);

if (!PUBLIC_BASE) {
  console.error("❌ PUBLIC_BASE hesaplanamadı. .env'de R2_PUBLIC_BASE veya R2_BUCKET_URL + R2_BUCKET_NAME tanımlı olmalı.");
  process.exit(1);
}

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI tanımlı değil.");
  process.exit(1);
}

mongoose.set("strictQuery", true);

// ====== Yardımcılar ======
function buildGalleryUrls(folderName, files) {
  // business_photos/0833_deco-home/photo_1.jpg → tam public URL
  return files
    .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
    .sort()
    .map(
      (file) =>
        `${PUBLIC_BASE}/business_photos/${folderName}/${file}`
    );
}

function deriveSearchKeys(folderName) {
  // Örnek klasör: "0833_deco-home"
  let code = null;
  let slugPart = folderName;
  const m = folderName.match(/^(\d+)[-_](.+)$/);
  if (m) {
    code = m[1];
    slugPart = m[2];
  }
  const slugCandidate = slugPart.toLowerCase(); // "deco-home"
  const nameLike = slugPart.replace(/[-_]+/g, " "); // "deco home"

  return { code, slugCandidate, nameLike };
}

// ====== Ana akış ======
async function main() {
  console.log("🌐 MongoDB bağlanıyor...");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });
  console.log("✅ MongoDB bağlı.");

  if (!fs.existsSync(PHOTOS_ROOT)) {
    console.error("❌ business_photos klasörü bulunamadı:", PHOTOS_ROOT);
    process.exit(1);
  }

  const folders = fs
    .readdirSync(PHOTOS_ROOT)
    .filter((name) =>
      fs.statSync(path.join(PHOTOS_ROOT, name)).isDirectory()
    )
    .sort();

  console.log("📂 Klasör sayısı:", folders.length);
  console.log("🌍 PUBLIC_BASE:", PUBLIC_BASE);

  let linked = 0;
  let skipped = 0;

  for (const folder of folders) {
    const dirPath = path.join(PHOTOS_ROOT, folder);
    const files = fs.readdirSync(dirPath);
    const imageFiles = files.filter((f) =>
      /\.(jpe?g|png|webp|gif)$/i.test(f)
    );
    if (!imageFiles.length) continue;

    const { code, slugCandidate, nameLike } = deriveSearchKeys(folder);

    // Mongo'da eşleşecek Business'ı bulalım
    const orConds = [
      { slug: slugCandidate },
      { handle: slugCandidate },
      { instagramUsername: slugCandidate },
    ];

    if (code) {
      orConds.push({ code }, { refCode: code }, { shortCode: code });
    }

    orConds.push({ name: new RegExp(nameLike, "i") });

    const biz = await Business.findOne({ $or: orConds });

    if (!biz) {
      console.log(
        `⚠️ Eşleşmedi, atlandı: ${folder}  (slugCandidate="${slugCandidate}", nameLike="${nameLike}")`
      );
      skipped++;
      continue;
    }

    const urls = buildGalleryUrls(folder, imageFiles);
    if (!urls.length) continue;

    // Eski galeriyi ezmek istemezsen bir yedek alan da tutabilirsin:
    // biz.galleryAbsBackup = biz.galleryAbs || [];

    biz.galleryAbs = urls;

    await biz.save();

    console.log(
      `✅ ${folder} → ${biz._id} (${biz.slug || biz.handle || biz.name}) → ${urls.length} foto`
    );
    linked++;
  }

  console.log("\n🎯 Özet:");
  console.log("   Eşleşen klasör:", linked);
  console.log("   Eşleşmeyen klasör:", skipped);

  await mongoose.disconnect();
  console.log("🔌 MongoDB bağlantısı kapatıldı.");
}

main().catch((err) => {
  console.error("💥 Fatal hata:", err);
  process.exit(1);
});
