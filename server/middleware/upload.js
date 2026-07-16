const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(__dirname, '..', '..', 'public', 'uploads');

for (const sub of ['icons', 'screenshots', 'files']) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, sub), { recursive: true });
}

function destinationFor(fieldname) {
  if (fieldname === 'icon') return 'icons';
  if (fieldname === 'screenshots') return 'screenshots';
  if (fieldname === 'file') return 'files';
  return 'misc';
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(UPLOAD_ROOT, destinationFor(file.fieldname)));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const ALLOWED_IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i;
const ALLOWED_PACKAGE = /\.(apk|exe|msi|dmg|zip|pkg|deb|appimage|ipa)$/i;

function fileFilter(req, file, cb) {
  if ((file.fieldname === 'icon' || file.fieldname === 'screenshots') && !ALLOWED_IMAGE.test(file.originalname)) {
    return cb(new Error('صيغة الصورة غير مدعومة'));
  }
  if (file.fieldname === 'file' && !ALLOWED_PACKAGE.test(file.originalname)) {
    return cb(new Error('صيغة ملف التطبيق غير مدعومة'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB per file
});

module.exports = { upload, UPLOAD_ROOT };
