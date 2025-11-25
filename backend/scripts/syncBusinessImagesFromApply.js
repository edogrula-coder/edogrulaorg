// backend/scripts/syncBusinessImagesFromApply.js
import "dotenv/config";
import mongoose from "mongoose";
import Business from "../models/Business.js";
import ApplyRequest from "../models/ApplyRequest.js";

const DEFAULT_IMG = "/defaults/edogrula-default.webp.png";

// Sondaki 10 haneyle eşleştireceğiz (TR numaraları için gayet iş görür)
const digits = (v) => String(v || "").replace(/\D/g, "");
const last10 = (v) => {
  const d = digits(v);
  return d.length >= 10 ? d.slice(-10) : null;
};

const igHandle = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/(@?[\w.]+)/i);
  const u = m ? m[1] : s;
  return u.replace(/^@/, "").toLowerCase();
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log("✅ Mongo'ya bağlanıldı.");

  // 1) Tüm business'ları memory'ye al, telefon & insta map'i kur
  const businesses = await Business.find().lean();
  const byPhone = new Map();
  const byIg = new Map();

  for (const b of businesses) {
    const pKey = last10(b.phone);
    if (pKey && !byPhone.has(pKey)) byPhone.set(pKey, b);

    const h = igHandle(b.instagramUsername || b.instagramUrl);
    if (h && !byIg.has(h)) byIg.set(h, b);
  }

  console.log(
    `📊 İşletme haritası hazır. phoneKeys=${byPhone.size}, igHandles=${byIg.size}`
  );

  // 2) Görseli olan başvuruları çek
  const applies = await ApplyRequest.find({
    images: { $exists: true, $ne: [], $not: { $size: 0 } },
  }).lean();

  console.log(`🔍 Görseli olan başvuru sayısı: ${applies.length}`);

  let total = 0;
  let matched = 0;
  let updated = 0;
  let skippedRealGallery = 0;
  let noBusiness = 0;

  for (const app of applies) {
    total++;

    const pKey =
      last10(app.phoneMobile) || last10(app.phoneFixed);
    const h = igHandle(app.instagram);

    let biz =
      (pKey && byPhone.get(pKey)) ||
      (h && byIg.get(h));

    if (!biz) {
      noBusiness++;
      console.log(
        `⚠️ Eşleşen business yok: "${app.businessName}" (${app._id.toString()})`
      );
      continue;
    }

    matched++;

    const imgs = (app.images || []).filter(Boolean);
    if (!imgs.length) continue;

    // İşletmenin zaten gerçek galerisi varsa zorlamayalım
    const hasRealGallery =
      Array.isArray(biz.gallery) &&
      biz.gallery.length > 0 &&
      biz.gallery.some((g) => g && !g.includes("/defaults/"));

    if (hasRealGallery) {
      skippedRealGallery++;
      continue;
    }

    const newGallery = imgs.slice(0, 5);

    const res = await Business.updateOne(
      { _id: biz._id },
      {
        $set: { gallery: newGallery },
      }
    );

    if (res.modifiedCount) {
      updated++;
      console.log(
        `✅ Güncellendi: "${biz.name}" -> ${newGallery.length} görsel`
      );
    }
  }

  console.log("🎯 Özet:", {
    totalApplies: total,
    matchedBusinesses: matched,
    updatedBusinesses: updated,
    skippedRealGallery,
    noBusiness,
  });

  await mongoose.disconnect();
  console.log("👋 Mongo bağlantısı kapatıldı.");
}

main().catch((err) => {
  console.error("💥 Hata:", err);
  process.exit(1);
});
