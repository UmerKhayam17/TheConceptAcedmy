const os = require('os');
const fs = require('fs');
const { Router } = require('express');
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { isSystemAdmin } = require('../utils/systemAdmin');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const backupService = require('../services/backupService');
const backupSettings = require('../services/backupSettings');
const User = require('../models/User');
const { startSessionFor } = require('../controllers/authController');

/** Random id the page picks for one restore, used to poll its progress. */
const JOB_ID = /^[A-Za-z0-9-]{16,64}$/;

const MAX_UPLOAD_MB = Number(process.env.BACKUP_MAX_UPLOAD_MB) || 2048;

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `academy-restore-${Date.now()}-${process.pid}.gz`),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (!/\.gz$/i.test(file.originalname)) {
      return cb(new ApiError(400, 'Choose the backup file (.ndjson.gz) downloaded from Backup'));
    }
    return cb(null, true);
  },
});

/** Backups contain every record (incl. password hashes): main admin account only. */
function requireSystemAdmin(req, res, next) {
  if (!isSystemAdmin(req.user)) {
    return next(new ApiError(403, 'Only the main administrator can back up or restore the database'));
  }
  return next();
}

function uploadBackup(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, `Backup file is too large (maximum ${MAX_UPLOAD_MB} MB)`));
    }
    return next(err);
  });
}

const getSettings = catchAsync(async (req, res) => {
  res.json({ success: true, data: backupSettings.getStatus() });
});

const updateSettings = catchAsync(async (req, res) => {
  const data = await backupSettings.setBackupPath(req.body?.backupPath);
  res.json({ success: true, data });
});

const download = async (req, res, next) => {
  try {
    // Must be configured before we start streaming headers.
    backupSettings.resolveWorkingDir({ requireConfigured: true });
  } catch (err) {
    return next(err.statusCode ? new ApiError(err.statusCode, err.message) : err);
  }

  const fileName = backupService.backupFileName();
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('X-Backup-Filename', fileName);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Backup-Filename');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await backupService.streamBackupTo(res);
    console.log(
      `[backup] downloaded by ${req.user?.email}: ${fileName} (${result.collections} collections, ${result.totalDocs} docs)`
    );
  } catch (err) {
    console.error('[backup] download failed:', err?.message || err);
    if (!res.headersSent) {
      res.removeHeader('Content-Disposition');
      return next(err.statusCode ? new ApiError(err.statusCode, err.message) : err);
    }
    res.destroy(err); // client sees a failed download instead of a cut-off file
  }
  return undefined;
};

const restore = catchAsync(async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!filePath) throw new ApiError(400, 'No backup file uploaded');
    if (String(req.body?.confirm || '') !== 'RESTORE') {
      throw new ApiError(400, 'Type RESTORE to confirm');
    }
    const jobId = JOB_ID.test(String(req.body?.jobId || '')) ? String(req.body.jobId) : undefined;
    const adminEmail = req.user?.email;
    let data;
    try {
      data = await backupService.restoreFromFile(filePath, { jobId });
    } catch (err) {
      if (err.statusCode) throw new ApiError(err.statusCode, err.message);
      throw err;
    }
    console.log(`[backup] restored by ${adminEmail}: ${data.restoredDocs} docs, ${data.restoredFiles} files from ${data.createdAt}`);

    // The restore replaced every account (and its stored login), so sign the main admin
    // straight back in as the restored account instead of logging them out.
    let session = null;
    try {
      const restoredAdmin = await User.findOne({ email: adminEmail });
      if (restoredAdmin && isSystemAdmin(restoredAdmin)) {
        session = await startSessionFor(req, res, restoredAdmin);
      }
    } catch (err) {
      console.error('[backup] could not start a session after restore:', err?.message || err);
    }
    res.json({ success: true, data: { ...data, session } });
  } finally {
    if (filePath) fs.promises.unlink(filePath).catch(() => { });
  }
});

/**
 * Restore progress for a job id the page generated itself. Open (no login) on purpose:
 * accounts are being replaced while it runs, and it returns only phase + counters.
 */
const status = (req, res) => {
  const data = JOB_ID.test(req.params.jobId) ? backupService.getJobStatus(req.params.jobId) : null;
  res.setHeader('Cache-Control', 'no-store');
  if (!data) return res.status(404).json({ success: false, message: 'No restore with this id' });
  return res.json({ success: true, data });
};

const router = Router();
router.get('/status/:jobId', status);
router.use(protect, requireSystemAdmin);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.get('/download', download);
router.post('/restore', uploadBackup, restore);

module.exports = router;
