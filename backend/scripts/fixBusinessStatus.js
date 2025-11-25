// backend/scripts/fixBusinessStatus.js
// Eski 'active' / 'passive' statülerini yeni enum'a çevirir.

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Business from "../models/Business.js";

async function main() {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/edogrula";

  console.log("🚀 Mongo'ya bağlanılıyor:", uri);
  await mongoose.connect(uri);
  console.log("✅ Mongo bağlantısı kuruldu.");

  // active -> approved
  const resActive = await Business.updateMany(
    { status: "active" },
    { $set: { status: "approved" } },
    { runValidators: false }
  );

  // passive -> archived (ya da istersen 'rejected' yap)
  const resPassive = await Business.updateMany(
    { status: "passive" },
    { $set: { status: "archived" } },
    { runValidators: false }
  );

  console.log("🔄 active  -> approved :", resActive.modifiedCount);
  console.log("🔄 passive -> archived :", resPassive.modifiedCount);

  await mongoose.disconnect();
  console.log("👋 Mongo bağlantısı kapatıldı. Bitti.");
}

main().catch((err) => {
  console.error("GENEL HATA:", err);
  process.exit(1);
});
