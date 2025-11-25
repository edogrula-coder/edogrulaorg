// backend/routes/apply.js — PRO / LIVE READY (VerificationRequest-first + multer-safe)
import express from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

// Legacy model fallback
import ApplyRequest from "../models/ApplyRequest.js";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ================== Multer ================== */
// Üst limitler: live güvenliği için makul sınırlar.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
    files: 20,
  },
  fileFilter: (_req, file, cb) => {
    const mt = (file.mimetype || "").toLowerCase();
    const ok =
      mt.startsWith("image/") ||
      mt === "application/pdf" ||
      mt === "application/x-pdf" ||
      mt === "application/octet-stream";
    if (!ok) return cb(Object.assign(new Error("UNSUPPORTED_FILE_TYPE"), { code: "UNSUPPORTED_FILE_TYPE" }));
    cb(null, true);
  },
});

/* ============ Multer error wrapper (route içinde yakalamak için) ============ */
function runUploadAny(req, res) {
  return new Promise((resolve, reject) => {
    upload.any()(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function handleUploadError(err, res) {
  const code = err?.code || err?.message;

  if (code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ ok: false, code: "FILE_TOO_LARGE", message: "Dosya çok büyük" });
  }
  if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ ok: false, code: "UNEXPECTED_FILE", message: "Beklenmeyen dosya sayısı/alanı" });
  }
  if (code === "UNSUPPORTED_FILE_TYPE") {
    return res.status(415).json({ ok: false, code: "UNSUPPORTED_FILE_TYPE", message: "Desteklenmeyen dosya tipi" });
  }

  return res.status(400).json({ ok: false, code: "UPLOAD_ERROR", message: "Dosya yükleme hatası" });
}

/* ================== Paths & helpers ================== */
const UPLOADS_ROOT = path.resolve(
  process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads")
);

const MAX_IMAGES = 5;
const MAX_DOCS = 5;

const safeName = (name = "file") =>
  String(name)
    .replace(/(\.\.)+/g, ".")            // path traversal yumuşatma
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, 80);

const toPublicPath = (abs) => {
  const rel = path.relative(UPLOADS_ROOT, abs).replace(/\\+/g, "/");
  return "/uploads/" + rel.replace(/^\/+/, "");
};

