/* eslint-disable no-console */
/**
 * Minimal Excel → Mongo importer (native driver upsert)
 * Kolonlar: title, address, phone, instagram, instagram kullanıcı adı
 */
import 'dotenv/config';
import fs from 'fs';
import mongoose from 'mongoose';
// ESM için doğru xlsx importu
import * as XLSX from 'xlsx/xlsx.mjs';
XLSX.set_fs(fs);
import slugify from 'slugify';
import Business from '../models/Business.js';

/* ---------- helpers ---------- */
const digitsOnly = (s='') => String(s ?? '').replace(/\D/g,'');
const toTRPhone = (raw='') => {
  const d = digitsOnly(raw);
  if (!d) return '';
  if (d.startsWith('90') && d.length===12) return '0'+d.slice(2);
  if (d.length===10 && d.startsWith('5'))  return '0'+d;
  if (d.length===11 && d.startsWith('0'))  return d;
  return d;
};
const normIG = (url='') => {
  if (!url) return '';
  const s = String(url).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^instagram\.com\//i.test(s)) return 'https://'+s;
  return s;
};
const igUsernameFromUrl = (url='') => {
  const m = String(url).match(/instagram\.com\/([^/?#]+)/i);
  return m?.[1]?.replace(/\/+$/,'') || '';
};
const makeSlug = (name='') => slugify(String(name||'').trim(), { lower:true, strict:true, locale:'tr' });

const findHeader = (headers, cands) =>
  headers.find(h => cands.map(c=>c.toLowerCase()).includes(String(h).toLowerCase())) || null;
const getVal = (row, header) => (header ? String(row[header] ?? '').trim() : '');

/* ---------- main ---------- */
async function main() {
  const FILE = process.argv[2];
  const DRY  = process.argv.includes('--dry');
  const VERIFIED = process.argv.includes('--verified');
  const STATUS = (process.argv.find(a => a.startsWith('--status=')) || '').split('=')[1];

  if (!FILE || !fs.existsSync(FILE)) {
    console.error('Kullanım: node scripts/import_min.js <dosya.xlsx> [--dry] [--verified] [--status=approved]');
    process.exit(2);
  }

  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
  console.log('✓ Mongo bağlandı');

  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!rows.length) { console.error('Sayfada satır yok.'); process.exit(1); }

  const headers = Object.keys(rows[0]);
  const H = {
    title:     findHeader(headers, ['title','başlık','name','isim','ad']),
    address:   findHeader(headers, ['address','adres']),
    phone:     findHeader(headers, ['phone','telefon','tel']),
    instagram: findHeader(headers, ['instagram']),
    igUser:    findHeader(headers, ['instagram kullanıcı adı','instagram_kullanıcı_adı','instagramusername','ig_username']),
  };

  const coll = Business.collection; // 👈 native driver koleksiyonu
  let ok=0, fail=0;

  for (let i=0;i<rows.length;i++) {
    try {
      const title   = getVal(rows[i], H.title);
      const address = getVal(rows[i], H.address);
      const phone   = toTRPhone(getVal(rows[i], H.phone));
      const igUrl   = normIG(getVal(rows[i], H.instagram));
      const igUser  = getVal(rows[i], H.igUser) || igUsernameFromUrl(igUrl);
      const slug    = makeSlug(title || igUser || phone);

      // upsert doc
      const doc = {
        name: title || undefined,
        slug,
        handle: slug,
        type: 'Bungalow',
        address: address || undefined,
        phone: phone || undefined,                 // string olarak yaz
        instagramUrl: igUrl || undefined,
        instagramUsername: igUser || undefined,
        updatedAt: new Date(),
      };
      if (VERIFIED) doc.verified = true;
      if (STATUS)   doc.status = STATUS;

      const filter = {
        $or: [
          { slug },
          igUser ? { instagramUsername: igUser } : null,
          phone  ? { phone } : null,
        ].filter(Boolean),
      };

      if (DRY) {
        console.log('[DRY] filter=', filter, ' update=', doc);
      } else {
        await coll.updateOne(filter, { $set: doc }, { upsert: true });
      }
      ok++;
    } catch (e) {
      fail++; console.error(`[${i+1}] HATA:`, e.message);
    }
  }

  console.log(`\nBİTTİ → OK: ${ok}, HATA: ${fail}`);
  await mongoose.disconnect();
  process.exit(0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
