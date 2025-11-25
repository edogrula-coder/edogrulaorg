// backend/scripts/scrapeSavibuImages.js
// SAVİBU kategori sayfalarındaki tüm ilanları gezip
// her ilan için 1 kapak görseli indirir. (ESM versiyon)

import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = "https://savibu.org.tr";

const CATEGORY_URLS = [
  "https://savibu.org.tr/kategori/bungalov-isletmeleri",
  "https://savibu.org.tr/kategori/villa-isletmeleri",
  "https://savibu.org.tr/kategori/glamping-isletmeleri",
];

// Görsellerin ineceği klasör
const IMAGE_DIR = path.join(__dirname, "..", "savibu-images");
fs.mkdirSync(IMAGE_DIR, { recursive: true });

const SLEEP_MS = 400; // istersen 0 yaparsın

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 30_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; edogrula-scraper/1.0; +https://e-dogrula.org)",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  return String(res.data);
}

// Kategori sayfasından ilan linklerini çek
function extractDetailUrls(html) {
  const urls = new Set();

  // href=".../ilan/...”
  const re = /href="([^"]*\/ilan\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1].trim();
    if (!u || u.startsWith("javascript:")) continue;

    if (!/^https?:\/\//i.test(u)) {
      if (!u.startsWith("/")) u = "/" + u;
      u = ROOT + u;
    }
    // #anchor vs. temizle
    u = u.split("#")[0];
    urls.add(u);
  }

  return Array.from(urls);
}

// İlan detay sayfasından kapak görseli URL'lerini çek
function extractImageUrls(html) {
  const imgs = new Set();

  // 1) Direkt pattern: "/assets/upload/ilan/....(jpg|png|webp)"
  const reDirect =
    /["'](\/assets\/upload\/ilan\/[^"']+\.(?:jpe?g|png|webp))["']/gi;
  let m;
  while ((m = reDirect.exec(html))) {
    const rel = m[1];
    const full = ROOT + rel;
    imgs.add(full);
  }

  // 2) Yine de kaçan olursa genel <img src>’lerden filtrele
  const reImg = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((m = reImg.exec(html))) {
    let src = m[1];
    if (!src) continue;
    if (!/\/assets\/upload\/ilan\//.test(src)) continue;

    if (!/^https?:\/\//i.test(src)) {
      if (!src.startsWith("/")) src = "/" + src;
      src = ROOT + src;
    }
    imgs.add(src.split("?")[0]);
  }

  return Array.from(imgs);
}

async function downloadImage(url, filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const res = await axios.get(url, {
    responseType: "stream",
    timeout: 60_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; edogrula-scraper/1.0; +https://e-dogrula.org)",
    },
  });

  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    res.data.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
}

function slugFromDetailUrl(detailUrl) {
  try {
    const u = new URL(detailUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "unknown";
  } catch {
    return "unknown";
  }
}

async function main() {
  console.log("🏁 SAVİBU görsel indirme başlıyor...");
  console.log("📂 Hedef klasör:", IMAGE_DIR);

  const allRecords = [];

  for (const catUrl of CATEGORY_URLS) {
    console.log("\n==============================");
    console.log("📑 Kategori:", catUrl);

    try {
      const html = await fetchHtml(catUrl);
      const detailUrls = extractDetailUrls(html);
      console.log("🔗 Bulunan ilan linki sayısı:", detailUrls.length);

      let i = 0;
      for (const detailUrl of detailUrls) {
        i++;
        const slug = slugFromDetailUrl(detailUrl);

        console.log(
          `\n[${i}/${detailUrls.length}] 🏠 İşletme: ${slug} -> ${detailUrl}`
        );

        const extDefault = ".jpg";
        let fileName = null;

        try {
          await sleep(SLEEP_MS);

          const detailHtml = await fetchHtml(detailUrl);
          const images = extractImageUrls(detailHtml);

          if (!images.length) {
            console.warn("  ⚠ Görsel bulunamadı, atlandı.");
            continue;
          }

          const imgUrl = images[0]; // kapak olarak ilkini al
          const urlObj = new URL(imgUrl);
          const ext = path.extname(urlObj.pathname) || extDefault;

          fileName = `${slug}${ext}`;
          const filePath = path.join(IMAGE_DIR, fileName);

          if (fs.existsSync(filePath)) {
            console.log("  ✔ Görsel zaten var, indirme atlandı.");
          } else {
            console.log("  ⬇ İndiriliyor:", imgUrl);
            await downloadImage(imgUrl, filePath);
            console.log("  ✅ Kaydedildi:", fileName);
          }

          allRecords.push({
            slug,
            category: catUrl,
            detailUrl,
            imageUrl: imgUrl,
            fileName,
          });
        } catch (err) {
          console.error("  ❌ Hata:", err.message);
        }
      }
    } catch (err) {
      console.error("❌ Kategori okunamadı:", catUrl, err.message);
    }
  }

  const indexPath = path.join(IMAGE_DIR, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(allRecords, null, 2), "utf8");

  console.log("\n==============================");
  console.log("🏁 Bitti!");
  console.log("📊 Toplam kayıt:", allRecords.length);
  console.log("📄 JSON indeks:", indexPath);
}

// ES module entrypoint
main().catch((err) => {
  console.error("GENEL HATA:", err);
  process.exit(1);
});
