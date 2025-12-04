// backend/rewriteGalleryAbsHost.js
import "dotenv/config";
import mongoose from "mongoose";
import Business from "./models/Business.js";

const OLD_BASE =
  "https://8b9130add04efb3a9de50cb4ae2b6d31.r2.cloudflarestorage.com/edogrula-uploads";
const NEW_BASE = process.env.R2_PUBLIC_BASE;

async function main() {
  console.log("🧠 Mongo bağlanıyor...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Mongo bağlı.");

  const cursor = Business.find({ galleryAbs: { $exists: true, $ne: [] } }).cursor();
  let touched = 0;

  for await (const biz of cursor) {
    const old = biz.galleryAbs || [];
    const mapped = old.map((u) =>
      typeof u === "string" && u.startsWith(OLD_BASE)
        ? NEW_BASE + u.slice(OLD_BASE.length)
        : u
    );

    const changed =
      mapped.length !== old.length ||
      mapped.some((v, i) => v !== old[i]);

    if (!changed) continue;

    biz.galleryAbs = mapped;
    await biz.save();
    touched++;
    console.log("🔁 Güncellendi:", biz.slug || biz.name);
  }

  console.log("🎉 Biten işletme sayısı:", touched);
  await mongoose.disconnect();
  console.log("🔌 Mongo bağlantısı kapatıldı.");
}

main().catch((err) => {
  console.error("🔥 Genel hata:", err);
  process.exit(1);
});
