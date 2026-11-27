/**
 * Full backup / restore: the whole database plus every file in backend/uploads/.
 *
 * File format: gzip-compressed NDJSON, one JSON object per line, values in
 * canonical Extended JSON so ObjectIds, Dates, Decimals etc. keep their types.
 *   {"type":"header", format, version, createdAt, database, collections:[{name,count}],
 *                     files:{count,bytes}}             ← files: version 2+
 *   {"type":"collection", name, indexes:[...]}       ← before that collection's docs
 *   {"type":"doc", c:<collection>, d:<document>}
 *   {"type":"file", path:"students/x.jpg", size, data:<base64>}   ← after all docs
 *   {"type":"end", totalDocs, files}                  ← missing = truncated file
 *
 * Restore validates the whole file first, saves a safety backup of the current
 * data and files to backend/backups/, then makes the database (and, for version 2
 * backups, the uploads folder) match the file exactly. If applying fails
 * half-way, it rolls back from that safety backup. Version 1 backups (database
 * only) leave the uploads folder untouched.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { pipeline } = require('stream/promises');
const mongoose = require('mongoose');

const { EJSON } = mongoose.mongo.BSON;
const backupSettings = require('./backupSettings');

const FORMAT = 'academy-backup';
const VERSION = 2;
const INSERT_BATCH = 500;
const SAFETY_KEEP = 5;
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

function safetyDir() {
  return backupSettings.resolveWorkingDir({ requireConfigured: false });
}

let busy = null; // 'backup' | 'restore' | null

/**
 * Progress of the current / last restore, polled by the page via a random job id.
 * phase: validating → safety → restoring → done | failed
 */
let job = null;
const JOB_KEEP_MS = 10 * 60 * 1000;

