const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

const { protect } = require('../middleware/auth');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

const router = Router();

router.post('/login', authLimiter, validate(schemas.login), auth.login);
router.post('/refresh', refreshLimiter, validate(schemas.refresh), auth.refresh);
router.post('/logout', auth.logout);
router.get('/me', protect, auth.me);
router.post('/otp/send', otpLimiter, validate(schemas.otpSend), auth.sendOtp);
router.post('/otp/verify', otpLimiter, validate(schemas.otpVerify), auth.verifyOtp);

module.exports = router;
