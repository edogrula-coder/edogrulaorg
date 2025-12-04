// uploadBusinessPhotosToR2.js — Cloudflare R2 toplu yükleme (Ultra Pro)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Lokal klasör (indirdiğin fotolar)
const localDir = path.join(__dirname, "business_photos");

// ✅ Env değişkenleri
const bucket = process.env.R2_BUCKET_NAME;
const endpoint = process.env.R2_BUCKET_URL; // account-level endpoint (bucket yok!)
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
  console.error("❌ R2 env değişkenleri eksik! (.env dosyanı kontrol et)");
  console.error({
    R2_BUCKET_NAME: bucket,
    R2_BUCKET_URL: endpoint,
    R2_ACCESS_KEY_ID: !!accessKeyId,
    R2_SECRET_ACCESS_KEY: !!secretAccessKey,
  });
  process.exit(1);
}

console.log("🌐 R2 endpoint:", endpoint);
console.log("🪣 R2 bucket:", bucket);

const s3 = new S3Client({
  region: "auto",
  endpoint,                // https://<accountid>.r2.cloudflarestorage.com
  forcePathStyle: true,    // 🔥 ÖNEMLİ: virtual-host değil path-style
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

function guessMime(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function uploadFile(filePath, key) {
  const fileContent = fs.readFileSync(filePath);

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileContent,
    ContentType: guessMime(filePath),
  });

  try {
    await s3.send(cmd);
    console.log("✅ Yüklendi:", key);
  } catch (err) {
    console.error("🔥 Yükleme hatası:", key, "-", err.name, err.message);
    // İstersen burada process.exit(1) diyerek tamamen durdurabilirsin
  }
}

async function main() {
  console.log("📤 R2 yükleme başlıyor...");

  if (!fs.existsSync(localDir)) {
    console.error("❌ business_photos klasörü bulunamadı:", localDir);
    return;
  }

  const folders = fs.readdirSync(localDir);
  let total = 0;

  for (const folder of folders) {
    const folderPath = path.join(localDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    console.log(`\n📂 Klasör: ${folder}`);
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const key = `business_photos/${folder}/${file}`;
      await uploadFile(filePath, key);
      total++;
    }
  }

  console.log("\n🎉 Bitti! Toplam yüklenen dosya:", total);
}

main().catch((err) => {
  console.error("🔥 Genel hata:", err);
});
