// scripts/savibu_load_to_edogrula.js
// Proje "type": "module" olduğu için ES module söz dizimi kullanıyoruz.

import { MongoClient } from "mongodb";
import xlsx from "xlsx";

// Excel dosyanın tam yolu (Masaüstü)
const EXCEL_PATH = "C:\\Users\\hp\\Desktop\\savibu_isletmeler.xlsx";

// Atlas bağlantın
const MONGO_URI =
  "mongodb+srv://edogrulaorg:287388726Bt.@cluster0.cjyaa8t.mongodb.net/edogrula?retryWrites=true&w=majority&appName=Cluster0";

function slugify(name) {
  if (!name) return "isletme";
  name = String(name).trim().toLowerCase();
  const trMap = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u" };
  name = name
    .split("")
    .map((ch) => trMap[ch] || ch)
    .join("");
  name = name.replace(/[^a-z0-9]+/g, "-");
  name = name.replace(/^-+|-+$/g, "");
  return name || "isletme";
}

function normalizeIgUsername(raw) {
  if (raw === null || raw === undefined) return "";
  let u = String(raw).trim();
  if (!u) return "";

  u = u
    .replace("https://", "")
    .replace("http://", "")
    .replace("www.instagram.com/", "")
    .replace("instagram.com/", "");
  u = u.split("?")[0].trim().replace(/^@/, "").replace(/\/+$/, "");

  if (!u) return "";

  const parts = u.split("/").filter(Boolean);
  if (!parts.length) return "";
  return parts[0].toLowerCase();
}

function buildIgUrl(username) {
  if (!username) return "";
  return `https://www.instagram.com/${username}/`;
}

function mapType(cat) {
  if (cat === null || cat === undefined) return "business";
  const c = String(cat).toLowerCase();
  if (c.includes("bungalov")) return "bungalov";
  if (c.includes("villa")) return "villa";
  if (c.includes("glamping")) return "glamping";
  return "business";
}

function normalizePhone(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  let s = String(raw).trim();

  if (/e\+/i.test(s)) {
    const num = Number(s);
    if (!isNaN(num)) s = String(num);
  }

  s = s.replace(/[()\s-]/g, "");
  let d = s.replace(/\D/g, "");

  if (d.length === 10) d = "0" + d;
  if (d.length < 10) return "";

  return d;
}

function normalizeRow(raw) {
  const out = {};
  for (const key of Object.keys(raw)) {
    const normKey = String(key).trim().toLowerCase();
    out[normKey] = raw[key];
  }
  return out;
}

async function run() {
  // 1) Excel oku
  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  if (!rawRows.length) {
    console.error("Excel boş veya okunamadı.");
    process.exit(1);
  }

  const docs = [];

  for (const raw of rawRows) {
    const row = normalizeRow(raw);

    const name =
      (row["isletme_adi"] ||
        row["i̇sletme_adi"] || // olası encoding
        row["isletme adı"] ||
        row["name"] ||
        "").toString().trim();

    if (!name) continue;

    const kategori = row["kategori"] || "";
    const adres =
      (row["adres_bilgi"] ||
        row["adres"] ||
        "").toString().trim() || null;

    const phone = normalizePhone(
      row["telefon"] ||
        row["tel"] ||
        row["phone"]
    );

    const igRaw =
      row["instagramk.adı"] ||
      row["instagramkadi"] ||
      row["instagram_kadi"] ||
      row["instagram"] ||
      "";

    const igUsername = normalizeIgUsername(igRaw);
    const igUrl = igUsername ? buildIgUrl(igUsername) : "";

    const doc = {
      name,
      slug: slugify(name),
      phone: phone || null,
      instagramUrl: igUrl || null,
      instagramUsername: igUsername || null,
      address: adres,
      city: "Sapanca",
      type: mapType(kategori),
      status: "active",
      verified: true,
      source: "savibu",
    };

    docs.push(doc);
  }

  if (!docs.length) {
    console.error("Hiç geçerli kayıt üretilmedi. Excel kolonlarını kontrol et.");
    process.exit(1);
  }

  console.log(`Hazırlanan döküman sayısı: ${docs.length}`);

  // 2) Mongo'ya bas
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db("edogrula");
    const col = db.collection("businesses");

    const result = await col.insertMany(docs);
    console.log(`MongoDB'ye eklenen kayıt sayısı: ${result.insertedCount}`);
  } catch (err) {
    console.error("Mongo insert hatası:", err);
  } finally {
    await client.close();
  }
}

run();
