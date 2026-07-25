const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function accessSecret() {
  return process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-prod-32chars';
}

function refreshSecret() {
  return process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-prod-32';
}

function signAccessToken(payload) {
  return jwt.sign(payload, accessSecret(), {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '12h',
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, refreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d',
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
