const crypto = require('crypto');

const key = crypto
  .createHash('sha256')
  .update(
    String(
      process.env.FIELD_ENCRYPTION_KEY ||
        process.env.JWT_ACCESS_SECRET ||
        'dev-access-secret-change-in-prod-32chars'
    ).slice(0, 32)
  )
  .digest();

const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(payload) {
  if (!payload || typeof payload !== 'string' || !payload.includes(':')) return payload;
  const [ivHex, data] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