function startJob(id) {
  job = {
    id: String(id || ''),
    phase: 'validating',
    done: 0,
    total: 0,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
}

function setPhase(phase, total = 0) {
  if (!job) return;
  job.phase = phase;
  job.done = 0;
  job.total = total;
}

function tick(n = 1) {
  if (job) job.done += n;
}

/** Public status for one job id (numbers only — nothing from the data itself). */
function getJobStatus(id) {
  if (!job || !id || job.id !== String(id)) return null;
  if (job.finishedAt && Date.now() - job.finishedAt > JOB_KEEP_MS) return null;
  const { phase, done, total, error, startedAt, finishedAt } = job;
  return { phase, done, total, error, startedAt, finishedAt };
}

/** True while a restore is changing data — other API requests are paused meanwhile. */
function isRestoring() {
  return busy === 'restore';
}

function lock(kind) {
  if (busy) {
    const err = new Error(`A database ${busy} is already running. Try again in a minute.`);
    err.statusCode = 409;
    throw err;
  }
  busy = kind;
}

function unlock() {
  busy = null;
}

function db() {
  const conn = mongoose.connection;
  if (!conn?.db) {
    const err = new Error('Database is not connected');
    err.statusCode = 503;
    throw err;
  }
  return conn.db;
}

function line(obj) {
  return `${EJSON.stringify(obj, { relaxed: false })}\n`;
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(
    date.getMinutes()
  )}${p(date.getSeconds())}`;
}

function backupFileName(prefix = 'academy-backup') {
  return `${prefix}_${stamp()}.ndjson.gz`;
}

async function userCollections() {
  const list = await db().listCollections({}, { nameOnly: false }).toArray();
  return list
    .filter((c) => c.type !== 'view' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort();
}

/** All files under uploads/, as forward-slash paths relative to it. */
async function listUploadFiles(dir = UPLOADS_DIR, prefix = '') {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listUploadFiles(path.join(dir, e.name), rel)));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

/** Resolve a backup file path inside uploads/, or null if it would escape the folder. */
function safeUploadPath(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 500) return null;
  if (/[\\\0:]/.test(rel) || rel.startsWith('/')) return null;
  const parts = rel.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  const root = path.resolve(UPLOADS_DIR);
  const abs = path.resolve(root, ...parts);
  if (!abs.startsWith(root + path.sep)) return null;
  return abs;
}

function uploadAbs(rel) {
  return path.join(UPLOADS_DIR, ...rel.split('/'));
}

/** Write one chunk, waiting for the stream to drain when its buffer is full. */
function writeChunk(stream, chunk) {
  if (stream.destroyed) return Promise.reject(new Error('Output stream closed'));
  if (stream.write(chunk)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onDrain = () => {
      stream.off('error', onError);
      stream.off('close', onClose);
      resolve();
    };
    const onError = (err) => {
      stream.off('drain', onDrain);
      stream.off('close', onClose);
      reject(err);
    };
    const onClose = () => {
      stream.off('drain', onDrain);
      stream.off('error', onError);
      reject(new Error('Output stream closed'));
    };
    stream.once('drain', onDrain);
    stream.once('error', onError);
    stream.once('close', onClose);
  });
}

/** Stream a full backup into a writable (HTTP response or file). Caller holds the lock. */
async function writeBackup(output, onProgress = () => {}) {
  const database = db();
  const names = await userCollections();
  const collections = [];
  for (const name of names) {
    collections.push({ name, count: await database.collection(name).countDocuments() });
  }
  const uploadFiles = await listUploadFiles();
  let uploadBytes = 0;
  for (const rel of uploadFiles) uploadBytes += (await fs.promises.stat(uploadAbs(rel))).size;
  onProgress({ total: collections.reduce((sum, c) => sum + c.count, 0) + uploadFiles.length });

  const gzip = zlib.createGzip({ level: 6 });
  const done = pipeline(gzip, output);

  try {
    await writeChunk(
      gzip,
      line({
        type: 'header',
        format: FORMAT,
        version: VERSION,
        createdAt: new Date().toISOString(),
        database: database.databaseName,
        collections,
        files: { count: uploadFiles.length, bytes: uploadBytes },
      })
    );

    let totalDocs = 0;
    for (const { name } of collections) {
      const coll = database.collection(name);
      const indexes = (await coll.indexes()).filter((ix) => ix.name !== '_id_');
      await writeChunk(gzip, line({ type: 'collection', name, indexes }));
      for await (const doc of coll.find({}, { batchSize: 1000 })) {
        await writeChunk(gzip, line({ type: 'doc', c: name, d: doc }));
        totalDocs += 1;
        onProgress({ tick: 1 });
      }
    }

    let files = 0;
    for (const rel of uploadFiles) {
      let buf;
      try {
        buf = await fs.promises.readFile(uploadAbs(rel));
      } catch (err) {
        if (err.code === 'ENOENT') continue; // deleted while the backup was running
        throw err;
      }
      await writeChunk(gzip, line({ type: 'file', path: rel, size: buf.length, data: buf.toString('base64') }));
      files += 1;
      onProgress({ tick: 1 });
    }

    await writeChunk(gzip, line({ type: 'end', totalDocs, files }));
    gzip.end();
    await done;
    return { collections: collections.length, totalDocs, files };
  } catch (err) {
    gzip.destroy(err);
    await done.catch(() => {});
    throw err;
  }
}

/**
 * Stream a backup straight to the HTTP response (browser download only).
 * Does not write a copy into the configured backup folder.
 */
async function streamBackupTo(res) {
  backupSettings.resolveWorkingDir({ requireConfigured: true });
  lock('backup');
  try {
    return await writeBackup(res);
  } finally {
    unlock();
  }
}

/** Read a backup file line by line, calling `onRecord` for every parsed record. */
async function readBackupFile(filePath, onRecord) {
  const input = fs.createReadStream(filePath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNo = 0;
  try {
    for await (const raw of rl) {
      lineNo += 1;
      if (!raw.trim()) continue;
      let rec;
      try {
        rec = EJSON.parse(raw, { relaxed: false });
      } catch {
        throw badFile(`Line ${lineNo} is not valid backup data`);
      }
      await onRecord(rec, lineNo);
    }
  } catch (err) {
    if (err.statusCode) throw err;
    if (err.code === 'Z_DATA_ERROR' || /incorrect header check|unexpected end/i.test(err.message)) {
      throw badFile('This is not a valid backup file (it must be the .ndjson.gz file downloaded from Backup)');
    }
    throw err;
  } finally {
    rl.close();
    input.destroy();
  }
}

function badFile(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

/** Full pass over the file without touching the database. */
async function validateBackupFile(filePath, onProgress = () => {}) {
  let header = null;
  let ended = false;
  let current = null;
  const counts = new Map();
  let fileCount = 0;
  let fileBytes = 0;
  const filePaths = new Set();

  await readBackupFile(filePath, (rec, lineNo) => {
    if (lineNo === 1) {
      if (rec?.type !== 'header' || rec.format !== FORMAT) {
        throw badFile('This is not an academy backup file');
      }
      if (Number(rec.version) > VERSION) {
        throw badFile('This backup was made by a newer version of the system');
      }
      if (!Array.isArray(rec.collections)) throw badFile('Backup header is damaged');
      header = rec;
      onProgress({
        total:
          rec.collections.reduce((sum, c) => sum + (Number(c.count) || 0), 0) + (Number(rec.files?.count) || 0),
      });
      return;
    }
    if (ended) throw badFile('Backup file has data after its end marker');
    if (rec.type === 'collection') {
      if (typeof rec.name !== 'string' || !rec.name || rec.name.startsWith('system.')) {
        throw badFile(`Invalid collection name on line ${lineNo}`);
      }
      current = rec.name;
      counts.set(current, 0);
    } else if (rec.type === 'doc') {
      if (rec.c !== current || !rec.d || typeof rec.d !== 'object') {
        throw badFile(`Backup data is out of order on line ${lineNo}`);
      }
      counts.set(current, counts.get(current) + 1);
      onProgress({ tick: 1 });
    } else if (rec.type === 'file') {
      if (!header.files) throw badFile(`Unexpected file on line ${lineNo}`);
      if (!safeUploadPath(rec.path) || filePaths.has(rec.path)) {
        throw badFile(`Invalid file path on line ${lineNo}`);
      }
      if (typeof rec.data !== 'string' || Buffer.from(rec.data, 'base64').length !== Number(rec.size)) {
        throw badFile(`File "${rec.path}" in the backup is damaged`);
      }
      current = null; // no more docs after files
      filePaths.add(rec.path);
      fileCount += 1;
      fileBytes += Number(rec.size);
      onProgress({ tick: 1 });
    } else if (rec.type === 'end') {
      ended = true;
    } else {
      throw badFile(`Unknown record on line ${lineNo}`);
    }
  });

  if (!header) throw badFile('Backup file is empty');
  if (!ended) throw badFile('Backup file is incomplete (it was cut off while downloading or uploading)');

  let totalDocs = 0;
  for (const c of header.collections) {
    if (!counts.has(c.name)) throw badFile(`Collection "${c.name}" is missing from the backup`);
    totalDocs += counts.get(c.name);
  }
  // Files deleted while the backup ran are skipped, so the file may hold fewer than the header.
  if (header.files && fileCount > Number(header.files.count)) {
    throw badFile('Backup file list is damaged');
  }

  return {
    createdAt: header.createdAt,
    database: header.database,
    collections: header.collections.map((c) => ({ name: c.name, count: counts.get(c.name) })),
    totalDocs,
    includesFiles: Boolean(header.files),
    files: fileCount,
    fileBytes,
  };
}

function cleanIndexSpec(ix) {
  const { v, ns, ...rest } = ix;
  return rest;
}

/**
 * Make the database match the (already validated) file exactly: every collection in
 * the file is replaced, and collections that are not in the file are dropped.
 * When the backup includes files, uploads/ is made to match it too.
 */
async function applyBackupFile(filePath, onProgress = () => {}) {
  const database = db();
  const existing = new Set(await userCollections());
  let current = null;
  let indexes = [];
  let batch = [];
  let totalDocs = 0;
  const seen = new Set();
  let includesFiles = false;
  const restoredFiles = new Set();

  const flush = async () => {
    if (!batch.length) return;
    await database.collection(current).insertMany(batch, { ordered: true });
    totalDocs += batch.length;
    onProgress({ tick: batch.length });
    batch = [];
  };

  const finishCollection = async () => {
    if (!current) return;
    await flush();
    if (indexes.length) {
      await database.command({ createIndexes: current, indexes: indexes.map(cleanIndexSpec) });
    }
  };

  await readBackupFile(filePath, async (rec, lineNo) => {
    if (lineNo === 1) {
      includesFiles = Boolean(rec.files);
      return;
    }
    if (rec.type === 'collection') {
      await finishCollection();
      current = rec.name;
      seen.add(current);
      indexes = Array.isArray(rec.indexes) ? rec.indexes : [];
      if (existing.has(current)) await database.collection(current).drop();
      try {
        await database.createCollection(current);
      } catch (err) {
        if (err?.code !== 48) throw err; // NamespaceExists — re-created meanwhile, clear it instead
        await database.collection(current).deleteMany({});
      }
    } else if (rec.type === 'doc') {
      batch.push(rec.d);
      if (batch.length >= INSERT_BATCH) await flush();
    } else if (rec.type === 'file') {
      await finishCollection();
      current = null;
      const abs = safeUploadPath(rec.path);
      if (!abs) throw new Error(`Invalid file path: ${rec.path}`);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, Buffer.from(rec.data, 'base64'));
      restoredFiles.add(rec.path);
      onProgress({ tick: 1 });
    } else if (rec.type === 'end') {
      await finishCollection();
      current = null;
    }
  });

  if (includesFiles) {
    for (const rel of await listUploadFiles()) {
      if (!restoredFiles.has(rel)) await fs.promises.unlink(uploadAbs(rel)).catch(() => {});
    }
  }

  for (const name of existing) {
    if (!seen.has(name)) await database.collection(name).drop();
  }

  return { totalDocs, files: restoredFiles.size };
}

async function pruneSafetyBackups() {
  try {
    const dir = safetyDir();
    const files = (await fs.promises.readdir(dir))
      .filter((f) => f.startsWith('pre-restore_') && f.endsWith('.ndjson.gz'))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - SAFETY_KEEP))) {
      await fs.promises.unlink(path.join(dir, f)).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/**
 * Restore from an uploaded backup file.
 * Returns a summary; throws with statusCode 400 for a bad file (database untouched).
 */
async function restoreFromFile(filePath, { jobId } = {}) {
  lock('restore');
  startJob(jobId);
  // Progress callback for the current phase: {total} sets the size, {tick} counts work done.
  const progress = ({ total, tick: n }) => {
    if (total !== undefined && job) job.total = total;
    if (n) tick(n);
  };
  try {
    const summary = await validateBackupFile(filePath, progress);

    setPhase('safety');
    const dir = safetyDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const safetyFile = path.join(dir, backupFileName('pre-restore'));
    await writeBackup(fs.createWriteStream(safetyFile), progress);

    try {
      setPhase('restoring', summary.totalDocs + summary.files);
      const applied = await applyBackupFile(filePath, progress);
      setPhase('done', 1);
      tick(1);
      await pruneSafetyBackups();
      return {
        ...summary,
        restoredDocs: applied.totalDocs,
        restoredFiles: applied.files,
        safetyBackup: path.basename(safetyFile),
      };
    } catch (err) {
      console.error('[backup] restore failed, rolling back:', err?.message || err);
      let rolledBack = false;
      try {
        setPhase('rolling_back');
        await applyBackupFile(safetyFile);
        rolledBack = true;
      } catch (rollbackErr) {
        console.error('[backup] ROLLBACK FAILED:', rollbackErr?.message || rollbackErr);
      }
      const e = new Error(
        rolledBack
          ? `Restore failed and the previous data and files were put back: ${err.message}`
          : `Restore failed and automatic rollback also failed. The previous data is saved on the server at ${safetyFile}. Error: ${err.message}`
      );
      e.statusCode = 500;
      throw e;
    }
  } catch (err) {
    if (job) {
      job.phase = 'failed';
      job.error = err.message;
    }
    throw err;
  } finally {
    if (job) job.finishedAt = Date.now();
    unlock();
  }
}

module.exports = {
  backupFileName,
  streamBackupTo,
  restoreFromFile,
  validateBackupFile,
  getJobStatus,
  isRestoring,
};
