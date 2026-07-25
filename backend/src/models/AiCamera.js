const mongoose = require('mongoose');

/** Optional CCTV / gate camera registry (RTSP URL from .env or panel). */
const aiCameraSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: '' },
    rtspUrl: { type: String, trim: true, default: '' },
    /** Stable key for cameras seeded from .env (e.g. "env-0") */
    envKey: { type: String, trim: true, index: true, sparse: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'ai_cameras' }
);

module.exports = mongoose.model('AiCamera', aiCameraSchema);
