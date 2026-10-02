const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/tokenService');
const User = require('../models/User');

function extractAccessToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  const cookieToken = req.cookies?.accessToken;
  if (cookieToken) return String(cookieToken).trim();
  return null;
}

/** Prefer Bearer, then cookie; if Bearer is expired/invalid, fall back to cookie. */
function extractAccessTokenCandidates(req) {
  const tokens = [];
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const t = header.slice(7).trim();
    if (t) tokens.push(t);
  }
  const cookieToken = req.cookies?.accessToken;
  if (cookieToken) {
    const t = String(cookieToken).trim();
    if (t && !tokens.includes(t)) tokens.push(t);
  }
  return tokens;
}

async function loadUserFromAccessToken(token) {
  const decoded = verifyAccessToken(token);
  const user = await User.findById(decoded.sub)
    .populate({
      path: 'role',
      populate: { path: 'permissions' },
    })
    .populate('permissions');

  if (!user || !user.isActive) {
    throw new ApiError(401, 'User not found or inactive');
  }
  return user;
}

async function protect(req, res, next) {
  try {
    const candidates = extractAccessTokenCandidates(req);
    if (!candidates.length) {
      throw new ApiError(401, 'Access token required');
    }

    let lastError = null;
    for (const token of candidates) {
      try {
        const user = await loadUserFromAccessToken(token);
        req.user = user;
        req.user.roleDoc = user.role;
        return next();
      } catch (e) {
        lastError = e;
      }
    }

    if (lastError instanceof ApiError) return next(lastError);
    return next(new ApiError(401, 'Invalid or expired access token'));
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    return next(new ApiError(401, 'Invalid or expired access token'));
  }
}

/** JWT-only gate for static uploads (no DB user load). */
function protectUpload(req, res, next) {
  try {
    const candidates = extractAccessTokenCandidates(req);
    if (!candidates.length) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    let ok = false;
    for (const token of candidates) {
      try {
        verifyAccessToken(token);
        ok = true;
        break;
      } catch {
        /* try next */
      }
    }
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid or expired access token' });
    }
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired access token' });
  }
}

module.exports = { protect, protectUpload, extractAccessToken };
