// backend/controllers/admin/applications.js
'use strict';

const mongoose = require('mongoose');
const slugify = require('slugify');

// Model yollarını aynı bırakıyorum (aktif yapını bozmamak için)
const Application = require('../../models/ApplyRequest');
const Business = require('../../models/Business');

const toSlug = (n) =>
  slugify(n || 'isimsiz', { lower: true, strict: true, locale: 'tr' });

function withMaybeSession(q, session) {
  return session ? q.session(session) : q;
}

async function uniqueSlug(name, session) {
  const base = toSlug(name);
  const re = new RegExp(`^${base}(?:-(\\d+))?$`, 'i');

  const q = Business.find({ slug: re }).select('slug').lean();
  const dupes = await withMaybeSession(q, session);

  if (!dupes || dupes.length === 0) return base;

  const nums = dupes.map((d) => {
    const m = String(d.slug || '').match(/-(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  });

  return `${base}-${Math.max(...nums) + 1}`;
}

function isTxnNotSupported(err) {
  const msg = String(err?.message || '');
  return (
    /Transaction numbers are only allowed/i.test(msg) ||
    /replica set/i.test(msg) ||
    /does not support transactions/i.test(msg) ||
    /IllegalOperation/i.test(msg)
  );
}

async function runWithTxnOrFallback(fn) {
  let session = null;

  try {
    session = await mongoose.startSession();

    let out;
    await session.withTransaction(async () => {
      out = await fn(session);
    });

    return out;
  } catch (err) {
    // Atlas M0 / standalone vb. -> Transaction yoksa otomatik normal akışa dön
    if (isTxnNotSupported(err)) {
      try {
        return await fn(null);
      } catch (fallbackErr) {
        throw fallbackErr;
      }
    }
    throw err;
  } finally {
    if (session) session.endSession();
  }
}

async function createBusinessFromApp(app, session) {
  // slug çakışmalarında 3 denemelik retry
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await uniqueSlug(app.businessName, session);

    const payload = {
      name: app.businessName?.trim() || 'İsimsiz İşletme',
      slug,
      phone: app.phone,
      instagramUrl:
        app.website && app.website.includes('instagram.com')
          ? app.website
          : undefined,
      verified: true,
      status: 'approved',
      address: app.place || app.address || 'Sapanca',
    };

    try {
      if (session) {
        const [biz] = await Business.create([payload], { session });
        return biz;
      } else {
        const [biz] = await Business.create([payload]);
        return biz;
      }
    } catch (err) {
      if (err?.code === 11000 && attempt < 2) continue; // retry
      throw err;
    }
  }
}

exports.approveApplication = async (req, res) => {
  // ObjectId guard (prod’da gereksiz session/txn başlatmasın)
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res
      .status(400)
      .json({ ok: false, message: 'Geçersiz başvuru id' });
  }

  try {
    const result = await runWithTxnOrFallback(async (session) => {
      const qApp = Application.findById(req.params.id);
      const app = await withMaybeSession(qApp, session);
      if (!app)
        return {
          status: 404,
          body: { ok: false, message: 'Application not found' },
        };

      // Idempotent: zaten approved + business bağlıysa aynı sonucu dön
      if (app.status === 'approved' && app.business) {
        const qBiz = Business.findById(app.business).lean();
        const biz = await withMaybeSession(qBiz, session);

        return {
          status: 200,
          body: { ok: true, message: 'Already approved', business: biz },
        };
      }

      // Business oluştur
      const biz = await createBusinessFromApp(app, session);

      // Başvuruyu güncelle ve bağla
      app.status = 'approved';
      app.business = biz._id;
      await app.save(session ? { session } : undefined);

      return { status: 200, body: { ok: true, business: biz } };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ ok: false, message: 'Duplicate slug/business' });
    }

    console.error('approve error:', err);
    return res.status(500).json({
      ok: false,
      message:
        process.env.NODE_ENV === 'development'
          ? err.message
          : 'Sunucu hatası',
    });
  }
};
