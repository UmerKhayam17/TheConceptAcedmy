const multer = require('multer');
const ApiError = require('../utils/ApiError');

const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const name = file.originalname || '';
    const mime = file.mimetype || '';
    const okExt = /\.(xlsx|csv)$/i.test(name);
    const okMime = /spreadsheetml|excel|csv|octet-stream/i.test(mime);
    if (okExt || okMime) return cb(null, true);
    return cb(new ApiError(400, 'Upload an Excel (.xlsx) or CSV file'));
  },
});

module.exports = { uploadSpreadsheet };
