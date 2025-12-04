// enrichBusinessesWithGooglePlaces.js
// edogrula_isletmeler_not_blacklisted.xlsx içindeki işletmelerin
// eksik telefon / website / adres bilgilerini Google Places API ile
// doldurur ve yeni bir Excel üretir.
//
// Girdi:  edogrula_isletmeler_not_blacklisted.xlsx (ilk sayfa)
// Çıktı:  edogrula_isletmeler_enriched.xlsx

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSXRaw from "xlsx";
import axios from "axios";

// 🔧 CJS / ESM uyum hack'i
const XLSX = XLSXRaw.default || XLSXRaw;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const LANG = process.env.GOOGLE_PLACES_LANG_DEFAULT || "tr";
const API_TIMEOUT = Number(process.env.GOOGLE_API_TIMEOUT_MS || "8000");

if (!API_KEY) {
  console.error("❌ GOOGLE_PLACES_API_KEY tanımlı değil (.env)!");
  process.exit(1);
}

// Hangi dosyadan okuyacağız / hangi dosyaya yazacağız
const INPUT_XLSX = path.resolve(
  __dirname,
  "edogrula_isletmeler_not_blacklisted.xlsx"
);
const OUTPUT_XLSX = path.resolve(
  __dirname,
  "edogrula_isletmeler_enriched.xlsx"
);

// Excel’deki kolon başlıkları
const COL_NAME = "işletme adı";
const COL_PHONE = "telefon numarası";
const COL_WEBSITE = "websitesi";

// Sabit olarak Sapanca dersen:
const DEFAULT_LOCATION = "Sapanca, Sakarya, Türkiye";

// Küçük bekleme (rate-limit yememek için)
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
  return data.results[0]; // en iyi eşleşme
}

async function getPlaceDetails(placeId) {
  const url = "https://maps.googleapis.com/maps/api/place/details/json";
  const res = await axios.get(url, {
    params: {
      key: API_KEY,
      language: LANG,
      place_id: placeId,
      fields:
        "name,formatted_phone_number,website,url,formatted_address",
    },
    timeout: API_TIMEOUT,
  });
  return res.data.result || null;
}

function safe(v) {
  return v == null ? "" : String(v).trim();
}

async function main() {
  console.log("📂 Excel okunuyor:", INPUT_XLSX);
  const wb = XLSX.readFile(INPUT_XLSX); // ← artık çalışacak
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  // Satırları, başlığı anahtar kabul ederek Object listesi olarak okuyalım
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  console.log("📊 Toplam satır:", rows.length);

  let processed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = safe(row[COL_NAME]);

    if (!name) {
      continue;
    }

    // Zaten telefon + website doluysa uğraşmaya gerek yok
    const hasPhone = safe(row[COL_PHONE]) !== "";
    const hasWebsite = safe(row[COL_WEBSITE]) !== "";

    if (hasPhone && hasWebsite) {
      continue;
    }

    const query = `${name} ${DEFAULT_LOCATION}`;
    console.log(`🔎 [${i + 1}/${rows.length}] Aranıyor:`, query);

    try {
      const place = await searchPlace(query);
      if (!place) {
        console.log("   ➜ Sonuç bulunamadı.");
        continue;
      }

      const details = await getPlaceDetails(place.place_id);
      if (!details) {
        console.log("   ➜ Detay alınamadı.");
        continue;
      }

      const gPhone = safe(details.formatted_phone_number);
      const gWebsite = safe(details.website);
      const gAddress = safe(details.formatted_address);
      const gMapsUrl = safe(details.url);

      // Eğer Excel’de boşsa, Google’dan geleni ana kolona yaz
      if (!hasPhone && gPhone) {
        row[COL_PHONE] = gPhone;
      }
      if (!hasWebsite && gWebsite) {
        row[COL_WEBSITE] = gWebsite;
      }

      // Ek bilgi olarak yeni kolonlara da yazalım
      row["google_telefon"] = gPhone;
      row["google_websitesi"] = gWebsite;
      row["google_adres"] = gAddress;
      row["google_maps_url"] = gMapsUrl;

      console.log(
        `   ✅ Bulundu: tel=${gPhone || "-"} | web=${gWebsite || "-"}`
      );

      processed++;
      // Küçük bekleme
      await sleep(300);
    } catch (err) {
      console.log("   ⚠️ Hata:", err.message);
    }
  }

  console.log("✅ Güncellenen satır sayısı:", processed);

  // Yeni workbook / sheet oluşturup kaydedelim
  const newSheet = XLSX.utils.json_to_sheet(rows);
  const newWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWb, newSheet, "İşletmeler");
  XLSX.writeFile(newWb, OUTPUT_XLSX);

  console.log("🎉 İşlem tamam, çıktı dosyası:");
  console.log("   ", OUTPUT_XLSX);
}

main().catch((e) => {
  console.error("❌ Genel hata:", e);
  process.exit(1);
});
