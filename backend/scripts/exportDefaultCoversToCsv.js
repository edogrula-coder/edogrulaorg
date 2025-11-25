// backend/scripts/exportDefaultCoversToCsv.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportPath = path.join(__dirname, "reports", "business-cover-report.json");
const outPath = path.join(__dirname, "reports", "only-default-businesses.csv");

function toCsvValue(v) {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  if (s.includes(";") || s.includes("\n") || s.includes('"')) {
    return `"${s}"`;
  }
  return s;
}

function main() {
  if (!fs.existsSync(reportPath)) {
    console.error("❌ Rapor bulunamadı:", reportPath);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const rows = data.onlyDefault || [];

  const headers = [
    "id",
    "name",
    "slug",
    "city",
    "type",
    "status",
    "source",
    "phone",
    "instagramUsername",
  ];

  const lines = [];
  lines.push(headers.join(";"));

  for (const b of rows) {
    const line = [
      b._id,
      b.name,
      b.slug,
      b.city,
      b.type,
      b.status,
      b.source,
      b.phone,
      b.instagramUsername,
    ].map(toCsvValue).join(";");
    lines.push(line);
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log("📁 CSV oluşturuldu:", outPath);
  console.log("🧮 Satır sayısı:", rows.length);
}

main();
