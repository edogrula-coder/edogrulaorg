// backend/scripts/setDefaultBusinessImages.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import Business from "../models/Business.js";

dotenv.config({ path: ".env" }); // backend/.env kullanıyorsan yolu buna göre ayarla

const DEFAULT_IMG = "/defaults/edogrula-default.webp.png";

async function run() {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      console.error("MONGO_URI tanımlı değil!");
      process.exit(1);
    }

    console.log("Mongo'ya bağlanılıyor...");
    await mongoose.connect(uri);

    // gallery alanı yok, null veya boş dizi olan işletmeler
    const filter = {
      $or: [
        { gallery: { $exists: false } },
        { gallery: null },
        { gallery: { $size: 0 } },
      ],
    };

    const update = {
      $set: {
        gallery: [DEFAULT_IMG],
      },
    };

    const res = await Business.updateMany(filter, update);
    console.log(
      `✅ Default görsel atandı. modifiedCount: ${res.modifiedCount}, matchedCount: ${res.matchedCount}`
    );

    await mongoose.disconnect();
    console.log("Mongo bağlantısı kapatıldı. Bitti. 🙌");
    process.exit(0);
  } catch (err) {
    console.error("Hata:", err);
    process.exit(1);
  }
}

run();
