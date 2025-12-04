// syncGalleryFromR2.js — R2 fotolarını Business.galleryAbs alanına yaz
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Business from "./models/Business.js";

const ROOT_DIR = path.join(process.cwd(), "business_photos");

// Örn: https://8b9130add04efb3a9de50cb4ae2b6d31.r2.cloudflarestorage.com
const R2_BASE = (process.env.R2_BUCKET_URL || "").replace(/\/+$/, "");
const BUCKET_NAME = process.env.R2_BUCKET_NAME || "edogrula-uploads";

if (!R2_BASE) {
  console.error("❌ R2_BUCKET_URL tanımlı değil.");
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(ROOT_DIR)) {
    console.error("❌ business_photos klasörü bulunamadı:", ROOT_DIR);
    process.exit(1);
  }

  console.log("🧾 business_photos klasörü:", ROOT_DIR);
  console.log("🌐 R2 base:", R2_BASE);
  console.log("🪣 Bucket:", BUCKET_NAME);

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });
  console.log("✅ MongoDB bağlı.");

  const folders = fs
    .readdirSync(ROOT_DIR)
    .filter((name) =>
      fs.statSync(path.join(ROOT_DIR, name)).isDirectory()
    );

  let matched = 0;
  let missingBiz = [];
  let emptyFolders = 0;

  for (const folder of folders) {
    // 0833_deco-home  →  deco-home
    const slug = folder.split("_").slice(1).join("_");
    if (!slug) {
      console.warn("⚠ slug çıkarılamadı:", folder);
      continue;
    }

    const dir = path.join(ROOT_DIR, folder);
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));

    if (!files.length) {
      emptyFolders++;
      continue;
    }

    const biz = await Business.findOne({ slug }).select(
      "_id slug name galleryAbs"
    );

    if (!biz) {
      missingBiz.push(folder);
      console.warn("❓ İşletme bulunamadı, klasör:", folder, "slug:", slug);
      continue;
    }

    const urls = files.map(
      (file) =>
        `${R2_BASE}/${BUCKET_NAME}/business_photos/${folder}/${file}`
    );

    biz.galleryAbs = urls;
    await biz.save();

    matched++;
    console.log(
      `✅ ${folder}  →  ${biz.slug} (${urls.length} foto)`
    );
  }

  console.log("\n📊 Özet:");
  console.log("   Eşleşen klasör:", matched);
  console.log("   İşletmesi bulunamayan klasör:", missingBiz.length);
  if (missingBiz.length) {
    console.log("   Eksik klasörler:", missingBiz.join(", "));
  }
  console.log("   Boş klasör:", emptyFolders);

  await mongoose.disconnect();
  console.log("🔌 MongoDB bağlantısı kapatıldı.");
}

main().catch((err) => {
  console.error("🔥 Genel hata:", err);
  process.exit(1);
});
