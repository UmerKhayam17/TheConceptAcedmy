const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { IMAGE_TYPES, SLIP_TYPES, classifyUpload } = require('../utils/uploadSafety');

const storage = multer.memoryStorage();

/**
 * Both the extension AND the client MIME type must be an allowed image type.
 * (Before, either one was enough, so "x.html" sent as image/png was accepted.)
 * The approved extension is kept on `file.safeType.ext` and the original name is rewritten
 * to use it, so code that derives the stored extension from `originalname` stays safe.
 */
function strictFilter(allowed, message) {
  return function fileFilter(req, file, cb) {
    const safeType = classifyUpload(file, allowed, { strictMime: true });
    if (!safeType) return cb(new ApiError(400, message));
    // eslint-disable-next-line no-param-reassign
    file.safeType = safeType;
    // eslint-disable-next-line no-param-reassign
    file.originalname = `upload${safeType.ext}`;
    return cb(null, true);
  };
}

/** Profile photos only (images only). */
const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: strictFilter(IMAGE_TYPES, 'Only JPG, PNG, GIF or WebP images are allowed'),
});

/** Payment slips: photo or PDF, up to 5 MB. */
const uploadPaymentSlip = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: strictFilter(SLIP_TYPES, 'Payment slip must be a JPG, PNG, GIF, WebP image or a PDF'),
});

module.exports = { uploadImage, uploadPaymentSlip };
