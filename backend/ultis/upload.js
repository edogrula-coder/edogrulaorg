// backend/utils/uploadApplyDocs.js
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "verifications");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// MIME ↔ ext whitelist
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

const extFromMime = (mime = "") => {
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("pdf")) return ".pdf";
  return "";
};

// Multer storage: güvenli dosya adı
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Klasör hazır değilse oluştur
    fs.mkdir(UPLOAD_ROOT, { recursive: true }, (err) => cb(err, UPLOAD_ROOT));
  },
  filename: (_req, file, cb) => {
    const rand = crypto.randomBytes(8).toString("hex");
    const ts = Date.now().toString(36);

    // Uzantıyı belirle: önce orijinal, whitelist değilse MIME'dan
    const origExt = (path.extname(file.originalname) || "").toLowerCase();
    const safeExt = ALLOWED_EXTS.has(origExt) ? origExt : extFromMime(file.mimetype) || ".bin";

    cb(null, `${ts}-${rand}${safeExt}`);
  },
});

// MIME + ext çift doğrulama
const fileFilter = (_req, file, cb) => {
  const okMime = ALLOWED_MIMES.has(file.mimetype);
  const okExt = ALLOWED_EXTS.has((path.extname(file.originalname) || "").toLowerCase());
  if (okMime && okExt) return cb(null, true);
  if (okMime) return cb(null, true); // bazı istemciler yanlış uzantı gönderebilir; MIME doğruysa kabul
  return cb(new Error("Dosya türü desteklenmiyor (JPG, PNG, WEBP, PDF)"));
};

export const uploadApplyDocs = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10,                  // max 10 dosya
  },
});

// Relative path (her zaman) → "/uploads/verifications/<name>"
export const filePublicPath = (filename = "") =>
  `/uploads/verifications/${String(path.basename(filename))}`.replace(/\/{2,}/g, "/");

// Tam URL üret (opsiyonel req). Öncelik: FILE_BASE_URL > req (proto+host) > relative
export const filePublicUrl = (filename = "", req) => {
  const rel = filePublicPath(filename);
  const baseEnv = (process.env.FILE_BASE_URL || "").replace(/\/+$/, "");
  if (baseEnv) return `${baseEnv}${rel}`;
  if (req) {
    const proto =
      (Array.isArray(req.headers["x-forwarded-proto"])
        ? req.headers["x-forwarded-proto"][0]
        : req.headers["x-forwarded-proto"]) || req.protocol || "http";
    const host = req.get?.("host");
    if (host) return `${proto}://${host}${rel}`;
  }
  // geri dönüş (relative)
  return rel;
};
