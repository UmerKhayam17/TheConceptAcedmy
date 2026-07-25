const AiCamera = require('../../models/AiCamera');

/**
 * Read camera RTSP URLs from .env.
 *
 * AI_CAMERA_RTSP_URL=rtsp://...          (single camera)
 * AI_CAMERA_RTSP_URLS=url1,url2          (optional multi)
 * AI_CAMERA_NAME=Gate Camera
 * AI_CAMERA_LOCATION=Main entrance
 * AI_CAMERA_AUTOSTART=true               (default true when URL set)
 */
function parseRtspUrlsFromEnv() {
  const multi = (process.env.AI_CAMERA_RTSP_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const single = (process.env.AI_CAMERA_RTSP_URL || '').trim();
  if (multi.length) return multi;
  if (single) return [single];
  return [];
}

function cameraAutostartEnabled() {
  if (process.env.AI_CAMERA_AUTOSTART === 'false') return false;
  return parseRtspUrlsFromEnv().length > 0;
}

async function ensureCamerasFromEnv() {
  const urls = parseRtspUrlsFromEnv();
  if (!urls.length) return [];

  const baseName = (process.env.AI_CAMERA_NAME || 'Gate Camera').trim();
  const location = (process.env.AI_CAMERA_LOCATION || '').trim();
  const cameras = [];

  for (let i = 0; i < urls.length; i += 1) {
    const envKey = `env-${i}`;
    const name = urls.length === 1 ? baseName : `${baseName} ${i + 1}`;
    const cam = await AiCamera.findOneAndUpdate(
      { envKey },
      {
        $set: {
          name,
          location,
          rtspUrl: urls[i],
          isActive: true,
          sortOrder: i,
          envKey,
        },
      },
      { upsert: true, new: true }
    );
    cameras.push(cam);
  }

  // eslint-disable-next-line no-console
  console.log(`[ai-camera] Synced ${cameras.length} camera(s) from .env`);
  return cameras;
}

module.exports = {
  parseRtspUrlsFromEnv,
  cameraAutostartEnabled,
  ensureCamerasFromEnv,
};
