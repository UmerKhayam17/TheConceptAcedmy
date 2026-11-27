/**
 * Backup page overview: live data size, activity history and server safety copies.
 *
 * History is kept in backend/backups/history.json, outside the database on purpose,
 * so a restore (which replaces the whole database) never erases the record of itself.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BACKUPS_DIR = path.join(__dirname, '../../backups');
const HISTORY_FILE = path.join(BACKUPS_DIR, 'history.json');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const HISTORY_KEEP = 100;
const SAFETY_NAME = /^pre-restore_[0-9_-]+\.ndjson\.gz$/;

async function readHistory() {
  try {
    const list = JSON.parse(await fs.promises.readFile(HISTORY_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

let writing = Promise.resolve();

/**
 * Append one event: { type: 'backup'|'restore'|'restore_failed', by, records, files, bytes, fileName, error }.
 * Never throws: history must not break a backup or restore.
 */
function recordEvent(event) {
  writing = writing
    .then(async () => {
      const list = await readHistory();
      list.unshift({ at: new Date().toISOString(), ...event });
      await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });
      const tmp = `${HISTORY_FILE}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(list.slice(0, HISTORY_KEEP), null, 2));
      await fs.promises.rename(tmp, HISTORY_FILE);
    })
    .catch((err) => console.error('[backup] could not write history:', err?.message || err));
  return writing;
}

async function uploadsStats(dir = UPLOADS_DIR) {
  let count = 0;
  let bytes = 0;
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return { count, bytes };
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await uploadsStats(p);
      count += sub.count;
      bytes += sub.bytes;
    } else if (e.isFile()) {
      count += 1;
      bytes += (await fs.promises.stat(p)).size;
    }
  }
  return { count, bytes };
}

async function listSafetyCopies() {
  let names = [];
  try {
    names = (await fs.promises.readdir(BACKUPS_DIR)).filter((n) => SAFETY_NAME.test(n));
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const st = await fs.promises.stat(path.join(BACKUPS_DIR, name));
    out.push({ name, bytes: st.size, createdAt: st.mtime.toISOString() });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Absolute path of a safety copy by name, or null if the name is not one. */
function safetyCopyPath(name) {
  if (!SAFETY_NAME.test(String(name || ''))) return null;
  const abs = path.join(BACKUPS_DIR, name);
  return fs.existsSync(abs) ? abs : null;
}

async function getSummary() {
  const db = mongoose.connection.db;
  const collections = (await db.listCollections().toArray()).filter(
    (c) => c.type !== 'view' && !c.name.startsWith('system.')
  );
  let records = 0;
  for (const c of collections) records += await db.collection(c.name).estimatedDocumentCount();
  let dataBytes = 0;
  try {
    const stats = await db.stats();
    dataBytes = Number(stats.dataSize) || 0;
  } catch {
    /* not allowed on some hosted databases */
  }
  const history = await readHistory();
  return {
    database: db.databaseName,
    tables: collections.length,
    records,
    dataBytes,
    uploads: await uploadsStats(),
    lastBackup: history.find((h) => h.type === 'backup') || null,
    lastRestore: history.find((h) => h.type === 'restore') || null,
    history: history.slice(0, 30),
    safetyCopies: await listSafetyCopies(),
  };
}

module.exports = { recordEvent, getSummary, safetyCopyPath };
