/**
 * Server folder where academy backups are saved.
 * Stored on disk (not in MongoDB) so a restore cannot wipe the setting.
 */

const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');

const SETTINGS_FILE = path.join(__dirname, '../../data/backup-settings.json');
const DEFAULT_FALLBACK_DIR = path.join(__dirname, '../../backups');

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  const dir = path.dirname(SETTINGS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

/** Absolute configured path, or null if the admin has not set one yet. */
function getBackupPath() {
  const raw = readSettings().backupPath;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return path.resolve(raw.trim());
}

function getStatus() {
  const backupPath = getBackupPath();
  return {
    configured: Boolean(backupPath),
    backupPath,
  };
}

/**
 * Folder used for create-backup files and pre-restore safety copies.
 * Falls back to backend/backups only for safety copies when unset.
 */
function resolveWorkingDir({ requireConfigured = false } = {}) {
  const configured = getBackupPath();
  if (configured) return configured;
  if (requireConfigured) {
    throw new ApiError(400, 'Set a backup folder path before creating a backup');
  }
  return DEFAULT_FALLBACK_DIR;
}

async function setBackupPath(rawPath) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) throw new ApiError(400, 'Enter a backup folder path');
  if (!path.isAbsolute(trimmed)) {
    throw new ApiError(
      400,
      process.platform === 'win32'
        ? 'Use a full path, for example D:\\AcademyBackups'
        : 'Use a full path, for example /var/backups/academy'
    );
  }

  const resolved = path.resolve(trimmed);
  try {
    await fs.promises.mkdir(resolved, { recursive: true });
  } catch (err) {
    throw new ApiError(400, `Cannot create that folder: ${err.message}`);
  }

  const probe = path.join(resolved, `.academy-backup-write-test-${process.pid}`);
  try {
    await fs.promises.writeFile(probe, 'ok\n');
    await fs.promises.unlink(probe);
  } catch (err) {
    throw new ApiError(400, `Cannot write to that folder: ${err.message}`);
  }

  writeSettings({
    backupPath: resolved,
    updatedAt: new Date().toISOString(),
  });

  return { configured: true, backupPath: resolved };
}

module.exports = {
  getBackupPath,
  getStatus,
  setBackupPath,
  resolveWorkingDir,
  DEFAULT_FALLBACK_DIR,
};
