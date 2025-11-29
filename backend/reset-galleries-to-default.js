// backend/reset-galleries-to-default.js
import "dotenv/config";
import mongoose from "mongoose";
import Business from "./models/Business.js";

// Tüm işletmelere yazılacak standart görsel yolu
const DEFAULT_IMAGE = "/defaults/edogrula-default.webp.png";

async function main() {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      console.error("MONGODB_URI veya MONGO_URI tanımlı değil!");
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log("MongoDB bağlandı");

    const result = await Business.updateMany(
      {}, // tüm işletmeler
      {
        $set: {
          gallery: [DEFAULT_IMAGE], // eski tüm görselleri sil, sadece bu kalsın
        },
      }
    );

    console.log("Güncellenen işletme sayısı:", result.modifiedCount);
    await mongoose.disconnect();
    console.log("Bitti, bağlantı kapatıldı");
    process.exit(0);
  } catch (err) {
    console.error("Hata:", err);
    process.exit(1);
  }
}

main();
