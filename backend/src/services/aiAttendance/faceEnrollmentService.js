const fs = require('fs');
const path = require('path');
const AiFaceEnrollment = require('../../models/AiFaceEnrollment');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');
const faceWorker = require('./faceWorkerClient');
const { parseAiEmployeeId } = require('./aiAttendanceIds');

const MIN_IMAGES = 5;
const UPLOAD_ROOT = path.join(__dirname, '../../../uploads/ai-faces');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function personUploadDir(personKey) {
  return path.join(UPLOAD_ROOT, personKey.replace(/[^a-zA-Z0-9_-]/g, '_'));
}

function nextFaceFileIndex(personKey) {
  const dir = personUploadDir(personKey);
  ensureDir(dir);
  let max = 0;
  for (const f of fs.readdirSync(dir)) {
    const m = /^face_(\d+)\.jpg$/i.exec(f);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function saveJpegBase64(personKey, imageBase64) {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new ApiError(400, 'image (base64) required');
  }
  let data = imageBase64.trim();
  const comma = data.indexOf(',');
  if (comma >= 0) data = data.slice(comma + 1);
  if (!data) {
    throw new ApiError(400, 'Invalid image data');
  }
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) {
    throw new ApiError(400, 'Invalid image data');
  }
  const dir = personUploadDir(personKey);
  ensureDir(dir);
  const filename = `face_${String(nextFaceFileIndex(personKey)).padStart(3, '0')}.jpg`;
  const abs = path.join(dir, filename);
  fs.writeFileSync(abs, buf);
  const rel = `/uploads/ai-faces/${path.basename(dir)}/${filename}`.replace(/\\/g, '/');
  return rel;
}

function unlinkQuiet(rel) {
  try {
    const abs = resolveStoredFacePath(rel);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore missing files */
  }
}

async function unsetEmbedding(docId) {
  await AiFaceEnrollment.updateOne({ _id: docId }, { $unset: { embedding: 1 } });
}

async function resolvePerson(personKey) {
  const parsed = parseAiEmployeeId(personKey);
  if (parsed.kind === 'student') {
    const s = await AcademyStudent.findById(parsed.mongoId).select('studentName').lean();
    if (!s) throw new ApiError(404, 'Student not found for face id');
    return { kind: 'student', refId: s._id, displayName: s.studentName };
  }
  if (parsed.kind === 'staff') {
    const u = await User.findById(parsed.mongoId).select('name').lean();
    if (!u) throw new ApiError(404, 'Staff user not found for face id');
    return { kind: 'staff', refId: u._id, displayName: u.name };
  }
  throw new ApiError(400, 'Invalid person key (expected STU-… or STF-…)');
}

async function getOrCreateEnrollment(personKey) {
  let doc = await AiFaceEnrollment.findOne({ personKey });
  if (doc) return doc;
  const person = await resolvePerson(personKey);
  doc = await AiFaceEnrollment.create({
    personKey,
    kind: person.kind,
    refId: person.refId,
    displayName: person.displayName,
    imagePaths: [],
    totalImages: 0,
    isTrained: false,
  });
  return doc;
}

function resolveStoredFacePath(rel) {
  const cleaned = String(rel || '').replace(/^\//, '');
  const abs = path.join(__dirname, '../../..', cleaned);
  const absAlt = path.join(__dirname, '../../../', cleaned);
  if (fs.existsSync(abs)) return abs;
  if (fs.existsSync(absAlt)) return absAlt;
  return abs;
}

async function enrollmentImageFile(personKey, index) {
  const doc = await AiFaceEnrollment.findOne({ personKey }).select('imagePaths').lean();
  if (!doc) throw new ApiError(404, 'Enrollment not found');
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= (doc.imagePaths || []).length) {
    throw new ApiError(404, 'Face image not found');
  }
  const abs = resolveStoredFacePath(doc.imagePaths[i]);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Face image file missing');
  return { absPath: abs, filename: path.basename(abs) };
}

