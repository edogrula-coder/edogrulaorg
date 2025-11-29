// backend/import-blacklists-from-excel.js
import "dotenv/config";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import Blacklist from "./models/Blacklist.js";

// xlsx ESM/CJS farkını burada çözüyoruz
const XLSXLib = XLSX.default || XLSX;

// --- BURAYI SADECE DOSYA ADI İÇİN DÜZENLE --- //
const EXCEL_FILE = "dolandirici_isletmeler.xlsx"; // kendi dosya adın
// -------------------------------------------- //

async function main() {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      console.error("MONGODB_URI / MONGO_URI tanımlı değil!");
      process.exit(1);
    }

    console.log("MongoDB'ye bağlanılıyor...");
    await mongoose.connect(uri);
    console.log("MongoDB bağlı ✅");

    console.log("Excel okunuyor:", EXCEL_FILE);

    // !!! FARKLI OLAN KISIM BURASI !!!
    const wb = XLSXLib.readFile(EXCEL_FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSXLib.utils.sheet_to_json(ws, { defval: "" });

    console.log("Excel satır sayısı:", rows.length);

    const docs = [];

    for (const row of rows) {
      const name = String(row["İşletme adı"] || "").trim();
      const phone = String(row["İşletme Telefonu"] || "").trim();
      const instagramCell = String(row["Instagram"] || "").trim();
      const website = String(row["web sitesi"] || "").trim();
      const tespit = String(row["Tespitler:"] || "").trim();
      const aciklama = String(row["Açıklama:"] || "").trim();
      const magdur = String(row["Mağdur:"] || "").trim();
      const magdurEmail = String(row["Mağdur E-posta"] || "").trim();
      const magdurPhone = String(row["Mağdur Telefon"] || "").trim();

      if (!name && !instagramCell && !phone) continue;

      let instagramUsername = "";
      let instagramUrl = "";

      if (instagramCell) {
        if (/instagram\.com/i.test(instagramCell)) {
          instagramUrl = instagramCell;
          const m = instagramCell.match(/instagram\.com\/([^/?#]+)/i);
          if (m && m[1]) instagramUsername = "@" + m[1];
        } else {
          instagramUsername = instagramCell.startsWith("@")
            ? instagramCell
            : "@" + instagramCell;
          instagramUrl = `https://instagram.com/${instagramUsername.replace("@", "")}`;
        }
      }

      const descParts = [];
      if (tespit) descParts.push(`Tespit: ${tespit}`);
      if (aciklama) descParts.push(`Açıklama: ${aciklama}`);
      if (magdur) descParts.push(`Mağdur: ${magdur}`);
      if (magdurEmail) descParts.push(`Mağdur e-posta: ${magdurEmail}`);
      if (magdurPhone) descParts.push(`Mağdur telefon: ${magdurPhone}`);

      const desc = descParts.join(" | ");

      docs.push({
        name,
        phone,
        instagramUsername,
        instagramUrl,
        website: website || undefined,
        desc,
        isDeleted: false,
      });
    }

    console.log("Oluşturulan blacklist doküman sayısı:", docs.length);

    if (!docs.length) {
      console.log("Eklenecek kayıt yok, çıkıyorum.");
      await mongoose.disconnect();
      process.exit(0);
    }

    // DİKKAT: TÜM BLACKLISTİ SİLMEK İSTERSEN yorum satırını aç:
    // await Blacklist.deleteMany({});

    const result = await Blacklist.insertMany(docs, { ordered: false });
    console.log("Veritabanına eklenen kayıt sayısı:", result.length);

    await mongoose.disconnect();
    console.log("✔ İşlem bitti, bağlantı kapatıldı.");
    process.exit(0);
  } catch (err) {
    console.error("Hata:", err);
    process.exit(1);
  }
}

main();
