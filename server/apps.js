const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { UPLOAD_ROOT } = require('../middleware/upload');

const router = express.Router();

// short in-memory cooldown to stop double-click / bot spam from inflating the
// counter, without touching how downloads are recorded in the database.
const recentHits = new Map(); // key: `${ip}:${appId}` -> timestamp
const COOLDOWN_MS = 15_000;

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16);
}

function serializeApp(row, { full = false } = {}) {
  const base = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    version: row.version,
    size_bytes: row.size_bytes,
    icon_url: row.icon_path ? `/uploads/icons/${path.basename(row.icon_path)}` : null,
    screenshots: JSON.parse(row.screenshots || '[]').map((f) => `/uploads/screenshots/${f}`),
    download_count: row.download_count,
    updated_at: row.updated_at,
  };
  if (full) base.changelog = row.changelog;
  return base;
}

// GET /api/apps — published apps only
router.get('/apps', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM apps WHERE published = 1 ORDER BY updated_at DESC')
    .all();
  res.json(rows.map((r) => serializeApp(r)));
});

// GET /api/apps/:slug
router.get('/apps/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM apps WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'التطبيق غير موجود' });
  res.json(serializeApp(row, { full: true }));
});

// GET /api/apps/:slug/download — the only place download_count changes
router.get('/apps/:slug/download', (req, res) => {
  const row = db.prepare('SELECT * FROM apps WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!row || !row.file_path) return res.status(404).json({ error: 'ملف التطبيق غير متاح' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const ipHash = hashIp(ip);
  const key = `${ipHash}:${row.id}`;
  const now = Date.now();
  const last = recentHits.get(key);

  const withinCooldown = last && now - last < COOLDOWN_MS;
  if (!withinCooldown) {
    recentHits.set(key, now);
    const tx = db.transaction(() => {
      db.prepare('UPDATE apps SET download_count = download_count + 1 WHERE id = ?').run(row.id);
      db.prepare('INSERT INTO downloads (app_id, ip_hash) VALUES (?, ?)').run(row.id, ipHash);
    });
    tx();
  }

  const filePath = path.join(UPLOAD_ROOT, 'files', path.basename(row.file_path));
  res.download(filePath, row.file_name || path.basename(row.file_path));
});

module.exports = router;
