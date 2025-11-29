// backend/lib/r2.js
import { S3Client } from "@aws-sdk/client-s3";

if (!process.env.R2_ACCESS_KEY_ID) {
  console.error("❌ R2_ACCESS_KEY_ID .env içinde eksik!");
  process.exit(1);
}

if (!process.env.R2_SECRET_ACCESS_KEY) {
  console.error("❌ R2_SECRET_ACCESS_KEY .env içinde eksik!");
  process.exit(1);
}

if (!process.env.R2_BUCKET_URL) {
  console.error("❌ R2_BUCKET_URL .env içinde eksik!");
  process.exit(1);
}

// Cloudflare R2 → S3-compatible endpoint
// Örnek: https://8b91xxxxxx.r2.cloudflarestorage.com
const endpoint = process.env.R2_BUCKET_URL;

export const r2Client = new S3Client({
  region: "auto", // Cloudflare R2 böyle istiyor
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
