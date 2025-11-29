// backend/routes/uploads.business.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Upload kök klasörü: proje kökünde "uploads"
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

// Klasörü güvenli oluşturan helper
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Disk storage ayarı
const storage = multer.diskStorage({
  destination(req, file, cb) {
    // slug varsa klasör isimlendirmesinde kullan
    const rawSlug = (req.body.slug || "business").toString().toLowerCase();
    const safeSlug = rawSlug
      .replace(/[^a-z0-9\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "business";

    const dir = path.join(UPLOAD_ROOT, safeSlug);
    ensureDir(dir);
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || "";
    const base = path
      .basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "file";

    const ts = Date.now();
    cb(null, `${base}-${ts}${ext}`);
  },
});

const upload = multer({ storage });

// Dosyayı API cevabına map’leyen helper
function mapFile(f) {
  // f.path: .../uploads/<slug>/file-123.jpg
  const rel = path.relative(UPLOAD_ROOT, f.path); // <slug>/file-123.jpg
  const url = "/uploads/" + rel.replace(/\\/g, "/"); // /uploads/<slug>/file-123.jpg

  return {
    url,            // frontend genelde bunu kullanacak
    path: url,      // yedek
    filename: f.filename,
    originalName: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
  };
}

// Ortak handler
function handleUpload(req, res) {
  const files = Array.isArray(req.files) ? req.files.map(mapFile) : [];
  return res.json({ files });
}

// Public
router.post(
  "/uploads/business",
  upload.array("files", 10),
  handleUpload
);

// Admin (aynı handler, sadece path farklı)
router.post(
  "/admin/uploads/business",
  upload.array("files", 10),
  handleUpload
);

export default router;
