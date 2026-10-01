const multer = require('multer');
const ApiError = require('../utils/ApiError');

const storage = multer.memoryStorage();

/** Profile photos only (images only). */
const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const hasImageMime = /^image\/.+$/i.test(file.mimetype || '');
    const hasImageExt = /\.(jpe?g|png|gif|webp)$/i.test(file.originalname);
    if (hasImageMime || hasImageExt) {
      return cb(null, true);
    }
    return cb(new ApiError(400, 'Only image files are allowed'));
  },
});

/** Payment slips: photo or PDF, up to 5 MB. */
const uploadPaymentSlip = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const hasAllowedMime = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/i.test(file.mimetype || '');
    const hasAllowedExt = /\.(jpe?g|png|gif|webp|pdf)$/i.test(file.originalname || '');
    if (hasAllowedMime || hasAllowedExt) {
      return cb(null, true);
    }
    return cb(new ApiError(400, 'Payment slip must be an image or PDF'));
  },
});

module.exports = { uploadImage, uploadPaymentSlip };
