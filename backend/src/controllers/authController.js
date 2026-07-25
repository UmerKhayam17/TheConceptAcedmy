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
const { getRefreshCookieOptions } = require('../utils/authCookies');
const MODULES = require('../modules/moduleConfig');

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

/** Every module from systemModules with all actions — used for admin sessions. */
function allModulesFullPermissions() {
  const out = {};
  Object.keys(MODULES).forEach((key) => {
    out[key] = Array.isArray(MODULES[key].actions) ? [...MODULES[key].actions] : [];
  });
  return out;
}

/** Session module map for the panel: role baseline, unless the user has their own module rows (then use user only — no union with role). */
function collectSessionModulePermissions(user) {
  const roleName =
    (user.role && typeof user.role === 'object' && user.role.name) ||
    String(user.role || '');
  // Admin always receives every module (including ones added after account creation).
  if (String(roleName).toLowerCase() === 'admin') {
    return allModulesFullPermissions();
  }
  const userModulePermissions = toPlainModulePermissions(user.modulePermissions);
  const roleModulePermissions = toPlainModulePermissions(user.role?.modulePermissions);
  if (hasExplicitModulePermissions(userModulePermissions)) {
    return userModulePermissions;
  }
  return roleModulePermissions;
}

function issueTokens(user) {
  const roleObj = user.role && typeof user.role === 'object' ? user.role : null;
  const roleName = roleObj?.name || String(user.role || '');
  const payload = { sub: user._id.toString(), role: roleName };
  const accessToken = signAccessToken(payload);
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
  user.lastLogin = new Date();
  await user.save();

  res.cookie('refreshToken', refreshToken, getRefreshCookieOptions(req));

  const modulePermissions = collectSessionModulePermissions(user);

  res.json({
    success: true,
    data: {
      accessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRES || '12h',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role?.name,
        modulePermissions,
      },
    },
  });
});

const me = catchAsync(async (req, res) => {
  const roleName = req.user.roleDoc?.name || req.user.role?.name;
  const modulePermissions = collectSessionModulePermissions(req.user);

  res.json({
    success: true,
    data: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: roleName,
      modulePermissions,
    },
  });
});

const refresh = catchAsync(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) throw new ApiError(401, 'Refresh token required');
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }
  const user = await User.findById(decoded.sub).select('+refreshToken').populate('role');
  if (!user || !user.isActive || user.refreshToken !== hashToken(token)) {
    throw new ApiError(401, 'Invalid refresh token');
  }
  const { accessToken, refreshToken } = issueTokens(user);
  user.refreshToken = hashToken(refreshToken);
  await user.save();
  res.cookie('refreshToken', refreshToken, getRefreshCookieOptions(req));
  const modulePermissions = collectSessionModulePermissions(user);
  res.json({
    success: true,
    data: {
      accessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRES || '12h',
      modulePermissions,
    },
  });
});

const logout = catchAsync(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (req.user) {
    req.user.refreshToken = undefined;
    await req.user.save();
  } else if (token) {
    try {
      const decoded = verifyRefreshToken(token);
      await User.findByIdAndUpdate(decoded.sub, { $unset: { refreshToken: 1 } });
    } catch {
      /* ignore */
    }
  }
  res.clearCookie('refreshToken', { path: '/' });
  res.json({ success: true, message: 'Logged out' });
});

const sendOtp = catchAsync(async (req, res) => {
  const { phone } = req.body;
  const code = String(crypto.randomInt(100000, 999999));
  otpStore.set(phone, { code, exp: Date.now() + 5 * 60 * 1000 });
  const payload = { success: true, message: 'OTP sent' };
  if (process.env.NODE_ENV !== 'production') {
    payload.devCode = code;
  }
  res.json(payload);
});

const verifyOtp = catchAsync(async (req, res) => {
  const { phone, code } = req.body;
  const row = otpStore.get(phone);
  if (!row || row.exp < Date.now() || row.code !== code) {
    throw new ApiError(400, 'Invalid or expired OTP');
  }
  otpStore.delete(phone);
  const parentRole = await Role.findOne({ name: 'parent' });
  if (!parentRole) throw new ApiError(500, 'Roles not initialized');
  let user = await User.findOne({ phone }).populate('role');
  if (!user) {
    user = await User.create({
      name: 'Parent',
      email: `${phone}@parent.temp`,
      password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12),
      phone,
      role: parentRole._id,
    });
    user = await user.populate('role');
  }
  const { accessToken, refreshToken } = issueTokens(user);
  user.refreshToken = hashToken(refreshToken);
  await user.save();
  res.cookie('refreshToken', refreshToken, getRefreshCookieOptions(req));
  const modulePermissions = collectSessionModulePermissions(user);
  res.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        role: user.role?.name,
        modulePermissions,
      },
    },
  });
});

module.exports = { login, me, refresh, logout, sendOtp, verifyOtp };
