const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function requireSecret(name, fallbackDev) {
  const value = process.env[name];
  if (value && String(value).length >= 32) return String(value);
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be set to a strong secret (32+ chars) in production`);
  }
  return fallbackDev;
}

function accessSecret() {
  return requireSecret('JWT_ACCESS_SECRET', 'dev-access-secret-change-in-prod-32chars');
}

function refreshSecret() {
  return requireSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-prod-32');
}

function signAccessToken(payload) {
  return jwt.sign(payload, accessSecret(), {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, refreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d',
    // Unique per token so two refresh tokens issued in the same second never collide.
    jwtid: crypto.randomUUID(),
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret());
}

function verifyRefreshToken(token) {
  return jwt.verify(token, refreshSecret());
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
};
