// backend/routes/upload.js — R2 + İşletme Medyası Ultra Pro
import express from "express";
import multer from "multer";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "../lib/r2.js";
import crypto from "crypto";
import Business from "../models/Business.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* =========================================================
   Multer: dosyayı hafızada tut (disk yok)
========================================================= */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* =========================================================
   Cloudflare R2 config
========================================================= */
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const BUCKET_URL = (process.env.R2_BUCKET_URL || "").replace(/\/+$/, "");

if (!BUCKET_NAME || !BUCKET_URL) {
  console.warn(
    "[R2] Uyarı: R2_BUCKET_NAME veya R2_BUCKET_URL tanımlı değil. Upload çalışmayabilir."
  );
}

/* =========================================================
   Yardımcılar
========================================================= */

// Random key üret
function randomKey(originalName = "file") {
  const parts = String(originalName).split(".");
  const ext = parts.length > 1 ? `.${parts.pop()}` : "";
  const id = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
  return `uploads/${id}${ext}`;
}

// Public URL üret
function makePublicUrl(key) {
  return `${BUCKET_URL}/${key}`;
}

// Tek dosyayı R2'ye yükle ve normalize obje döndür
async function uploadFileToR2(file, extraMeta = {}) {
  if (!file) return null;

  const original = file.originalname || "file.bin";
  const key = randomKey(original);

  console.log("📦 [R2 PUT] key=", key, "size=", file.size, "type=", file.mimetype);

  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || "application/octet-stream",
    })
  );

  const url = makePublicUrl(key);

  const mapped = {
    key,
    url,          // tam public URL
    path: url,    // frontend için de aynı
    originalName: original,
    size: file.size,
    mimetype: file.mimetype,
    uploadedAt: new Date().toISOString(),
    ...extraMeta,
  };

  console.log("✅ [R2 OK] url=", url);

  return mapped;
}

/* =========================================================
   1) Basit generic upload endpointleri
      (başka yerlerde de kullanılabilir)
========================================================= */

// Tek dosya (field: file)
router.post("/single", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Dosya bulunamadı" });
    }

    const mapped = await uploadFileToR2(req.file);

    console.log("📤 [UPLOAD /single] key=", mapped?.key);

    return res.json({
      success: true,
      file: mapped,
      url: mapped?.url,
      key: mapped?.key,
    });
  } catch (err) {
    console.error("💥 [UPLOAD /single ERROR]", err);
    return res
      .status(500)
      .json({ success: false, error: "Upload failed", details: err.message });
  }
});

// Çoklu dosya (field: files)
router.post("/multiple", upload.array("files", 5), async (req, res) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ success: false, error: "Dosya yok" });
    }

    const uploaded = [];
    for (const file of req.files) {
      const mapped = await uploadFileToR2(file);
      if (mapped) uploaded.push(mapped);
    }

    console.log(
      "📤 [UPLOAD /multiple] count=",
      uploaded.length,
      "keys=",
      uploaded.map((u) => u.key)
    );

    return res.json({ success: true, files: uploaded });
  } catch (err) {
    console.error("💥 [UPLOAD /multiple ERROR]", err);
    return res
      .status(500)
      .json({ success: false, error: "Upload failed", details: err.message });
  }
});

/* =========================================================
   2) İşletme medyası upload (kapak / galeri / belgeler)
      - POST /api/uploads/business
      - POST /api/admin/uploads/business
      (server.js içinde: apiRouter.use(uploadRoutes); olduğu için
       buradaki path'ler /api ile birleşiyor)
========================================================= */

async function handleBusinessUpload(req, res, next) {
  try {
    console.log("🎯 [UPLOAD BUSINESS] body=", req.body);
    console.log(
      "🎯 [UPLOAD BUSINESS] files=",
      (req.files || []).map((f) => f.originalname)
    );

    const { kind, businessId } = req.body || {};
    const files = req.files || [];

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "businessId zorunlu.",
      });
    }

    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: "Dosya bulunamadı.",
      });
    }

    const biz = await Business.findById(businessId);
    if (!biz) {
      console.log("⚠️ [UPLOAD BUSINESS] İşletme bulunamadı:", businessId);
      return res.status(404).json({
        success: false,
        message: "İşletme bulunamadı.",
      });
    }

    const uploaded = [];
    for (const file of files) {
      const mapped = await uploadFileToR2(file, {
        kind: kind || "unknown",
        business: businessId,
      });
      if (mapped) uploaded.push(mapped);
    }

    console.log(
      "📸 [UPLOAD BUSINESS DONE] biz=",
      businessId,
      "kind=",
      kind,
      "count=",
      uploaded.length
    );

    // İşletme modelini güncelle
    if (kind === "cover") {
      biz.coverImage = uploaded[0] || null;
    } else if (kind === "gallery") {
      biz.gallery = [...(biz.gallery || []), ...uploaded];
    } else if (kind === "docs" || kind === "documents") {
      biz.docs = [...(biz.docs || []), ...uploaded];
      // varsa eski alanı da dolduralım
      biz.documents = biz.docs;
    } else {
      // bilinmeyen kind → galeriye at
      biz.gallery = [...(biz.gallery || []), ...uploaded];
    }

    await biz.save();

    return res.json({
      success: true,
      business: biz,
      files: uploaded,
    });
  } catch (err) {
    console.error("💥 [UPLOAD BUSINESS ERROR]", err);
    return next(err);
  }
}

// /api/uploads/business
router.post(
  "/uploads/business",
  authenticate,
  requireAdmin,
  upload.array("files", 10),
  handleBusinessUpload
);

// /api/admin/uploads/business
router.post(
  "/admin/uploads/business",
  authenticate,
  requireAdmin,
  upload.array("files", 10),
  handleBusinessUpload
);

export default router;
