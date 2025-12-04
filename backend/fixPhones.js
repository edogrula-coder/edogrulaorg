// backend/fixPhones.js
import "dotenv/config";
import mongoose from "mongoose";
import Business from "./models/Business.js";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Mongo bağlandı");

  const docs = await Business.find({
    $or: [
      { phone: /undefined/i },
      { phones: /undefined/i },
    ],
  });

  console.log("Düzeltilecek kayıt:", docs.length);

  for (const biz of docs) {
    const all = (biz.phones || [])
      .concat(biz.phone || [])
      .filter((x) => !!x && String(x).toLowerCase() !== "undefined");

    biz.phone = all[0] || undefined;
    biz.phones = all;
    await biz.save();
  }

  await mongoose.disconnect();
  console.log("Bitti.");
}

main().catch(console.error);
