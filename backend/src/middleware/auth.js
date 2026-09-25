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

async function protect(req, res, next) {
  try {
    const token = extractAccessToken(req);
    if (!token) {
      throw new ApiError(401, 'Access token required');
    }
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

    req.user = user;
    req.user.roleDoc = user.role;
    next();
  } catch (e) {
    if (e instanceof ApiError) return next(e);
    return next(new ApiError(401, 'Invalid or expired access token'));
  }
}

/** JWT-only gate for static uploads (no DB user load). */
function protectUpload(req, res, next) {
  try {
    const token = extractAccessToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    verifyAccessToken(token);
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired access token' });
  }
}

module.exports = { protect, protectUpload, extractAccessToken };