async function enrollmentStatus(personKey) {
  let doc = await getOrCreateEnrollment(personKey);
  // If 5+ images exist but embedding was never applied (e.g. old Train button removed), finish enrollment.
  if (
    doc.totalImages >= MIN_IMAGES &&
    (!doc.isTrained || !Array.isArray(doc.embedding) || !doc.embedding.length)
  ) {
    try {
      await applyEmbeddingFromImages(doc);
      doc = await AiFaceEnrollment.findOne({ personKey });
    } catch (err) {
      doc.lastTrainError = err.message || String(err);
      await AiFaceEnrollment.updateOne(
        { personKey },
        { $set: { lastTrainError: doc.lastTrainError } }
      );
    }
  }
  const hasEmbedding = Array.isArray(doc.embedding) && doc.embedding.length > 0;
  return {
    person_key: doc.personKey,
    kind: doc.kind,
    display_name: doc.displayName,
    total_images: doc.totalImages,
    min_required: MIN_IMAGES,
    /** Fully enrolled = 5+ images and embedding applied */
    is_enrolled: Boolean(doc.isTrained && hasEmbedding),
    is_trained: Boolean(doc.isTrained && hasEmbedding),
    model_version: doc.modelVersion,
    image_count: doc.imagePaths?.length || 0,
    last_train_error: doc.lastTrainError || null,
  };
}

async function applyEmbeddingFromImages(doc) {
  const embeddings = [];
  for (const rel of doc.imagePaths || []) {
    const filePath = resolveStoredFacePath(rel);
    if (!fs.existsSync(filePath)) continue;
    const b64 = `data:image/jpeg;base64,${fs.readFileSync(filePath).toString('base64')}`;
    // eslint-disable-next-line no-await-in-loop
    const analysis = await faceWorker.analyze(b64);
    if (analysis?.embedding?.length) embeddings.push(analysis.embedding);
  }
  if (embeddings.length < Math.min(MIN_IMAGES, doc.imagePaths.length)) {
    throw new ApiError(
      400,
      `Need clear face embeddings from at least ${Math.min(MIN_IMAGES, doc.imagePaths.length)} images (got ${embeddings.length}). Recapture clearer photos.`
    );
  }

  const dim = embeddings[0].length;
  const mean = new Array(dim).fill(0);
  embeddings.forEach((e) => {
    for (let i = 0; i < dim; i += 1) mean[i] += e[i];
  });
  for (let i = 0; i < dim; i += 1) mean[i] /= embeddings.length;
  const norm = Math.hypot(...mean) || 1;
  doc.embedding = mean.map((v) => v / norm);
  doc.isTrained = true;
  doc.modelVersion = 'insightface-buffalo_l';
  await doc.save();
  return embeddings.length;
}

async function captureFace(personKey, imageBase64) {
  const analysis = await faceWorker.analyze(imageBase64);
  if (!analysis?.passed || !analysis?.embedding?.length) {
    throw new ApiError(400, analysis?.message || 'Face quality check failed — capture a clearer face');
  }
  const doc = await getOrCreateEnrollment(personKey);
  const relPath = saveJpegBase64(personKey, imageBase64);
  doc.imagePaths = [...(doc.imagePaths || []), relPath];
  doc.totalImages = doc.imagePaths.length;
  doc.lastTrainError = undefined;
  await doc.save();

  const remaining = Math.max(0, MIN_IMAGES - doc.totalImages);
  if (doc.totalImages < MIN_IMAGES) {
    doc.isTrained = false;
    await doc.save();
    await unsetEmbedding(doc._id);
    return {
      total_images: doc.totalImages,
      min_required: MIN_IMAGES,
      is_trained: false,
      is_enrolled: false,
      path: relPath,
      message: `Captured ${doc.totalImages}/${MIN_IMAGES} — capture ${remaining} more`,
    };
  }

  const imagesUsed = await applyEmbeddingFromImages(doc);
  return {
    total_images: doc.totalImages,
    min_required: MIN_IMAGES,
    is_trained: true,
    is_enrolled: true,
    images_used: imagesUsed,
    path: relPath,
    message:
      doc.totalImages === MIN_IMAGES
        ? `Enrolled — embedding built from ${imagesUsed} faces`
        : `Added photo (${doc.totalImages} total) — embedding updated`,
  };
}

