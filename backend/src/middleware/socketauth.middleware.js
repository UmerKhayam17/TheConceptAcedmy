const { verifyAccessToken } = require('../utils/tokenService');
const User = require('../models/User');

async function socketAuthMiddleware(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) return next(new Error('Access token required'));

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub).select('name email profileImage isActive canLogin');
    if (!user || !user.isActive || user.canLogin === false) {
      return next(new Error('User not found or inactive'));
    }

    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid or expired access token'));
  }
}

module.exports = { socketAuthMiddleware };
