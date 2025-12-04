// testR2.js — R2 erişim testi (bucket + put)
import "dotenv/config";
import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.R2_BUCKET_URL;      // senin env'de bu var
const bucket = process.env.R2_BUCKET_NAME;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

console.log("🧪 ENV KONTROL");
console.log("endpoint:", endpoint);
console.log("bucket:", bucket);
console.log("access len:", (accessKeyId || "").length);
console.log("secret len:", (secretAccessKey || "").length);

const s3 = new S3Client({
  region: "auto",
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

async function main() {
  // 1) Bu bucket var mı + erişim var mı?
  try {
    console.log("🔍 HeadBucket...");
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log("✅ HeadBucket OK (bucket erişilebilir)");
  } catch (err) {
    console.error(
      "🔥 HeadBucket Hata:",
      err.name,
      err.Code || err.code,
      err.message
    );
  }

  // 2) İçini listelemeyi deneriz (yetkin varsa)
  try {
    console.log("📃 ListObjectsV2...");
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 })
    );
    console.log(
      "✅ ListObjects OK, ilk anahtarlar:",
      (res.Contents || []).map((o) => o.Key)
    );
  } catch (err) {
    console.error(
      "🔥 ListObjects Hata:",
      err.name,
      err.Code || err.code,
      err.message
    );
  }

  // 3) Küçük bir test dosyası yazalım
  try {
    const key = "test/edogrula-test.txt";
    console.log("📤 PutObject test:", key);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: `Merhaba R2 👋 ${new Date().toISOString()}\n`,
        ContentType: "text/plain; charset=utf-8",
      })
    );
    console.log("✅ PutObject OK:", key);
  } catch (err) {
    console.error(
      "🔥 PutObject Hata:",
      err.name,
      err.Code || err.code,
      err.message
    );
  }
}

main().catch((e) => console.error("💥 Fatal:", e));
