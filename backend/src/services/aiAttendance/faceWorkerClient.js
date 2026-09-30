const ApiError = require('../../utils/ApiError');

function faceWorkerUrl() {
  return (process.env.FACE_WORKER_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
}

function isConfigured() {
  return Boolean(faceWorkerUrl());
}

async function request(method, path, body, { timeoutMs = 12000 } = {}) {
  const base = faceWorkerUrl();
  if (!base) {
    throw new ApiError(
      503,
      'Face worker is not configured (set FACE_WORKER_URL, e.g. http://127.0.0.1:8090)'
    );
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const secret = (process.env.FACE_WORKER_SECRET || '').trim();
  if (!secret) {
    throw new ApiError(
      503,
      'Face worker secret is required (set FACE_WORKER_SECRET on the API and the face-worker process)'
    );
  }
  headers['X-Face-Worker-Secret'] = secret;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      ? `Face worker timeout after ${timeoutMs}ms`
      : err.message;
    throw new ApiError(503, `Face worker unreachable: ${msg}`);
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message || data.error)) || `Face worker error ${res.status}`;
    throw new ApiError(res.status >= 400 && res.status < 600 ? res.status : 502, String(msg));
  }
  return data;
}

async function health() {
  return request('GET', '/health');
}

async function analyze(imageBase64) {
  return request('POST', '/analyze', { image: imageBase64 });
}

async function embed(imageBase64) {
  return request('POST', '/embed', { image: imageBase64 });
}

/** Cosine similarity match in Node against Mongo gallery. */
function matchEmbedding(probe, gallery, threshold = 0.45) {
  if (!probe?.length || !gallery || !Object.keys(gallery).length) {
    return { personKey: null, confidence: 0 };
  }
  const probeNorm = Math.hypot(...probe);
  if (!probeNorm) return { personKey: null, confidence: 0 };
  const p = probe.map((v) => v / probeNorm);

  let bestKey = null;
  let bestSim = -1;
  for (const [key, stored] of Object.entries(gallery)) {
    if (!Array.isArray(stored) || !stored.length) continue;
    const sn = Math.hypot(...stored);
    if (!sn) continue;
    const s = stored.map((v) => v / sn);
    let sim = 0;
    for (let i = 0; i < p.length && i < s.length; i += 1) sim += p[i] * s[i];
    if (sim > bestSim) {
      bestSim = sim;
      bestKey = key;
    }
  }
  if (bestSim >= threshold) return { personKey: bestKey, confidence: bestSim };
  return { personKey: null, confidence: bestSim };
}

module.exports = {
  isConfigured,
  health,
  analyze,
  embed,
  matchEmbedding,
  faceWorkerUrl,
  request,
};
