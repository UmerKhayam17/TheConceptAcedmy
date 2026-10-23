const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const Role = require('../models/Role');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../utils/tokenService');
const {
  setRefreshCookie,
  clearRefreshCookie,
  setAccessCookie,
  clearAccessCookie,
} = require('../utils/authCookies');
const MODULES = require('../modules/moduleConfig');
const { isSystemAdmin, isAdminRole } = require('../utils/systemAdmin');
const { expandModulePermissions } = require('../modules/expandModulePermissions');

const otpStore = new Map();

function toPlainModulePermissions(modulePermissions) {
  if (!modulePermissions) return {};
  if (modulePermissions instanceof Map) {
    return Object.fromEntries(modulePermissions);
  }
  if (typeof modulePermissions === 'object' && !Array.isArray(modulePermissions)) {
    return modulePermissions;
  }
  return {};
}

function hasExplicitModulePermissions(plain) {
  return Object.values(plain).some(
    (actions) => Array.isArray(actions) && actions.length > 0,
  );
}

/** Every module from systemModules with all actions — used for the seeded system admin only. */
function allModulesFullPermissions() {
  const out = {};
  Object.keys(MODULES).forEach((key) => {
    out[key] = Array.isArray(MODULES[key].actions) ? [...MODULES[key].actions] : [];
  });
  return out;
}

function sessionUserPayload(user, modulePermissions) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: (user.role && typeof user.role === 'object' && user.role.name) || user.roleDoc?.name || user.role,
    profileImage: user.profileImage || null,
    modulePermissions,
    /** Bootstrap admin (SEED_ADMIN_EMAIL) — full access; other admins use dynamic perms. */
    isSystemAdmin: isSystemAdmin(user),
  };
}

/** Session module map for the panel: role baseline, unless the user has their own module rows (then use user only — no union with role). */
function collectSessionModulePermissions(user) {
  // Only the seeded system admin bypasses the matrix with every module.
  if (isSystemAdmin(user)) {
    return allModulesFullPermissions();
  }
  const userModulePermissions = toPlainModulePermissions(user.modulePermissions);
  // Secondary admins always use their own dynamic matrix (empty = no modules until granted).
  if (isAdminRole(user)) {
    return expandModulePermissions(userModulePermissions);
  }
  const roleModulePermissions = toPlainModulePermissions(
    user.roleDoc?.modulePermissions || user.role?.modulePermissions,
  );
  if (hasExplicitModulePermissions(userModulePermissions)) {
    return expandModulePermissions(userModulePermissions);
  }
  return expandModulePermissions(roleModulePermissions);
}

/** How long a just-replaced refresh token still works (covers concurrent tabs / in-flight requests). */
const REFRESH_GRACE_MS = 2 * 60_000;
/**
 * Replace the refresh token at most this often. Refreshes in between only mint a new
 * access JWT, so multiple tabs sharing the cookie never invalidate each other.
 */
const REFRESH_ROTATE_AFTER_MS = 24 * 60 * 60_000;
const ACCESS_EXPIRES = () => process.env.JWT_ACCESS_EXPIRES || '15m';

function accessPayload(user) {
  const roleObj = user.role && typeof user.role === 'object' ? user.role : null;
  const roleName = roleObj?.name || String(user.role || '');
  return { sub: user._id.toString(), role: roleName };
}

function issueTokens(user) {
  const accessToken = signAccessToken(accessPayload(user));
  const refreshToken = signRefreshToken({ sub: user._id.toString() });
  return { accessToken, refreshToken };
}

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    .select('+password')
    .populate('role');
  if (!user || !user.isActive) {
    throw new ApiError(401, 'Invalid credentials');
  }
  if (!user.password) {
    throw new ApiError(401, 'Invalid credentials');
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw new ApiError(401, 'Invalid credentials');
  if (!user.role) {
    throw new ApiError(500, 'User account has no role assigned. Contact an administrator.');
  }

  const { accessToken, refreshToken } = issueTokens(user);
  user.refreshToken = hashToken(refreshToken);
  user.refreshTokenPrev = undefined;
  user.refreshTokenRotatedAt = new Date();
  user.lastLogin = new Date();
  await user.save();

  setRefreshCookie(res, req, refreshToken);
  setAccessCookie(res, req, accessToken);

  const modulePermissions = collectSessionModulePermissions(user);

  res.json({
    success: true,
    data: {
      accessToken,
      expiresIn: ACCESS_EXPIRES(),
      user: sessionUserPayload(user, modulePermissions),
    },
  });
});

const me = catchAsync(async (req, res) => {
  const modulePermissions = collectSessionModulePermissions(req.user);
  res.json({
    success: true,
    data: sessionUserPayload(req.user, modulePermissions),
  });
});

/**
 * Issue a new access JWT from the httpOnly refresh cookie. The refresh token itself is
 * replaced at most once per REFRESH_ROTATE_AFTER_MS (atomically, so only one concurrent
 * request rotates); the previous token keeps working for REFRESH_GRACE_MS.
 */
