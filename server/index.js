require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');

const publicApi = require('./routes/apps');
const adminApi = require('./routes/admin');
const { UPLOAD_ROOT } = require('./middleware/upload');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Railway sits behind a proxy — needed for correct client IPs

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// generous global limiter; the download route has its own dedicated cooldown
const limiter = rateLimit({ windowMs: 60 * 1000, max: 300 });
app.use('/api', limiter);

app.use('/api', publicApi);
app.use('/api/admin', adminApi);

app.use('/uploads', express.static(UPLOAD_ROOT));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'حدث خطأ في الخادم' });
});

app.listen(PORT, () => {
  console.log(`Release Dock running on port ${PORT}`);
});
