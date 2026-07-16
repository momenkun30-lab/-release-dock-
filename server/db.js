const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB_PATH should point at a Railway Volume mount (e.g. /data/store.db) in production
// so the catalog and download counts survive redeploys. Falls back to a local file
// for development.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'store.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '1.0.0',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  changelog TEXT NOT NULL DEFAULT '',
  icon_path TEXT,
  screenshots TEXT NOT NULL DEFAULT '[]',
  file_path TEXT,
  file_name TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_downloads_app_id ON downloads(app_id);
CREATE INDEX IF NOT EXISTS idx_downloads_time ON downloads(downloaded_at);
`);

module.exports = db;