async function deleteEnrollmentImage(personKey, index) {
  const doc = await getOrCreateEnrollment(personKey);
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= (doc.imagePaths || []).length) {
    throw new ApiError(404, 'Face image not found');
  }
  unlinkQuiet(doc.imagePaths[i]);
  doc.imagePaths.splice(i, 1);
  doc.totalImages = doc.imagePaths.length;
  doc.lastTrainError = undefined;

  if (doc.totalImages >= MIN_IMAGES) {
    try {
      const imagesUsed = await applyEmbeddingFromImages(doc);
      return {
        total_images: doc.totalImages,
        min_required: MIN_IMAGES,
        is_trained: true,
        is_enrolled: true,
        images_used: imagesUsed,
        message: `Photo removed — embedding rebuilt from ${imagesUsed} faces`,
      };
    } catch (err) {
      doc.isTrained = false;
      doc.lastTrainError = err.message || String(err);
      await doc.save();
      await unsetEmbedding(doc._id);
      return {
        total_images: doc.totalImages,
        min_required: MIN_IMAGES,
        is_trained: false,
        is_enrolled: false,
        message: `Photo removed, but enrollment needs clearer remaining photos (${doc.lastTrainError})`,
      };
    }
  }

  doc.isTrained = false;
  await doc.save();
  await unsetEmbedding(doc._id);
  const remaining = Math.max(0, MIN_IMAGES - doc.totalImages);
  return {
    total_images: doc.totalImages,
    min_required: MIN_IMAGES,
    is_trained: false,
    is_enrolled: false,
    message:
      remaining > 0
        ? `Photo removed (${doc.totalImages}/${MIN_IMAGES}) — add ${remaining} more to enroll`
        : 'Photo removed',
  };
}

async function deleteAllEnrollmentImages(personKey) {
  const doc = await getOrCreateEnrollment(personKey);
  for (const rel of doc.imagePaths || []) unlinkQuiet(rel);
  const dir = personUploadDir(personKey);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (/^face_\d+\.jpg$/i.test(f)) {
        try {
          fs.unlinkSync(path.join(dir, f));
        } catch {
          /* ignore */
        }
      }
    }
  }
  doc.imagePaths = [];
  doc.totalImages = 0;
  doc.isTrained = false;
  doc.lastTrainError = undefined;
  await doc.save();
  await unsetEmbedding(doc._id);
  return {
    total_images: 0,
    min_required: MIN_IMAGES,
    is_trained: false,
    is_enrolled: false,
    message: 'All enrollment photos removed',
  };
}

async function trainFace(personKey) {
  const doc = await getOrCreateEnrollment(personKey);
  if (doc.totalImages < MIN_IMAGES) {
    throw new ApiError(400, `Need at least ${MIN_IMAGES} face images (have ${doc.totalImages})`);
  }
  const imagesUsed = await applyEmbeddingFromImages(doc);
  return {
    trained: true,
    images_used: imagesUsed,
    enrollment: await enrollmentStatus(personKey),
  };
}

async function buildGallery() {
  const rows = await AiFaceEnrollment.find({
    isTrained: true,
    embedding: { $exists: true, $type: 'array', $ne: [] },
  })
    .select('personKey embedding displayName kind')
    .lean();
  const gallery = {};
  const meta = {};
  rows.forEach((r) => {
    if (Array.isArray(r.embedding) && r.embedding.length) {
      gallery[r.personKey] = r.embedding;
      meta[r.personKey] = { displayName: r.displayName, kind: r.kind };
    }
  });
  return { gallery, meta };
}

async function galleryStats() {
  const [withImages, trained] = await Promise.all([
    AiFaceEnrollment.countDocuments({ totalImages: { $gt: 0 } }),
    AiFaceEnrollment.countDocuments({
      isTrained: true,
      embedding: { $exists: true, $type: 'array', $ne: [] },
    }),
  ]);
  return { enrolled: withImages, trained, min_images: MIN_IMAGES };
}

module.exports = {
  MIN_IMAGES,
  enrollmentStatus,
  enrollmentImageFile,
  captureFace,
  deleteEnrollmentImage,
  deleteAllEnrollmentImages,
  trainFace,
  buildGallery,
  galleryStats,
  getOrCreateEnrollment,
};
