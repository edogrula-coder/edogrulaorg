import "dotenv/config";
import mongoose from "mongoose";
import Business from "../models/Business.js";

const DEFAULT_PHOTO = "/defaults/edogrula-default.webp.png";

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI tanımlı değil");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });

  console.log("✅ Mongo bağlandı, görseli olmayan işletmeler güncelleniyor...");

  const res = await Business.updateMany(
    {
      $and: [
        {
          $or: [
            { photo: { $exists: false } },
            { photo: null },
            { photo: "" },
            { photo: " " },
          ],
        },
        {
          $or: [
            { gallery: { $exists: false } },
            { gallery: null },
            { gallery: { $size: 0 } },
          ],
        },
      ],
    },
    {
      $set: { photo: DEFAULT_PHOTO },
    }
  );

  console.log(`🖼️ Default görsel eklenen işletme: ${res.modifiedCount}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});
