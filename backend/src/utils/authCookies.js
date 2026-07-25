function parseDurationMs(value) {
  const raw = String(value || '7d').trim();
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (multipliers[unit] || multipliers.d);
}

function isCrossOriginRequest(req) {
  const origin = req.get('origin');
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.get('host');
    return Boolean(requestHost && originHost !== requestHost);
  } catch {
    return false;
  }
}

function getRefreshCookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const crossOrigin = isCrossOriginRequest(req);
  return {
    httpOnly: true,
    secure: isProd || crossOrigin,
    sameSite: crossOrigin ? 'none' : 'lax',
    maxAge: parseDurationMs(process.env.JWT_REFRESH_EXPIRES || '30d'),
    path: '/',
  };
}

module.exports = { getRefreshCookieOptions, parseDurationMs };
