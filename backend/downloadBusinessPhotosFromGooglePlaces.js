// downloadBusinessPhotosFromGooglePlaces.js
// İşletmeler Excel'inden Google Places üzerinden 4-5 görsel indirir.
//
// Girdi:  edogrula_isletmeler_enriched.xlsx (varsa)
//   yoksa: edogrula_isletmeler_not_blacklisted.xlsx
//
// Çıktı: business_photos/<index>_<slug-name>/photo_1.jpg ...

import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import * as XLSXRaw from "xlsx";
import axios from "axios";

// CJS / ESM uyum fix'i
const XLSX = XLSXRaw.default || XLSXRaw;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const LANG = process.env.GOOGLE_PLACES_LANG_DEFAULT || "tr";
const API_TIMEOUT = Number(process.env.GOOGLE_API_TIMEOUT_MS || "8000");
const MAX_PHOTOS_PER_PLACE = 5;

// Excel'deki kolon isimleri (senin dosyadaki Türkçe başlıklar)
const COL_NAME = "işletme adı";
const COL_GOOGLE_ADDRESS = "google_adres"; // enriched dosyadan gelmiş olabilir

if (!API_KEY) {
  console.error("❌ GOOGLE_PLACES_API_KEY tanımlı değil (.env)!");
  process.exit(1);
}

// Girdi Excel'ini seç
const ENRICHED_PATH = path.resolve(
  __dirname,
  "edogrula_isletmeler_enriched.xlsx"
);
const PLAIN_PATH = path.resolve(
  __dirname,
  "edogrula_isletmeler_not_blacklisted.xlsx"
);

const INPUT_XLSX = fs.existsSync(ENRICHED_PATH) ? ENRICHED_PATH : PLAIN_PATH;

if (!fs.existsSync(INPUT_XLSX)) {
  console.error("❌ Girdi Excel dosyası bulunamadı:");
  console.error("   ", ENRICHED_PATH);
  console.error("   ", PLAIN_PATH);
  process.exit(1);
}

const OUTPUT_DIR = path.resolve(__dirname, "business_photos");

function safe(v) {
  return v == null ? "" : String(v).trim();
}

function slugify(str) {
  return safe(str)
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 60);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchPlace(query) {
  const url = "https://maps.googleapis.com/maps/api/place/textsearch/json";
  const res = await axios.get(url, {
    params: {
      key: API_KEY,
      language: LANG,
      query,
    },
    timeout: API_TIMEOUT,
  });
  const data = res.data;
  if (!data.results || data.results.length === 0) return null;
  return data.results[0];
}

async function getPlaceDetails(placeId) {
  const url = "https://maps.googleapis.com/maps/api/place/details/json";
  const res = await axios.get(url, {
    params: {
      key: API_KEY,
      language: LANG,
      place_id: placeId,
      fields: "name,photos,formatted_address,url",
    },
    timeout: API_TIMEOUT,
  });
  return res.data.result || null;
}

async function downloadPhoto(photoRef, destPath) {
  const url = "https://maps.googleapis.com/maps/api/place/photo";
  const res = await axios.get(url, {
    params: {
      key: API_KEY,
      maxwidth: 1600,
      photoreference: photoRef,
    },
    responseType: "arraybuffer",
    timeout: API_TIMEOUT,
    maxRedirects: 5,
  });

  fs.writeFileSync(destPath, res.data);
}

async function main() {
  console.log("📂 Excel okunuyor:", INPUT_XLSX);
  const wb = XLSX.readFile(INPUT_XLSX);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  console.log("📊 Toplam satır:", rows.length);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let totalDownloaded = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = safe(row[COL_NAME]);

    if (!name) continue;

    const addressHint =
      safe(row[COL_GOOGLE_ADDRESS]) || "Sapanca, Sakarya, Türkiye";

    const query = `${name} ${addressHint}`;

    console.log(`🔎 [${i + 1}/${rows.length}] Aranıyor: ${query}`);

    try {
      const place = await searchPlace(query);
      if (!place) {
        console.log("   ➜ Sonuç bulunamadı.");
        continue;
      }

      const details = await getPlaceDetails(place.place_id);
      if (!details || !details.photos || details.photos.length === 0) {
        console.log("   ➜ Bu işletme için fotoğraf bulunamadı.");
        continue;
      }

      const dirName = `${String(i + 1).padStart(4, "0")}_${slugify(name)}`;
      const placeDir = path.join(OUTPUT_DIR, dirName);
      fs.mkdirSync(placeDir, { recursive: true });

      const photos = details.photos.slice(0, MAX_PHOTOS_PER_PLACE);

      let idx = 1;
      for (const p of photos) {
        const ref = p.photo_reference;
        if (!ref) continue;

        const dest = path.join(placeDir, `photo_${idx}.jpg`);
        console.log(`   ⬇️  Fotoğraf ${idx} indiriliyor...`);
        try {
          await downloadPhoto(ref, dest);
          totalDownloaded++;
        } catch (err) {
          console.log("     ⚠️ Foto indirme hatası:", err.message);
        }
        idx++;
        await sleep(300); // fotoğraflar arası ufak bekleme
      }

      console.log(
        `   ✅ ${photos.length} fotoğraf işlendi (${placeDir} klasörüne).`
      );

      // Her işletme sonrası ufak bekleme (rate limit için)
      await sleep(500);
    } catch (err) {
      console.log("   ⚠️ İşletme için hata:", err.message);
    }
  }

  console.log("🎉 İşlem bitti, toplam indirilen fotoğraf:", totalDownloaded);
  console.log("   Klasör:", OUTPUT_DIR);
}

main().catch((e) => {
  console.error("❌ Genel hata:", e);
  process.exit(1);
});
