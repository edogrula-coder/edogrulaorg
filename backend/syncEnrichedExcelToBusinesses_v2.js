// backend/syncEnrichedExcelToBusinesses_v2.js
// Excel'deki zenginleştirilmiş verileri işletmelere işler (Ultra Pro v3)
// NOT: findOneAndUpdate / updateOne / upsert YOK, sadece findOne + save()

import "dotenv/config";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import Business from "./models/Business.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/edogrula";

const EXCEL_FILE = path.join(
  __dirname,
  "edogrula_isletmeler_enriched.xlsx"
);

// ========== küçük yardımcılar ==========
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

const escapeRegex = (s) =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ========== asıl: satırdan işletme bulucu ==========
async function findBusinessForRow({ slug, name, igUser, phoneExcel, googlePhone }) {
  // 1) slug ile dene
  if (slug) {
    const bySlug = await Business.findOne({ slug }).exec();
    if (bySlug) return bySlug;
  }

  // 2) instagram handle ile dene
  const igRaw = clean(igUser).replace(/^@+/, "").toLowerCase();
  if (igRaw) {
    const byHandle = await Business.findOne({ handle: igRaw }).exec();
    if (byHandle) return byHandle;

    const byIgUsername = await Business.findOne({
      instagramUsername: "@" + igRaw,
    }).exec();
    if (byIgUsername) return byIgUsername;
  }

  // 3) telefon ile dene (son 10 haneye göre)
  const phoneRaw = clean(phoneExcel || googlePhone);
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, "");
    const last10 =
      digits.length > 10 ? digits.slice(-10) : digits;

    if (last10) {
      const phoneRegex = new RegExp(last10 + "$");
      const byPhone = await Business.findOne({
        $or: [
          { phone: phoneRegex },
          { phones: { $elemMatch: { $regex: phoneRegex } } },
        ],
      }).exec();
      if (byPhone) return byPhone;
    }
  }

  // 4) isim ile dene (bire bir & case-insensitive)
  if (name) {
    // tam eşit isim
    const byNameExact = await Business.findOne({ name }).exec();
    if (byNameExact) return byNameExact;

    // regex ile, küçük/büyük harf duyarsız
    const safe = escapeRegex(name);
    const byNameRegex = await Business.findOne({
      name: { $regex: "^" + safe + "$", $options: "i" },
    }).exec();
    if (byNameRegex) return byNameRegex;
  }

  return null;
}

// ========== ana script ==========
async function main() {
  try {
    console.log("🧠 Mongo bağlanıyor... [enriched v3-match]");
    await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || undefined,
    });
    console.log("✅ Mongo bağlı. [enriched v3-match]");

    console.log("📂 Excel okunuyor:", EXCEL_FILE);
    const wb = XLSX.readFile(EXCEL_FILE);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    console.log("Toplam satır:", rows.length);

    let total = 0;
    let matched = 0;
    let updated = 0;
    let notFound = 0;
    let failed = 0;

    for (const row of rows) {
      total++;

      try {
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

        // 🔍 Artık akıllı eşleştirici kullanıyoruz
        const biz = await findBusinessForRow({
          slug,
          name,
          igUser,
          phoneExcel,
          googlePhone,
        });

        if (!biz) {
          notFound++;
          console.log(`⚠️  Bulunamadı: [${slug}] "${name}"`);
          continue;
        }

        matched++;
        let changed = false;

        // --- Instagram ---
        if (
          igUser &&
          isBlank(biz.instagramUsername) &&
          isBlank(biz.handle)
        ) {
          biz.instagramUsername = igUser;
          changed = true;
        }

        // --- Telefon: sadece ana phone alanını dolduruyoruz ---
        const bestPhone = phoneExcel || googlePhone;
        if (bestPhone && isBlank(biz.phone)) {
          biz.phone = bestPhone;
          changed = true;
        }

        // --- Mail ---
        if (mailExcel && isBlank(biz.email)) {
          biz.email = mailExcel;
          changed = true;
        }

        // --- Website (Excel > Google) ---
        const bestWeb = webExcel || googleWebsite;
        if (bestWeb && isBlank(biz.website)) {
          biz.website = bestWeb;
          changed = true;
        }

        // --- Adres + location.address ---
        if (googleAddress && isBlank(biz.address)) {
          biz.address = googleAddress;
          const loc = biz.location || {};
          if (isBlank(loc.address)) {
            biz.location = { ...loc, address: googleAddress };
          }
          changed = true;
        }

        // --- Google Maps URL: şemada alan olmasa da doc üstüne yazabiliriz ---
        if (googleMapsUrl && isBlank(biz.googleMapsUrl)) {
          biz.googleMapsUrl = googleMapsUrl;
          changed = true;
        }

        if (!changed) continue;

        await biz.save();
        updated++;
        console.log(`✅ [${biz.slug}] güncellendi (${biz.name})`);
      } catch (rowErr) {
        failed++;
        console.error("🔥 Satır hatası:", rowErr.message);
      }
    }

    console.log("\n📊 Özet");
    console.log("Toplam satır:", total);
    console.log("Eşleşen işletme:", matched);
    console.log("Güncellenen işletme:", updated);
    console.log("Bulunamayan işletme:", notFound);
    console.log("Satır hatası:", failed);
  } catch (err) {
    console.error("🔥 Genel hata:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Mongo bağlantısı kapatıldı.");
  }
}

main();
