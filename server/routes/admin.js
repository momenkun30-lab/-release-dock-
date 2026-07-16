const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAdmin, JWT_SECRET } = require('../middleware/auth');
const { upload, UPLOAD_ROOT } = require('../middleware/upload');

const router = express.Router();

function slugify(name) {
  return (
    name
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
      .replace(/^-+|-+$/g, '') || uuidv4().slice(0, 8)
  );
}

// ---------- Auth ----------
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '12h' });
  res.cookie('admin_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true, username: admin.username });
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username });
});

// everything below requires a valid admin session
router.use(requireAdmin);

// ---------- Apps CRUD ----------
router.get('/apps', (req, res) => {
  const rows = db.prepare('SELECT * FROM apps ORDER BY updated_at DESC').all();
  res.json(rows.map((r) => ({ ...r, screenshots: JSON.parse(r.screenshots || '[]') })));
});

router.post(
  '/apps',
  upload.fields([{ name: 'icon', maxCount: 1 }, { name: 'screenshots', maxCount: 8 }, { name: 'file', maxCount: 1 }]),
  (req, res) => {
    try {
      const { name, description = '', version = '1.0.0', changelog = '', published } = req.body;
      if (!name) return res.status(400).json({ error: 'اسم التطبيق مطلوب' });

      const id = uuidv4();
      let slug = slugify(name);
      const exists = db.prepare('SELECT id FROM apps WHERE slug = ?').get(slug);
      if (exists) slug = `${slug}-${id.slice(0, 6)}`;

      const iconFile = req.files?.icon?.[0];
      const screenshotFiles = req.files?.screenshots || [];
      const packageFile = req.files?.file?.[0];

      db.prepare(
        `INSERT INTO apps (id, name, slug, description, version, size_bytes, changelog, icon_path, screenshots, file_path, file_name, published)
         VALUES (@id, @name, @slug, @description, @version, @size_bytes, @changelog, @icon_path, @screenshots, @file_path, @file_name, @published)`
      ).run({
        id,
        name,
        slug,
        description,
        version,
        size_bytes: packageFile ? packageFile.size : 0,
        changelog,
        icon_path: iconFile ? iconFile.filename : null,
        screenshots: JSON.stringify(screenshotFiles.map((f) => f.filename)),
        file_path: packageFile ? packageFile.filename : null,
        file_name: packageFile ? packageFile.originalname : null,
        published: published === 'true' || published === true ? 1 : 0,
      });

      res.status(201).json({ ok: true, id, slug });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.put(
  '/apps/:id',
  upload.fields([{ name: 'icon', maxCount: 1 }, { name: 'screenshots', maxCount: 8 }, { name: 'file', maxCount: 1 }]),
  (req, res) => {
    const existing = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'التطبيق غير موجود' });

    const { name, description, version, changelog, published } = req.body;
    const iconFile = req.files?.icon?.[0];
    const screenshotFiles = req.files?.screenshots || [];
    const packageFile = req.files?.file?.[0];

    // remove replaced files from disk
    if (iconFile && existing.icon_path) {
      fs.unlink(path.join(UPLOAD_ROOT, 'icons', existing.icon_path), () => {});
    }
    if (packageFile && existing.file_path) {
      fs.unlink(path.join(UPLOAD_ROOT, 'files', existing.file_path), () => {});
    }

    const updated = {
      name: name ?? existing.name,
      description: description ?? existing.description,
      version: version ?? existing.version,
      changelog: changelog ?? existing.changelog,
      published: published === undefined ? existing.published : (published === 'true' || published === true ? 1 : 0),
      icon_path: iconFile ? iconFile.filename : existing.icon_path,
      screenshots: screenshotFiles.length
        ? JSON.stringify(screenshotFiles.map((f) => f.filename))
        : existing.screenshots,
      file_path: packageFile ? packageFile.filename : existing.file_path,
      file_name: packageFile ? packageFile.originalname : existing.file_name,
      size_bytes: packageFile ? packageFile.size : existing.size_bytes,
    };

    db.prepare(
      `UPDATE apps SET name=@name, description=@description, version=@version, changelog=@changelog,
       published=@published, icon_path=@icon_path, screenshots=@screenshots, file_path=@file_path,
       file_name=@file_name, size_bytes=@size_bytes, updated_at=datetime('now') WHERE id=@id`
    ).run({ ...updated, id: req.params.id });

    res.json({ ok: true });
  }
);

router.delete('/apps/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'التطبيق غير موجود' });

  const base = UPLOAD_ROOT;
  if (existing.icon_path) fs.unlink(path.join(base, 'icons', existing.icon_path), () => {});
  if (existing.file_path) fs.unlink(path.join(base, 'files', existing.file_path), () => {});
  for (const s of JSON.parse(existing.screenshots || '[]')) {
    fs.unlink(path.join(base, 'screenshots', s), () => {});
  }

  db.prepare('DELETE FROM apps WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Stats ----------
router.get('/stats', (req, res) => {
  const totals = db.prepare('SELECT COUNT(*) AS apps, COALESCE(SUM(download_count),0) AS downloads FROM apps').get();
  const daily = db
    .prepare(
      `SELECT date(downloaded_at) AS day, COUNT(*) AS count FROM downloads
       WHERE downloaded_at >= datetime('now', '-30 days') GROUP BY day ORDER BY day ASC`
    )
    .all();
  const topApps = db
    .prepare('SELECT name, slug, download_count FROM apps ORDER BY download_count DESC LIMIT 10')
    .all();
  res.json({ totals, daily, topApps });
});

module.exports = router;
