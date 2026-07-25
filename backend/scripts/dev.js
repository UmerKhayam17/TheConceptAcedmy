/**
 * Dev launcher: starts the Python face worker (InsightFace) and the Node API
 * with a single `npm run dev`. Face worker is optional — if Python is missing
 * the API still starts (AI Attendance shows "worker not running").
 *
 * Disable worker autostart with FACE_WORKER_AUTOSTART=false.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const WORKER_DIR = path.join(BACKEND_DIR, 'face-worker');
const VENV_DIR = path.join(WORKER_DIR, '.venv');
const VENV_PYTHON = path.join(
  VENV_DIR,
  process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python'
);

const WORKER_URL = (process.env.FACE_WORKER_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const WORKER_PORT = Number(new URL(WORKER_URL).port) || 8090;
const AUTOSTART = process.env.FACE_WORKER_AUTOSTART !== 'false';

const children = [];

function log(tag, msg) {
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${msg}`);
}

function pipeWithPrefix(child, tag) {
  const forward = (stream, isErr) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      let idx;
      // eslint-disable-next-line no-cond-assign
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (line.trim()) {
          (isErr ? process.stderr : process.stdout).write(`[${tag}] ${line}\n`);
        }
      }
    });
  };
  if (child.stdout) forward(child.stdout, false);
  if (child.stderr) forward(child.stderr, true);
}

async function workerAlreadyRunning() {
  try {
    const res = await fetch(`${WORKER_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// onnxruntime/insightface need Python 3.10–3.13 (no 3.14 wheels yet).
function pythonVersionOk(output) {
  const m = /Python (\d+)\.(\d+)/.exec(output || '');
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major === 3 && minor >= 10 && minor <= 13;
}

function findSystemPython() {
  const candidates =
    process.platform === 'win32'
      ? [
          ['py', ['-3.12']],
          ['py', ['-3.13']],
          ['py', ['-3.11']],
          ['py', ['-3.10']],
          ['python', []],
          ['py', []],
        ]
      : [
          ['python3.12', []],
          ['python3.13', []],
          ['python3.11', []],
          ['python3', []],
          ['python', []],
        ];
  for (const [cmd, extraArgs] of candidates) {
    const probe = spawnSync(cmd, [...extraArgs, '--version'], { encoding: 'utf8' });
    if (probe.status === 0 && pythonVersionOk(`${probe.stdout}${probe.stderr}`)) {
      return { cmd, extraArgs };
    }
  }
  return null;
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, shell: false });
    pipeWithPrefix(child, 'face-worker:setup');
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function ensureVenv() {
  if (fs.existsSync(VENV_PYTHON)) return true;
  const python = findSystemPython();
  if (!python) {
    log(
      'face-worker',
      'No compatible Python found — install Python 3.12 (onnxruntime does not support 3.14 yet) to enable AI attendance.'
    );
    return false;
  }
  log('face-worker', 'First run: creating virtualenv and installing dependencies (this can take several minutes)…');
  try {
    await run(python.cmd, [...python.extraArgs, '-m', 'venv', '.venv'], { cwd: WORKER_DIR });
    await run(VENV_PYTHON, ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: WORKER_DIR });
    await run(VENV_PYTHON, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: WORKER_DIR });
    log('face-worker', 'Setup complete.');
    return true;
  } catch (err) {
    log('face-worker', `Setup failed: ${err.message} — API will start without the face worker.`);
    return false;
  }
}

async function startWorker() {
  if (!AUTOSTART) {
    log('face-worker', 'Autostart disabled (FACE_WORKER_AUTOSTART=false).');
    return;
  }
  if (!fs.existsSync(path.join(WORKER_DIR, 'app.py'))) {
    log('face-worker', 'face-worker/app.py not found — skipping.');
    return;
  }
  if (await workerAlreadyRunning()) {
    log('face-worker', `Already running at ${WORKER_URL} — reusing it.`);
    return;
  }
  const ok = await ensureVenv();
  if (!ok) return;

  const child = spawn(
    VENV_PYTHON,
    [
      '-m',
      'uvicorn',
      'app:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(WORKER_PORT),
      '--reload',
      '--timeout-keep-alive',
      '5',
    ],
    { cwd: WORKER_DIR, shell: false }
  );
  children.push(child);
  pipeWithPrefix(child, 'face-worker');
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      log('face-worker', `exited with code ${code} (API keeps running; restart npm run dev to retry).`);
    }
  });
  log('face-worker', `Starting on ${WORKER_URL} …`);
}

function startBackend() {
  const child = spawn(process.execPath, ['--watch', 'src/server.js'], {
    cwd: BACKEND_DIR,
    shell: false,
    stdio: 'inherit',
  });
  children.push(child);
  child.on('exit', (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already dead */
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
process.on('exit', shutdown);

(async () => {
  await startWorker();
  if (process.argv.includes('--worker-only')) {
    log('dev', 'Worker-only mode — Node API not started.');
    return;
  }
  startBackend();
})();
