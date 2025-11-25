// backend/scripts/seedBlacklistExample.js
import "dotenv/config";
import mongoose from "mongoose";
import Blacklist from "../models/Blacklist.js";

async function run() {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });

  const payload = {
    name: "Test Dolandırıcı Mağaza",
    instagramUsername: "testdolandirici",
    instagramUrl: "https://instagram.com/testdolandirici",
    phone: "+905551112233",
    desc: "Deneme kaydı: Ödeme alıp ürün göndermeyen sahte hesap. Sadece geliştirme/test içindir.",
    status: "confirmed",
    fingerprints: [
      {
        type: "instagram",
        value: "testdolandirici",
        label: "Instagram kullanıcı adı",
      },
      {
        type: "phone",
        value: "+905551112233",
        label: "WhatsApp / iletişim numarası",
      },
      {
        type: "iban",
        value: "TR001234567890123456789012",
        label: "Ödeme yapılan IBAN",
      },
    ],
    isDeleted: false,
  };

  const doc = await Blacklist.create(payload);
  console.log("Seed blacklist created with id:", doc._id.toString());
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
