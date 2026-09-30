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
const { setRefreshCookie, clearRefreshCookie, setAccessCookie, clearAccessCookie } = require('../utils/authCookies');
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

  setRefreshCookie(res, req, refreshToken);
  setAccessCookie(res, req, accessToken);

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
        profileImage: user.profileImage || null,
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
      profileImage: req.user.profileImage || null,
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
  setRefreshCookie(res, req, refreshToken);
  setAccessCookie(res, req, accessToken);
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
  await user.save();
  setRefreshCookie(res, req, refreshToken);
  setAccessCookie(res, req, accessToken);
  const modulePermissions = collectSessionModulePermissions(user);
  res.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        role: user.role?.name,
        phone: user.phone,
        email: user.email,
        modulePermissions,
      },
    },
  });
});

module.exports = { login, me, refresh, logout, sendOtp, verifyOtp };
