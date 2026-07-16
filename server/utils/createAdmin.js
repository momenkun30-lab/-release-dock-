// Usage: node server/utils/createAdmin.js <username> <password>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('الاستخدام: node server/utils/createAdmin.js <username> <password>');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);

if (existing) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(hash, username);
  console.log(`تم تحديث كلمة مرور المدير "${username}"`);
} else {
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`تم إنشاء حساب المدير "${username}"`);
}
