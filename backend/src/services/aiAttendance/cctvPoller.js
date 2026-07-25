/**
 * Polls RTSP frames via the face-worker and marks attendance in MongoDB.
 * Started automatically when AI_CAMERA_RTSP_URL is set (unless AI_CAMERA_AUTOSTART=false).
 */
const faceWorker = require('./faceWorkerClient');
const { cameraAutostartEnabled } = require('./cameraEnvService');
const AiCamera = require('../../models/AiCamera');

const SCAN_MS = Number(process.env.AI_CAMERA_SCAN_MS) || 2000;
const MATCH_COOLDOWN_MS = Number(process.env.AI_CAMERA_MATCH_COOLDOWN_MS) || 45000;
const runtimes = new Map(); // cameraId -> { timer, stopping }
const lastMatchAt = new Map(); // `${cameraId}:${personKey}` -> timestamp

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[cctv] ${msg}`);
}

async function ensureWorkerStream(camera) {
  await faceWorker.request(
    'POST',
    '/stream/start',
    {
      cameraId: String(camera._id),
      rtspUrl: camera.rtspUrl,
      name: camera.name,
    },
    { timeoutMs: 8000 }
  );
}

async function grabFrame(camera) {
  return faceWorker.request(
    'POST',
    '/stream/frame',
    {
      cameraId: String(camera._id),
      rtspUrl: camera.rtspUrl,
      name: camera.name,
    },
    { timeoutMs: 10000 }
  );
}

async function tick(cameraId) {
  const runtime = runtimes.get(String(cameraId));
  if (!runtime || runtime.stopping || runtime.busy) return;
  runtime.busy = true;
  try {
    const camera = await AiCamera.findById(cameraId).lean();
    if (!camera?.isActive || !camera.rtspUrl) {
      stopCamera(cameraId);
      return;
    }

    // Re-ensure worker stream if we never got a frame / lost connection
    if (!runtime.workerReady || runtime.status?.connected === false) {
      try {
        await ensureWorkerStream(camera);
        runtime.workerReady = true;
      } catch (err) {
        runtime.status = {
          ...(runtime.status || {}),
          connected: false,
          lastError: err.message || String(err),
        };
        return;
      }
    }

    const frame = await grabFrame(camera);
    runtime.status = {
      connected: Boolean(frame?.ok),
      lastError: frame?.error || '',
      lastFrameAt: frame?.ok ? new Date().toISOString() : runtime.status?.lastFrameAt,
      message: frame?.message || '',
      lastMatch: runtime.status?.lastMatch,
    };
    if (frame?.ok && frame?.image) {
      runtime.lastImage = frame.image;
    }
    if (!frame?.ok || !frame?.image) return;

    // Lazy require to avoid circular load with aiAttendanceService
    const ai = require('./aiAttendanceService');
    const result = await ai.identifyAndMark(frame.image, {
      markAttendance: true,
      source: 'cctv',
    });
    if (result?.matched) {
      const personKey = result.employee_id;
      const coolKey = `${cameraId}:${personKey}`;
      const prev = lastMatchAt.get(coolKey) || 0;
      if (Date.now() - prev < MATCH_COOLDOWN_MS) {
        return;
      }
      lastMatchAt.set(coolKey, Date.now());
      log(
        `${camera.name}: matched ${result.employee_name || personKey || 'person'} ` +
          `(${Math.round((result.confidence || 0) * 100)}%)`
      );
      runtime.status.lastMatch = {
        at: new Date().toISOString(),
        personKey,
        name: result.employee_name,
        confidence: result.confidence,
        attendance: result.attendance_action,
      };
    }
  } catch (err) {
    runtime.workerReady = false;
    runtime.status = {
      ...(runtime.status || {}),
      connected: false,
      lastError: err.message || String(err),
    };
  } finally {
    runtime.busy = false;
  }
}

async function startCamera(camera) {
  const id = String(camera._id);
  if (runtimes.has(id)) return getStatus(id);

  const runtime = {
    cameraId: id,
    name: camera.name,
    stopping: false,
    busy: false,
    workerReady: false,
    status: { connected: false, lastError: '' },
    timer: setInterval(() => tick(id), SCAN_MS),
  };
  runtimes.set(id, runtime);

  try {
    await ensureWorkerStream(camera);
    runtime.workerReady = true;
  } catch (err) {
    // Still keep poller running — tick() retries stream/start
    log(`Stream start deferred for ${camera.name}: ${err.message}`);
    runtime.status.lastError = err.message || String(err);
  }

  setTimeout(() => tick(id), 400);
  log(`Started ${camera.name}`);
  return getStatus(id);
}

async function stopCamera(cameraId) {
  const id = String(cameraId);
  const runtime = runtimes.get(id);
  if (runtime) {
    runtime.stopping = true;
    clearInterval(runtime.timer);
    runtimes.delete(id);
  }
  try {
    await faceWorker.request('POST', '/stream/stop', { cameraId: id }, { timeoutMs: 5000 });
  } catch {
    /* worker may be down */
  }
  log(`Stopped camera ${id}`);
  return { cameraId: id, running: false };
}

function getStatus(cameraId) {
  const id = cameraId != null ? String(cameraId) : null;
  if (id) {
    const runtime = runtimes.get(id);
    if (!runtime) return { cameraId: id, running: false };
    return {
      cameraId: id,
      name: runtime.name,
      running: true,
      hasFrame: Boolean(runtime.lastImage),
      ...runtime.status,
    };
  }
  return [...runtimes.keys()].map((k) => getStatus(k));
}

/** Latest JPEG data-URL for live preview in the panel. */
async function getSnapshot(cameraId) {
  const id = String(cameraId);
  const runtime = runtimes.get(id);
  if (runtime?.lastImage) {
    return {
      ok: true,
      image: runtime.lastImage,
      running: true,
      connected: Boolean(runtime.status?.connected),
      lastFrameAt: runtime.status?.lastFrameAt || null,
      lastMatch: runtime.status?.lastMatch || null,
      lastError: runtime.status?.lastError || '',
    };
  }

  const camera = await AiCamera.findById(id).lean();
  if (!camera?.rtspUrl) {
    return { ok: false, error: 'Camera not found', running: false };
  }

  // Auto-start poller so attendance + preview keep running after Node --watch restart
  if (!runtime && camera.isActive !== false) {
    try {
      await startCamera(camera);
      const again = runtimes.get(id);
      if (again?.lastImage) {
        return {
          ok: true,
          image: again.lastImage,
          running: true,
          connected: Boolean(again.status?.connected),
          lastFrameAt: again.status?.lastFrameAt || null,
          lastMatch: again.status?.lastMatch || null,
          lastError: again.status?.lastError || '',
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err),
        running: false,
        connected: false,
      };
    }
  }

  try {
    const frame = await grabFrame(camera);
    if (frame?.ok && frame?.image) {
      if (runtime) runtime.lastImage = frame.image;
      return {
        ok: true,
        image: frame.image,
        running: Boolean(runtimes.get(id)),
        connected: true,
        lastFrameAt: new Date().toISOString(),
        lastMatch: runtime?.status?.lastMatch || null,
        lastError: '',
      };
    }
    return {
      ok: false,
      error: frame?.error || 'No frame yet',
      running: Boolean(runtimes.get(id)),
      connected: false,
      lastError: frame?.error || '',
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      running: Boolean(runtimes.get(id)),
      connected: false,
    };
  }
}

async function startAllActive() {
  const cameras = await AiCamera.find({ isActive: true, rtspUrl: { $ne: '' } }).lean();
  const statuses = [];
  for (const cam of cameras) {
    statuses.push(await startCamera(cam));
  }
  return statuses;
}

async function stopAll() {
  const ids = [...runtimes.keys()];
  const out = [];
  for (const id of ids) out.push(await stopCamera(id));
  return out;
}

async function autostartFromEnv(attempt = 1) {
  if (!cameraAutostartEnabled()) {
    log('Autostart skipped (no AI_CAMERA_RTSP_URL or AI_CAMERA_AUTOSTART=false)');
    return [];
  }
  if (!faceWorker.isConfigured()) {
    log('Face worker not configured — CCTV not started');
    return [];
  }

  const delay = attempt === 1 ? 2000 : Math.min(5000 * attempt, 20000);
  await new Promise((r) => setTimeout(r, delay));

  try {
    await faceWorker.request('GET', '/health', undefined, { timeoutMs: 3000 });
  } catch (err) {
    if (attempt < 8) {
      log(`Face worker not ready (${err.message}) — retry ${attempt}/8`);
      return autostartFromEnv(attempt + 1);
    }
    log(`Face worker still not ready after ${attempt} attempts — CCTV not autostarted`);
    return [];
  }

  const statuses = await startAllActive();
  log(`Autostart complete: ${statuses.filter((s) => s.running).length}/${statuses.length} running`);
  return statuses;
}

module.exports = {
  startCamera,
  stopCamera,
  startAllActive,
  stopAll,
  getStatus,
  getSnapshot,
  autostartFromEnv,
};
