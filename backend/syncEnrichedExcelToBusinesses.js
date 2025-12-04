// backend/syncEnrichedExcelToBusinesses.js
import "dotenv/config";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import Business from "./models/Business.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mongo bağlantısı
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/edogrula";

const EXCEL_FILE = path.join(__dirname, "edogrula_isletmeler_enriched.xlsx");

// --------- küçük yardımcılar ---------
const clean = (s) =>
  typeof s === "string" ? s.trim() : s == null ? "" : String(s).trim();

const slugify = (str = "") =>
  clean(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const isBlank = (v) => {
  const s = clean(v);
  if (!s) return true;
  const low = s.toLowerCase();
  return low === "undefined" || low === "null" || low === "nan";
};

const pick = (row, ...keys) => {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k)) {
      const v = row[k];
      if (!isBlank(v)) return clean(v);
    }
  }
  return "";
};

// --------- ana script ---------
async function main() {
  try {
    console.log("🧠 Mongo bağlanıyor...");
    await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || undefined,
    });
    console.log("✅ Mongo bağlı.");

    console.log("📂 Excel okunuyor:", EXCEL_FILE);
    const wb = XLSX.readFile(EXCEL_FILE);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    console.log("Toplam satır:", rows.length);

    let total = 0;
    let matched = 0;
    let updated = 0;
    let notFound = 0;

    for (const row of rows) {
      total++;

      // Excel kolon isimleri (ekranda gördüklerimiz):
      const name = pick(
        row,
        "işletme adı",
        "İşletme adı",
        "İşletme Adı",
        "isletme adi",
        "isletme_adi",
        "name"
      );
      if (!name) continue;

      const slug = slugify(name);

      const igUser = pick(
        row,
        "instagram kullanıcı adı",
        "Instagram kullanıcı adı",
        "instagram_kullanıcı_adı",
        "instagram",
        "handle"
      );
      const phoneExcel = pick(
        row,
        "telefon numarası",
        "Telefon numarası",
        "telefon",
        "telefon_numarasi"
      );
      const mailExcel = pick(
        row,
        "mail adresi",
        "Mail adresi",
        "mail",
        "email"
      );
      const webExcel = pick(row, "websitesi", "website", "site");

      const googlePhone = pick(row, "google_telefon");
      const googleWebsite = pick(row, "google_websitesi");
      const googleAddress = pick(row, "google_adres");
      const googleMapsUrl = pick(row, "google_maps_url");

      const biz = await Business.findOne({ slug });

      if (!biz) {
        notFound++;
        console.log(`⚠️  Bulunamadı: [${slug}] "${name}"`);
        continue;
      }

      matched++;

      const patch = {};

      // Instagram: hem instagramUsername hem handle boşsa, Excel'den doldur
      if (
        igUser &&
        isBlank(biz.instagramUsername) &&
        isBlank(biz.handle)
      ) {
        patch.instagramUsername = igUser;
      }

      // Telefon: boşsa Excel/Google'dan doldur (fixPhones zaten çoğunu düzeltti)
      const bestPhone = phoneExcel || googlePhone;
      if (bestPhone && isBlank(biz.phone)) {
        patch.phone = bestPhone;
      }

      // Mail: boşsa doldur
      if (mailExcel && isBlank(biz.email)) {
        patch.email = mailExcel;
      }

      // Website: boşsa Excel, yoksa Google websitesi
      const bestWeb = webExcel || googleWebsite;
      if (bestWeb && isBlank(biz.website)) {
        patch.website = bestWeb;
      }

      // Adres: boşsa google_adres'i hem address'e hem location.address'e yaz
      if (googleAddress && isBlank(biz.address)) {
        patch.address = googleAddress;
        const loc = biz.location || {};
        if (isBlank(loc.address)) {
          patch.location = { ...loc, address: googleAddress };
        }
      }

      // Google Maps URL: varsa her zaman güncelle (yeni alan, eksiksiz olsun)
      if (googleMapsUrl && googleMapsUrl !== biz.googleMapsUrl) {
        patch.googleMapsUrl = googleMapsUrl;
      }

      if (!Object.keys(patch).length) {
        // Bu satır için eklenecek yeni bilgi yok
        continue;
      }

      await Business.findOneAndUpdate(
        { _id: biz._id },
        { $set: patch },
        {
          new: false,
          runValidators: true,
          context: "query",
        }
      );

      updated++;
      console.log(
        `✅ [${slug}] güncellendi → ${Object.keys(patch).join(", ")}`
      );
    }

    console.log("\n📊 Özet");
    console.log("Toplam satır:", total);
    console.log("Eşleşen işletme:", matched);
    console.log("Güncellenen işletme:", updated);
    console.log("Bulunamayan işletme:", notFound);
  } catch (err) {
    console.error("🔥 Genel hata:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Mongo bağlantısı kapatıldı.");
  }
}

main();
