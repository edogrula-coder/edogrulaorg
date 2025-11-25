// backend/scripts/syncSavibuCovers_v2.js
// Savibu kapak görsellerini slug + instagram + telefon ile eşleştirir.

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import Business from "../models/Business.js"; // senin projende nasıl ise öyle bırak

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env'yi backend klasöründen yükle
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ---- Dosya yolları ----
// Savibu'dan indirdiğimiz görseller ve index.json
const SAVIBU_DIR = path.join(__dirname, "..", "savibu-images");
const INDEX_FILE = path.join(SAVIBU_DIR, "index.json");

// Kapakların kopyalanacağı public klasörü
// Bunu sen daha önce nereye yazdıysak ona göre değiştirirsin:
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const COVER_DIR = path.join(PUBLIC_DIR, "uploads", "business-covers");
// Veritabanına yazılacak URL prefix
const COVER_URL_PREFIX = "/uploads/business-covers";

// ------------------ yardımcılar ------------------

function normalizePhone(raw) {
  return (raw || "").replace(/\D+/g, ""); // sadece rakam
}

function normalizeInsta(raw) {
  return (raw || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function pickImageFilename(item) {
  // index.json içindeki muhtemel alan isimleri
  return (
    item.imageFile ||
    item.image ||
    item.filename ||
    `${item.slug}.jpg`
  );
}

// ------------------ ana iş ------------------

async function main() {
  console.log("🚀 Mongo'ya bağlanılıyor:", process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Mongo bağlantısı kuruldu.");

  if (!fs.existsSync(INDEX_FILE)) {
    console.error("❌ INDEX bulunamadı:", INDEX_FILE);
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  console.log("📄 Savibu index kayıt sayısı:", index.length);

  // Tüm savibu işletmeleri çek
  const businesses = await Business.find({ source: "savibu" });
  console.log("🏢 Mongo'da savibu kaynaklı işletme sayısı:", businesses.length);

  // Map'ler oluştur
  const bySlug = new Map();
  const byInsta = new Map();
  const byPhone = new Map();

  for (const biz of businesses) {
    if (biz.slug) bySlug.set(biz.slug, biz);

    const instaKey = normalizeInsta(biz.instagramUsername);
    if (instaKey) {
      if (!byInsta.has(instaKey)) byInsta.set(instaKey, []);
      byInsta.get(instaKey).push(biz);
    }

    const phoneKey = normalizePhone(biz.phone || biz.mobile);
    if (phoneKey) {
      if (!byPhone.has(phoneKey)) byPhone.set(phoneKey, []);
      byPhone.get(phoneKey).push(biz);
    }
  }

  if (!fs.existsSync(COVER_DIR)) {
    fs.mkdirSync(COVER_DIR, { recursive: true });
  }

  let updated = 0;
  let notFound = 0;
  let ambiguous = 0;

  for (const item of index) {
    const slug = item.slug;
    const insta = normalizeInsta(
      item.instagramUsername || item.instagram || item.ig
    );
    const phone = normalizePhone(item.phone || item.tel || item.gsm);

    let biz = null;

    // 1) slug ile dene
    if (slug && bySlug.has(slug)) {
      biz = bySlug.get(slug);
    }

    // 2) slug başarısızsa, instagram ile dene
    if (!biz && insta) {
      const arr = byInsta.get(insta) || [];
      if (arr.length === 1) {
        biz = arr[0];
      } else if (arr.length > 1) {
        console.log(
          `⚠️ Insta çakışması @${insta} ->`,
          arr.map((b) => b.slug).join(", ")
        );
        ambiguous++;
        continue;
      }
    }

    // 3) hâlâ yoksa, telefon ile dene
    if (!biz && phone) {
      const arr = byPhone.get(phone) || [];
      if (arr.length === 1) {
        biz = arr[0];
      } else if (arr.length > 1) {
        console.log(
          `⚠️ Telefon çakışması ${phone} ->`,
          arr.map((b) => b.slug).join(", ")
        );
        ambiguous++;
        continue;
      }
    }

    if (!biz) {
      // Bu logların arasında CSV'deki firmalar da olacak
      console.log("❌ Eşleşemedi:", slug, "-", item.name);
      notFound++;
      continue;
    }

    const imgFile = pickImageFilename(item);
    const srcPath = path.join(SAVIBU_DIR, imgFile);
    const destPath = path.join(COVER_DIR, imgFile);

    if (!fs.existsSync(srcPath)) {
      console.log("⚠️ Kaynak görsel yok:", srcPath);
      continue;
    }

    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log("⬇ Kopyalandı:", imgFile);
    }

    const url = `${COVER_URL_PREFIX}/${imgFile}`;

    // İstersen burada "sadece default ise değiştir" kontrolü ekleyebilirsin.
    biz.coverImage = url;

    if (!Array.isArray(biz.gallery) || biz.gallery.length === 0) {
      biz.gallery = [url];
    } else if (!biz.gallery.includes(url)) {
      biz.gallery.unshift(url);
    }

    await biz.save();
    updated++;
    console.log(`✅ Güncellendi: ${biz.name} (${biz.slug})`);
  }

  console.log("========== ÖZET ==========");
  console.log("🟢 Güncellenen:", updated);
  console.log("❌ Eşleşmeyen:", notFound);
  console.log("⚠️ Çakışma (insta/telefon birden fazla eşleşti):", ambiguous);

  await mongoose.disconnect();
  console.log("👋 Mongo bağlantısı kapatıldı. Bitti.");
}

main().catch((err) => {
  console.error("GENEL HATA:", err);
  process.exit(1);
});
