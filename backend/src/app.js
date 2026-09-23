const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const v1 = require('./routes/v1');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const clientOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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
// Biometric face enrollments — never public
app.use('/uploads/ai-faces', (req, res) => {
  res.status(403).json({ success: false, message: 'Face images are not publicly accessible' });
});
app.use('/uploads', express.static(uploadsRoot));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'academy-backend' });
});

app.use('/api/v1', v1);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
