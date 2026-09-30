function parseDurationMs(value) {
  const raw = String(value || '7d').trim();
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (multipliers[unit] || multipliers.d);
}

function forwardedValue(req, name) {
  const raw = req.get(name);
  if (!raw) return '';
  return String(raw).split(',')[0].trim();
}

/** Host the browser used. Vite rewrites Host to the API, so prefer the forwarded host. */
function browserHost(req) {
  return forwardedValue(req, 'x-forwarded-host') || req.get('host') || '';
}

function browserIsHttps(req) {
  const proto = forwardedValue(req, 'x-forwarded-proto');
  if (proto) return proto === 'https';
  return Boolean(req.secure);
}

function isCrossOriginRequest(req) {
  const origin = req.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== browserHost(req);
  } catch {
    return false;
  }
}

function getRefreshCookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const crossOrigin = isCrossOriginRequest(req);
  const secure = isProd || browserIsHttps(req) || crossOrigin;
  return {
    httpOnly: true,
    secure,
    sameSite: crossOrigin && secure ? 'none' : 'lax',
    maxAge: parseDurationMs(process.env.JWT_REFRESH_EXPIRES || '30d'),
    path: '/',
  };
}

function getAccessCookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const crossOrigin = isCrossOriginRequest(req);
  const secure = isProd || browserIsHttps(req) || crossOrigin;
  return {
    httpOnly: true,
    secure,
    sameSite: crossOrigin && secure ? 'none' : 'lax',
    maxAge: parseDurationMs(process.env.JWT_ACCESS_EXPIRES || '12h'),
    path: '/',
  };
}

/** Drop older copies saved with different Secure / SameSite flags. */
function clearRefreshCookie(res) {
  const variants = [
    { path: '/', httpOnly: true, sameSite: 'lax', secure: false },
    { path: '/', httpOnly: true, sameSite: 'lax', secure: true },
    { path: '/', httpOnly: true, sameSite: 'none', secure: true },
    { path: '/', httpOnly: true, sameSite: 'strict', secure: false },
    { path: '/', httpOnly: true, sameSite: 'strict', secure: true },
  ];
  variants.forEach((opts) => res.clearCookie('refreshToken', opts));
}

function clearAccessCookie(res) {
  const variants = [
    { path: '/', httpOnly: true, sameSite: 'lax', secure: false },
    { path: '/', httpOnly: true, sameSite: 'lax', secure: true },
    { path: '/', httpOnly: true, sameSite: 'none', secure: true },
    { path: '/', httpOnly: true, sameSite: 'strict', secure: false },
    { path: '/', httpOnly: true, sameSite: 'strict', secure: true },
  ];
  variants.forEach((opts) => res.clearCookie('accessToken', opts));
}

function setRefreshCookie(res, req, refreshToken) {
  clearRefreshCookie(res);
  res.cookie('refreshToken', refreshToken, getRefreshCookieOptions(req));
}

function setAccessCookie(res, req, accessToken) {
  clearAccessCookie(res);
  res.cookie('accessToken', accessToken, getAccessCookieOptions(req));
}

module.exports = {
  getRefreshCookieOptions,
  getAccessCookieOptions,
  parseDurationMs,
  clearRefreshCookie,
  clearAccessCookie,
  setRefreshCookie,
  setAccessCookie,
};