const refresh = catchAsync(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) throw new ApiError(401, 'Refresh token required');

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const userId = decoded.sub;
  const presented = hashToken(token);
  const graceCutoff = new Date(Date.now() - REFRESH_GRACE_MS);

  const user = await User.findOne({
    _id: userId,
    isActive: true,
    $or: [
      { refreshToken: presented },
      { refreshTokenPrev: presented, refreshTokenRotatedAt: { $gte: graceCutoff } },
    ],
  })
    .select('+refreshToken +refreshTokenRotatedAt')
    .populate('role');

  if (user) {
    const isCurrent = user.refreshToken === presented;
    const rotatedAt = user.refreshTokenRotatedAt ? user.refreshTokenRotatedAt.getTime() : 0;
    if (isCurrent && Date.now() - rotatedAt >= REFRESH_ROTATE_AFTER_MS) {
      const newRefresh = signRefreshToken({ sub: userId });
      const rotated = await User.updateOne(
        { _id: userId, refreshToken: presented },
        {
          $set: {
            refreshToken: hashToken(newRefresh),
            refreshTokenPrev: presented,
            refreshTokenRotatedAt: new Date(),
          },
        },
      );
      // Lost the race to another tab: its Set-Cookie wins, this request stays in grace.
      if (rotated.modifiedCount === 1) setRefreshCookie(res, req, newRefresh);
    }

    const accessToken = signAccessToken(accessPayload(user));
    setAccessCookie(res, req, accessToken);
    const modulePermissions = collectSessionModulePermissions(user);
    return res.json({
      success: true,
      data: {
        accessToken,
        expiresIn: ACCESS_EXPIRES(),
        modulePermissions,
      },
    });
  }

  // Reuse of a previous token outside the grace window → revoke family (possible theft).
  const reused = await User.findOne({
    _id: userId,
    refreshTokenPrev: presented,
  }).select('_id');
  if (reused) {
    await User.updateOne(
      { _id: userId },
      { $unset: { refreshToken: 1, refreshTokenPrev: 1, refreshTokenRotatedAt: 1 } },
    );
    clearRefreshCookie(res);
    clearAccessCookie(res);
  }

  throw new ApiError(401, 'Invalid refresh token');
});

const logout = catchAsync(async (req, res) => {
  const token = req.cookies?.refreshToken;
  const userId = req.user?._id || (() => {
    if (!token) return null;
    try {
      return verifyRefreshToken(token).sub;
    } catch {
      return null;
    }
  })();

  if (userId) {
    await User.findByIdAndUpdate(userId, {
      $unset: { refreshToken: 1, refreshTokenPrev: 1, refreshTokenRotatedAt: 1 },
    });
  }
  clearRefreshCookie(res);
  clearAccessCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

async function deliverOtpSms(phone, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    return { sent: false, reason: 'Twilio not configured' };
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const body = new URLSearchParams({
      To: phone.startsWith('+') ? phone : `+${phone}`,
      From: from,
      Body: `Your academy login code is ${code}. It expires in 5 minutes.`,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    );
    if (!res.ok) {
      const text = await res.text();
      return { sent: false, reason: text.slice(0, 200) };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

const sendOtp = catchAsync(async (req, res) => {
  const phone = String(req.body.phone || '').trim();
  if (!phone || phone.length < 8) throw new ApiError(400, 'Valid phone required');

  const recent = otpStore.get(phone);
  if (recent?.sentAt && Date.now() - recent.sentAt < 30_000) {
    throw new ApiError(429, 'Please wait before requesting another OTP');
  }

  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = hashToken(code);
  otpStore.set(phone, { codeHash, exp: Date.now() + 5 * 60 * 1000, sentAt: Date.now() });

  const delivery = await deliverOtpSms(phone, code);
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !delivery.sent) {
    throw new ApiError(503, 'OTP delivery unavailable. Configure Twilio SMS.');
  }

  const payload = {
    success: true,
    message: delivery.sent ? 'OTP sent' : 'OTP generated (dev — SMS not configured)',
  };
  if (!isProd) {
    payload.devCode = code;
  }
  res.json(payload);
});

const verifyOtp = catchAsync(async (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const code = String(req.body.code || '').trim();
  const row = otpStore.get(phone);
  if (!row || row.exp < Date.now() || row.codeHash !== hashToken(code)) {
    throw new ApiError(400, 'Invalid or expired OTP');
  }
  otpStore.delete(phone);
  const parentRole = await Role.findOne({ name: 'parent' });
  if (!parentRole) throw new ApiError(500, 'Roles not initialized');
  let user = await User.findOne({ phone }).populate('role');
  if (!user) {
    // Prefer linking via student guardianEmail if a matching guardian phone student exists later;
    // email uses phone placeholder only when no real guardian email is known.
    user = await User.create({
      name: 'Parent',
      email: `${phone.replace(/\D/g, '')}@parent.local`,
      password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12),
      phone,
      role: parentRole._id,
    });
    user = await user.populate('role');
  }
  const { accessToken, refreshToken } = issueTokens(user);
  user.refreshToken = hashToken(refreshToken);
  user.refreshTokenPrev = undefined;
  user.refreshTokenRotatedAt = new Date();
  await user.save();
  setRefreshCookie(res, req, refreshToken);
  setAccessCookie(res, req, accessToken);
  const modulePermissions = collectSessionModulePermissions(user);
  res.json({
    success: true,
    data: {
      accessToken,
      expiresIn: ACCESS_EXPIRES(),
      user: {
        ...sessionUserPayload(user, modulePermissions),
        phone: user.phone,
      },
    },
  });
});

module.exports = { login, me, refresh, logout, sendOtp, verifyOtp };
