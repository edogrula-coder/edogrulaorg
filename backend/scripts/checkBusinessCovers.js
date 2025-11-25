// backend/scripts/checkBusinessCovers.js
// Mongo'daki işletmelerin kapak / gallery durumunu raporlar.
// - Gerçek görseli olanlar
// - Sadece default edogrula görseli olanlar
// - Hiç gallery'si olmayanlar

import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import Business from "../models/Business.js"; // Gerekirse { Business } diye düzelt

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default görseli tespit eden yardımcı
function isDefaultImage(u) {
  if (!u) return false;
  const s = String(u).toLowerCase();
  // Bizim default'lar genelde "edogrula-default" içeriyor
  return s.includes("edogrula-default");
}

// İşletmeden rapora koyulacak minimal bilgi
function pickInfo(b) {
  return {
    _id: b._id,
    name: b.name,
    slug: b.slug,
    city: b.city,
    type: b.type,
    status: b.status,
    source: b.source,
    phone: b.phone,
    instagramUsername: b.instagramUsername,
  };
}

async function main() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1/edogrula";

  console.log("🚀 Mongo'ya bağlanılıyor:", mongoUri);
  await mongoose.connect(mongoUri);
  console.log("✅ Mongo bağlantısı kuruldu.");

  // Hafif olması için lean() ile alıyoruz
  const all = await Business.find({}).lean();
  console.log("📊 Toplam işletme:", all.length);

  const noGallery = [];
  const onlyDefault = [];
  const hasReal = [];

  for (const b of all) {
    const gallery = Array.isArray(b.gallery)
      ? b.gallery.filter(Boolean)
      : [];

    if (!gallery.length) {
      noGallery.push(pickInfo(b));
      continue;
    }

    const realImages = gallery.filter((u) => !isDefaultImage(u));

    if (realImages.length === 0) {
      // Sadece default kapaklar var
      onlyDefault.push({
        ...pickInfo(b),
        gallery,
      });
    } else {
      hasReal.push({
        ...pickInfo(b),
        gallery,
      });
    }
  }

  const summary = {
    total: all.length,
    hasReal: hasReal.length,
    onlyDefault: onlyDefault.length,
    noGallery: noGallery.length,
  };

  console.log("📌 Özet:");
  console.log("   ✔ Gerçek görseli olan   :", summary.hasReal);
  console.log("   ⚪ Sadece default görsel :", summary.onlyDefault);
  console.log("   ⭕ Hiç gallery olmayan   :", summary.noGallery);

  // JSON raporu kaydet
  const reportsDir = path.join(__dirname, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const outPath = path.join(reportsDir, "business-cover-report.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    summary,
    onlyDefault,
    noGallery,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log("📁 JSON rapor oluşturuldu:", outPath);

  await mongoose.disconnect();
  console.log("👋 Mongo bağlantısı kapatıldı. Bitti.");
}

main().catch((err) => {
  console.error("❌ GENEL HATA:", err);
  process.exit(1);
});