const getBaseUrl = (req) =>
  (process.env.PUBLIC_BASE_URL || "").trim() ||
  `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;

const truthy = (v) =>
  v === true ||
  v === 1 ||
  v === "1" ||
  v === "true" ||
  v === "on" ||
  v === "yes" ||
  v === "evet";

function pickFirst(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return undefined;
}

// Dosya PDF mi / IMG mi? (mimetype + uzantı)
function classifyFile(f) {
  const mt = (f.mimetype || "").toLowerCase();
  const name = (f.originalname || "").toLowerCase();
  const isPdf = mt.includes("pdf") || /\.pdf$/i.test(name);
  const isImg =
    mt.startsWith("image/") ||
    /\.(jpe?g|png|webp|avif|heic|heif|tiff|gif)$/i.test(name);
  return { isPdf, isImg };
}

/* ================== Model picker (VerificationRequest-first) ================== */
let _RequestModel = null;

async function getRequestModel() {
  if (_RequestModel) return _RequestModel;

  try {
    // yeni sistem
    const mod = await import("../models/VerificationRequest.js");
    _RequestModel = mod.default || (mod && mod.VerificationRequest);
    if (_RequestModel) return _RequestModel;
  } catch {}

  // fallback
  _RequestModel = ApplyRequest;
  return _RequestModel;
}

/* ================== Route ================== */
router.post("/", async (req, res) => {
  try {
    // multer’ı route içinde kontrol ederek hataları düzgün döndürelim
    try {
      await runUploadAny(req, res);
    } catch (err) {
      return handleUploadError(err, res);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[apply] body keys:", Object.keys(req.body));
      console.log(
        "[apply] files:",
        (req.files || []).map(
          (f) => `${f.fieldname}:${f.mimetype}:${f.originalname}`
        )
      );
    }

    /* ---- Normalizasyon ---- */
    const businessName =
      (pickFirst(req.body, [
        "businessName",
        "business",
        "name",
        "isletme",
        "firma",
        "company",
        "companyName",
        "title",
      ]) || "")
        .toString()
        .trim();

    const termsAccepted =
      [
        "termsAccepted",
        "terms",
        "acceptTerms",
        "accepted",
        "agree",
        "kvkk",
        "policy",
      ].some((k) => truthy(req.body[k])) || false;

    const legalName = pickFirst(req.body, [
      "legalName",
      "unvan",
      "ticariUnvan",
      "legal",
      "tradeTitle",
    ]) || "";

    const type = pickFirst(req.body, ["type", "tur", "category"]) || "";
    const address = pickFirst(req.body, ["address", "adres"]) || "";
    const city = pickFirst(req.body, ["city", "il"]) || "";
    const district = pickFirst(req.body, ["district", "ilce"]) || "";

    const phoneMobile =
      pickFirst(req.body, [
        "phoneMobile",
        "mobile",
        "telefon",
        "gsm",
        "phone",
      ]) || "";

    const phoneFixed =
      pickFirst(req.body, ["phoneFixed", "sabit", "tel", "landline"]) ||
      "";

    const instagram =
      pickFirst(req.body, [
        "instagram",
        "ig",
        "instagramUrl",
        "instagramHandle",
        "instagramUsername",
      ]) || "";

    const website = pickFirst(req.body, ["website", "web", "site", "url"]) || "";
    const email = pickFirst(req.body, ["email", "mail"]) || "";
    const note = pickFirst(req.body, ["note", "desc", "description", "aciklama"]) || "";

    if (!businessName)
      return res
        .status(400)
        .json({ ok: false, code: "BUSINESS_NAME_REQUIRED", message: "İşletme adı gerekli" });

    if (!termsAccepted)
      return res
        .status(400)
        .json({ ok: false, code: "TERMS_REQUIRED", message: "KVKK/Şartlar onayı gerekli" });

    /* ---- Kayıt klasörü ---- */
    const folderId = crypto.randomBytes(8).toString("hex");
    const bucket = path.join(UPLOADS_ROOT, "apply", folderId);

    try {
      await fs.mkdir(bucket, { recursive: true });
    } catch (e) {
      console.error("[apply] uploads mkdir failed:", e);
      return res.status(500).json({
        ok: false,
        code: "UPLOADS_NOT_WRITABLE",
        message: "Yükleme dizinine yazılamıyor. UPLOADS_DIR kontrol edin.",
      });
    }

    const savedDocs = [];
    const savedImages = [];
    const skipped = [];

    /* ---- Dosyaları işle ---- */
    for (const f of req.files || []) {
      const { isPdf, isImg } = classifyFile(f);

      if (isPdf && savedDocs.length >= MAX_DOCS) {
        skipped.push({ file: f.originalname, reason: "doc_limit_exceeded" });
        continue;
      }

      if (isImg && savedImages.length >= MAX_IMAGES) {
        skipped.push({ file: f.originalname, reason: "image_limit_exceeded" });
        continue;
      }

      const base = safeName(
        (f.originalname || "file").replace(/\.[^.]+$/, "")
      );
      const uniq = `${Date.now().toString(36)}_${crypto
        .randomBytes(3)
        .toString("hex")}`;

      if (isPdf) {
        try {
          const out = path.join(bucket, `${base || "belge"}_${uniq}.pdf`);
          await fs.writeFile(out, f.buffer, { flag: "w" });
          savedDocs.push(toPublicPath(out));
        } catch {
          skipped.push({ file: f.originalname, reason: "pdf_write_failed" });
        }
        continue;
      }

      if (isImg) {
        try {
          const out = path.join(bucket, `${base || "image"}_${uniq}.webp`);
          const buf = await sharp(f.buffer)
            .rotate()
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();

          await fs.writeFile(out, buf, { flag: "w" });
          savedImages.push(toPublicPath(out));
        } catch {
          skipped.push({ file: f.originalname, reason: "image_convert_failed" });
        }
        continue;
      }

      skipped.push({ file: f.originalname, reason: "unsupported" });
    }

    /* ---- Folder public path ---- */
    const folderPublic =
      savedImages[0]?.split("/").slice(0, -1).join("/") ||
      savedDocs[0]?.split("/").slice(0, -1).join("/") ||
      `/uploads/apply/${folderId}`;

    /* ---- DB kaydı (VerificationRequest-first, ApplyRequest fallback) ---- */
    const Request = await getRequestModel();

    let doc;
    if (Request?.modelName === "VerificationRequest") {
      // yeni şema: docs/images legacy alanlarını da set ediyoruz ki admin UI/legacy summary works
      doc = await Request.create({
        name: businessName,
        tradeTitle: legalName,
        type,
        address,
        city,
        district,
        phone: phoneMobile,
        landline: phoneFixed,
        instagram: instagram,            // legacy
        instagramUrl: instagram,         // yeni normalize bunu toparlar
        instagramUsername: instagram,    // model normalize eder
        website,
        email,
        note,
        docs: savedDocs,
        images: savedImages,
        status: "pending",
      });
    } else {
      // ApplyRequest legacy
      doc = await Request.create({
        businessName,
        legalName,
        type,
        address,
        phoneMobile,
        phoneFixed,
        instagram,
        website,
        docs: savedDocs,
        images: savedImages,
        status: "pending",
        termsAccepted: true,
        folder: folderPublic,
      });
    }

    /* ---- Preview url’leri ---- */
    const baseUrl = getBaseUrl(req);
    const imagePreviews = savedImages.map(
      (p) => `${baseUrl}/api/img?src=${encodeURIComponent(p)}&w=800&dpr=2`
    );
    const docLinks = savedDocs.map((p) => `${baseUrl}${p}`);

    const next = {
      message: "Başvurun alındı, değerlendirilmeye alınmıştır.",
      redirect: `${baseUrl}/`,
      redirectAfterMs: 1500,
    };
    res.setHeader("X-Redirect", next.redirect);

    return res.status(201).json({
      ok: true,
      id: doc._id,
      folder: folderPublic,
      images: savedImages,
      docs: savedDocs,
      preview: { images: imagePreviews, docs: docLinks },
      counts: {
        images: savedImages.length,
        docs: savedDocs.length,
        skipped: skipped.length,
      },
      skipped,
      next,
    });
  } catch (err) {
    console.error("[apply] error:", err);
    return res.status(500).json({
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Sunucu hatası",
    });
  }
});

export default router;
