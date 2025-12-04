// exportNonBlacklistedBusinesses.js
// Kara listede OLMAYAN işletmeleri EXCEL (.xlsx) olarak dışa aktarır.
//
// Sütunlar:
// A: işletme adı
// B: instagram kullanıcı adı
// C: telefon numarası
// D: mail adresi
// E: websitesi

import "dotenv/config";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

import Business from "./models/Business.js";
import Blacklist from "./models/Blacklist.js";

/* =========== path helper =========== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========== küçük helper =========== */
function value(v) {
  return v == null ? "" : String(v).trim();
}

async function main() {
  try {
    const mongoUri =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      process.env.DB_URI;

    if (!mongoUri) {
      console.error("❌ MONGO_URI / MONGODB_URI / DB_URI tanımlı değil.");
      process.exit(1);
    }

    console.log("⏳ MongoDB'ye bağlanılıyor...");
    await mongoose.connect(mongoUri);
    console.log("✅ MongoDB bağlantısı OK.");

    // 1) Kara listedeki telefonları çek
    // Not: şemanda alan ismi farklıysa phone yerine onu yaz (ör: phoneNumber)
    const blacklistedPhones = await Blacklist.distinct("phone");
    console.log("📛 Kara listedeki telefon sayısı:", blacklistedPhones.length);

    // 2) Kara listede OLMAYAN işletmeleri çek
    const businesses = await Business.find({
      phone: { $nin: blacklistedPhones },
    }).lean();

    console.log("📊 Export edilecek işletme sayısı:", businesses.length);

    // 3) Excel veri dizisi (Array of Arrays)
    const data = [];

    // Başlık satırı
    data.push([
      "işletme adı",
      "instagram kullanıcı adı",
      "telefon numarası",
      "mail adresi",
      "websitesi",
    ]);

    // Veri satırları
    for (const b of businesses) {
      const name =
        b.name ||
        b.businessName ||
        b.title ||
        "";

      const insta =
        b.instagramUsername ||
        b.instagramUser ||
        b.instagram ||
        b.instagramUrl ||
        b.socialInstagram ||
        "";

      const phone =
        b.phone ||
        b.phoneNumber ||
        b.gsm ||
        b.contactPhone ||
        "";

      const email =
        b.email ||
        b.mail ||
        b.contactEmail ||
        "";

      const website =
        b.website ||
        b.site ||
        b.url ||
        b.web ||
        "";

      data.push([
        value(name),
        value(insta),
        value(phone),
        value(email),
        value(website),
      ]);
    }

    // 4) Excel çalışma sayfası + kitap oluştur
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "İşletmeler");

    // 5) Dosyayı yaz
    const outPath = path.resolve(
      __dirname,
      "edogrula_isletmeler_not_blacklisted.xlsx"
    );
    XLSX.writeFile(workbook, outPath);

    console.log("🎉 Excel export tamam!");
    console.log("   Dosya:", outPath);
    console.log("   İşletme (satır) sayısı:", businesses.length);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Export sırasında hata:", err);
    process.exit(1);
  }
}

main();
