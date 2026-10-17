const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/tokenService');
const User = require('../models/User');

/** API auth: Authorization Bearer only (access JWT from JS memory). */
function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const t = header.slice(7).trim();
    if (t) return t;
  }
  return null;
}

/**
 * Static /uploads: Bearer (fetch) or accessToken cookie (<img src> cannot send Bearer).
 * Cookie is a secondary channel for media only — not for JSON API protect().
 */
function extractAccessTokenCandidates(req) {
  const tokens = [];
  const bearer = extractBearerToken(req);
  if (bearer) tokens.push(bearer);
  const cookieToken = req.cookies?.accessToken;
  if (cookieToken) {
    const t = String(cookieToken).trim();
    if (t && !tokens.includes(t)) tokens.push(t);
  }
  return tokens;
}

/** @deprecated use extractBearerToken — kept for callers that still import extractAccessToken */
function extractAccessToken(req) {
  return extractBearerToken(req) || (req.cookies?.accessToken ? String(req.cookies.accessToken).trim() : null);
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
    const token = extractBearerToken(req);
    if (!token) {
      throw new ApiError(401, 'Access token required');
    }

    try {
      const user = await loadUserFromAccessToken(token);
      req.user = user;
      req.user.roleDoc = user.role;
      return next();
    } catch (e) {
      if (e instanceof ApiError) return next(e);
      return next(new ApiError(401, 'Invalid or expired access token'));
    }
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    return next(new ApiError(401, 'Invalid or expired access token'));
  }
}

/** JWT gate for static uploads (Bearer or access cookie for <img>). */
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
