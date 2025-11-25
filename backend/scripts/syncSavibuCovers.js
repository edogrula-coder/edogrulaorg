// backend/scripts/syncSavibuCovers.js
// savibu-images/index.json -> Mongo businesses
// Her Savibu işletmesine 1 kapak görseli (eğer hâlâ sadece default varsa)

import "dotenv/config.js"; // sende farklıysa eski ayarını kullan
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Business from "../models/Business.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Varsayılan kapak (sadece tespit için)
const DEFAULT_IMAGE = "/defaults/edogrula-default.webp.png";

// Kaynak & hedef klasörler
const SRC_DIR = path.join(__dirname, "..", "savibu-images");
const INDEX_PATH = path.join(SRC_DIR, "index.json");
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "savibu");

// Hedef klasörü oluştur
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function hasRealGallery(biz) {
  const g = biz.gallery;
  if (!Array.isArray(g) || g.length === 0) return false;

  // default dışındaki herhangi bir string "gerçek" kabul
  return g.some((x) => {
    if (typeof x !== "string") return false;
    const v = x.trim();
    if (!v) return false;
    if (v === DEFAULT_IMAGE) return false;
    if (v.startsWith("/defaults/")) return false;
    return true;
  });
}

function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findBusinessForSlug(slug) {
  if (!slug) return null;

  // 1) Tam slug eşleşmesi
  let biz = await Business.findOne({ slug });
  if (biz) return biz;

  // 2) Case-insensitive slug
  biz = await Business.findOne({
    slug: new RegExp(`^${escapeRegex(slug)}$`, "i"),
  });
  if (biz) return biz;

  // 3) Slug’tan isim tahmini ile name üzerinden arama (sadece source: savibu)
  const nameGuess = slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (nameGuess.length > 3) {
    biz = await Business.findOne({
      source: "savibu",
      name: new RegExp(escapeRegex(nameGuess), "i"),
    });
    if (biz) return biz;
  }

  return null;
}

async function main() {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/edogrula";

  console.log("🚀 Mongo'ya bağlanılıyor:", uri);
  await mongoose.connect(uri);
  console.log("✅ Mongo bağlantısı kuruldu.");

  if (!fs.existsSync(INDEX_PATH)) {
    console.error("❌ index.json bulunamadı:", INDEX_PATH);
    process.exit(1);
  }

  const raw = fs.readFileSync(INDEX_PATH, "utf8");
  const records = JSON.parse(raw || "[]");
  console.log("📄 index.json kayıt sayısı:", records.length);

  const seenSlugs = new Set();

  let matched = 0;
  let updated = 0;
  let skippedHasGallery = 0;
  let notFound = 0;
  let copyErrors = 0;
  let updateErrors = 0;

  for (const rec of records) {
    try {
      const slug = rec.slug;
      if (!slug) continue;

      // Aynı slug için birden fazla kayıt varsa sadece ilkini kullan
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      const fileName = rec.fileName;
      if (!fileName) {
        console.warn(`⚠ fileName yok, atlandı: ${slug}`);
        continue;
      }

      const srcPath = path.join(SRC_DIR, fileName);
      if (!fs.existsSync(srcPath)) {
        console.warn(`⚠ Kaynak görsel bulunamadı: ${srcPath}`);
        continue;
      }

      const biz = await findBusinessForSlug(slug);

      if (!biz) {
        console.log(`❌ İşletme bulunamadı (slug): ${slug}`);
        notFound++;
        continue;
      }

      if (biz.source && biz.source !== "savibu") {
        console.log(
          `⚠ İşletme kaynağı savibu değil (${biz.source}), atlandı: ${biz.name}`
        );
        continue;
      }

      matched++;

      if (hasRealGallery(biz)) {
        // Başvuru / manuel gerçek görselleri varsa hiç dokunma
        skippedHasGallery++;
        continue;
      }

      // Görseli uploads/savibu altına kopyala
      const destPath = path.join(UPLOAD_DIR, fileName);
      if (!fs.existsSync(destPath)) {
        try {
          fs.copyFileSync(srcPath, destPath);
          console.log(`⬇ Kopyalandı: ${fileName}`);
        } catch (err) {
          console.error("❌ Görsel kopyalanamadı:", err.message);
          copyErrors++;
          continue;
        }
      }

      // DB'de kullanılacak yol
      const dbPath = `/uploads/savibu/${fileName}`;

      // ❗ Burada artık biz.save() yok, sadece updateOne ve validation kapalı
      await Business.updateOne(
        { _id: biz._id },
        {
          $set: {
            gallery: [dbPath],
            cover: dbPath,
            image: dbPath,
            imageUrl: dbPath,
            updatedAt: new Date(),
          },
        },
        { runValidators: false }
      );

      updated++;
      console.log(`✅ Güncellendi: "${biz.name}" -> ${dbPath}`);
    } catch (err) {
      updateErrors++;
      console.error("❌ Tekil kayıt güncellenirken hata:", err.message);
      // devam et
    }
  }

  console.log("\n🎯 Özet:");
  console.log("  index.json kayıt       :", records.length);
  console.log("  benzersiz slug         :", seenSlugs.size);
  console.log("  eşleşen işletme        :", matched);
  console.log("  güncellenen işletme    :", updated);
  console.log("  gerçek galerisi olan   :", skippedHasGallery);
  console.log("  işletme bulunamayan    :", notFound);
  console.log("  kopyalama hatası       :", copyErrors);
  console.log("  update hatası          :", updateErrors);

  await mongoose.disconnect();
  console.log("👋 Mongo bağlantısı kapatıldı. Bitti.");
}

main().catch((err) => {
  console.error("GENEL HATA:", err);
  process.exit(1);
});
