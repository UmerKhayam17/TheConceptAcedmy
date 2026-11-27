const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const v1 = require('./routes/v1');
const backupService = require('./services/backupService');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { protectUpload } = require('./middleware/auth');
const { setUploadSecurityHeaders } = require('./utils/uploadSafety');

const clientOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:8080,https://localhost:8080')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Always allow local Vite HTTPS/HTTP origins in development (proxy + direct API).
if (process.env.NODE_ENV !== 'production') {
  [
    'http://localhost:8080',
    'https://localhost:8080',
    'http://127.0.0.1:8080',
    'https://127.0.0.1:8080',
    'http://localhost:5173',
    'https://localhost:5173',
  ].forEach((o) => {
    if (!clientOrigins.includes(o)) clientOrigins.push(o);
  });
}

const app = express();

// Nginx (and the Vite dev proxy) set X-Forwarded-For. Trust one hop so
// rate limits use the visitor's address instead of the proxy address.
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (clientOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

const uploadsRoot = path.join(__dirname, '../uploads');
// Biometric face enrollments — never public (API-only with tighter ACL)
app.use('/uploads/ai-faces', (req, res) => {
  res.status(403).json({ success: false, message: 'Face images are not publicly accessible' });
});
// All other uploads require a valid access JWT (Bearer or httpOnly cookie)
app.use(
  '/uploads',
  protectUpload,
  express.static(uploadsRoot, { setHeaders: setUploadSecurityHeaders })
);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'academy-backend' });
});

// While a database restore is replacing data, answer other API calls with 503
// (not 401) so open pages wait instead of signing people out or writing half-restored data.
app.use('/api/v1', (req, res, next) => {
  if (!backupService.isRestoring() || req.path.startsWith('/backup/status/')) return next();
  res.setHeader('Retry-After', '5');
  return res.status(503).json({ success: false, message: 'A database restore is in progress. Please wait.' });
});
app.use('/api/v1', v1);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
