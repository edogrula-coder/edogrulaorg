// backend/debugGallery.js
import "dotenv/config";
import mongoose from "mongoose";
import Business from "./models/Business.js";

const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  await mongoose.connect(MONGO);
  const slug = "kule-sapanca"; // burada istediğin slug'ı dene

  const biz = await Business.findOne({ slug }).lean();
  if (!biz) {
    console.log("İşletme bulunamadı");
  } else {
    console.log("İşletme:", biz.name, "slug:", biz.slug);
    console.log("galleryAbs:", biz.galleryAbs);
    console.log("photos:", biz.photos);
    console.log("images:", biz.images);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
