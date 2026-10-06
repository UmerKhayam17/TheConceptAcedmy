const ApiError = require('../../utils/ApiError');
const AcademyDiscipline = require('../../models/academy/AcademyDiscipline');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const {
  STANDARD_DISCIPLINES,
  classNameSuggestsDisciplines,
  slugifyCode,
  matchSubjectIdsForHints,
} = require('../../utils/academyDisciplines');

async function normalizeSubjects(classId, subjectIds = []) {
  if (!Array.isArray(subjectIds)) {
    throw new ApiError(400, 'subjectIds must be an array');
  }
  if (subjectIds.length === 0) return [];
  const unique = [...new Set(subjectIds.map(String))];
  const docs = await AcademySubject.find({
    _id: { $in: unique },
    classId,
    status: 'active',
  }).select('_id');
  if (docs.length !== unique.length) {
    throw new ApiError(400, 'One or more subjects are invalid for this class');
  }
  return docs.map((d) => d._id);
}

async function countActiveForClass(classId) {
  return AcademyDiscipline.countDocuments({ classId, status: 'active' });
}

/** Discipline is required at enrollment only when the class has active streams. */
async function classRequiresDiscipline(classId) {
  return (await countActiveForClass(classId)) > 0;
}

const SUBJECT_POPULATE =
  'subjectName subjectCode status enrollmentType choiceGroupName pickCount';

async function listByClass(classId, { status } = {}) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');

  const q = { classId };
  if (status) q.status = status;

  return AcademyDiscipline.find(q)
    .populate('subjectIds', SUBJECT_POPULATE)
    .populate('createdBy', 'name email')
    .sort({ name: 1 });
}

/** All streams for a session (or every session when sessionId is omitted). */
async function listDisciplines({ sessionId, classId, status } = {}) {
  const q = {};
  if (status) q.status = status;

  if (classId) {
    const cls = await AcademyClass.findById(classId).select('_id className');
    if (!cls) throw new ApiError(404, 'Class not found');
    q.classId = classId;
  } else if (sessionId) {
    const classes = await AcademyClass.find({ sessionId }).select('_id');
    q.classId = { $in: classes.map((c) => c._id) };
  }

  const data = await AcademyDiscipline.find(q)
    .populate('classId', 'className')
    .populate('subjectIds', SUBJECT_POPULATE)
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1, name: 1 });

  let meta = null;
  if (classId) {
    const cls = await AcademyClass.findById(classId).select('className');
    meta = {
      requiresDiscipline: await classRequiresDiscipline(classId),
      suggestsDisciplines: cls ? classNameSuggestsDisciplines(cls.className) : false,
    };
  }

  return { data, meta };
}

async function assertDisciplineForClass(disciplineId, classId) {
  if (!disciplineId) return null;
  const doc = await AcademyDiscipline.findById(disciplineId);
  if (!doc) throw new ApiError(404, 'Discipline not found');
  if (String(doc.classId) !== String(classId)) {
    throw new ApiError(400, 'Discipline does not belong to this class');
  }
  if (doc.status !== 'active') throw new ApiError(400, 'Discipline is not active');
  return doc;
}

/**
 * Resolve discipline for enrollment.
 * - Class with no active disciplines → null (9th/10th etc.)
 * - Class with disciplines → disciplineId required
 */
async function resolveEnrollmentDiscipline(classId, disciplineId) {
  const id = disciplineId && String(disciplineId).trim() ? String(disciplineId) : null;
  const required = await classRequiresDiscipline(classId);
  if (!required) return null;
  if (!id) {
    throw new ApiError(400, 'Select a discipline (Medical / Engineering / ICS) for this class');
  }
  await assertDisciplineForClass(id, classId);
  return id;
}

async function createDiscipline(payload, userId) {
  const cls = await AcademyClass.findById(payload.classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (!cls.sessionId) {
    throw new ApiError(
      400,
      'Class is not linked to an academic session. Create the class under an active session first.'
    );
  }

  const name = String(payload.name || '').trim();
  if (!name) throw new ApiError(400, 'Discipline name is required');

  const code = slugifyCode(payload.code || name);
  if (!code) throw new ApiError(400, 'Discipline code is required');

  const dup = await AcademyDiscipline.findOne({
    classId: payload.classId,
    $or: [
      { code },
      { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    ],
  });
  if (dup) throw new ApiError(409, 'Discipline already exists for this class');

  const subjectIds = await normalizeSubjects(payload.classId, payload.subjectIds || []);

  const doc = await AcademyDiscipline.create({
    name,
    code,
    classId: payload.classId,
    subjectIds,
    status: payload.status || 'active',
    createdBy: userId,
  });
  return doc.populate(
    'subjectIds',
    'subjectName subjectCode status enrollmentType choiceGroupName pickCount'
  );
}

/** Create Medical / Engineering / ICS and auto-link matching stream subjects if present. */
async function createStandardDisciplines(classId, userId) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (!cls.sessionId) {
    throw new ApiError(400, 'Class must belong to an academic session');
  }

  const classSubjects = await AcademySubject.find({ classId, status: 'active' })
    .select('_id subjectName')
    .lean();

  const created = [];
  const skipped = [];
  const linked = [];

  for (const std of STANDARD_DISCIPLINES) {
    const exists = await AcademyDiscipline.findOne({ classId, code: std.code });
    if (exists) {
      // Fill empty packages if subjects now exist.
      if ((!exists.subjectIds || exists.subjectIds.length === 0) && classSubjects.length) {
        const ids = matchSubjectIdsForHints(classSubjects, std.subjectHints || []);
        if (ids.length) {
          exists.subjectIds = ids;
          await exists.save();
          linked.push({ code: std.code, count: ids.length });
        }
      }
      skipped.push(std.code);
      continue;
    }
    const subjectIds = matchSubjectIdsForHints(classSubjects, std.subjectHints || []);
    const doc = await AcademyDiscipline.create({
      name: std.name,
      code: std.code,
      classId,
      subjectIds,
      status: 'active',
      createdBy: userId,
    });
    created.push(doc);
    if (subjectIds.length) linked.push({ code: std.code, count: subjectIds.length });
  }
  const all = await listByClass(classId);
  return {
    created: created.length,
    skipped: skipped.length,
    linked,
    suggestsDisciplines: classNameSuggestsDisciplines(cls.className),
    disciplines: all,
  };
}

async function updateDiscipline(id, payload) {
  const doc = await AcademyDiscipline.findById(id);
  if (!doc) throw new ApiError(404, 'Discipline not found');

  if (payload.name !== undefined) {
    const name = String(payload.name || '').trim();
    if (!name) throw new ApiError(400, 'Discipline name is required');
    const dup = await AcademyDiscipline.findOne({
      _id: { $ne: id },
      classId: doc.classId,
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (dup) throw new ApiError(409, 'Discipline name already exists for this class');
    doc.name = name;
  }

  if (payload.code !== undefined) {
    const code = slugifyCode(payload.code);
    if (!code) throw new ApiError(400, 'Discipline code is required');
    const dup = await AcademyDiscipline.findOne({
      _id: { $ne: id },
      classId: doc.classId,
      code,
    });
    if (dup) throw new ApiError(409, 'Discipline code already exists for this class');
    doc.code = code;
  }

  if (payload.status !== undefined) doc.status = payload.status;

  if (payload.subjectIds !== undefined) {
    doc.subjectIds = await normalizeSubjects(doc.classId, payload.subjectIds);
  }

  await doc.save();
  return doc.populate(
    'subjectIds',
    'subjectName subjectCode status enrollmentType choiceGroupName pickCount'
  );
}

async function deleteDiscipline(id) {
  const doc = await AcademyDiscipline.findById(id);
  if (!doc) throw new ApiError(404, 'Discipline not found');

  const inUse = await AcademyStudent.countDocuments({ disciplineId: id });
  if (inUse > 0) {
    throw new ApiError(400, `Cannot delete: ${inUse} student(s) use this discipline`);
  }

  await AcademyDiscipline.deleteOne({ _id: id });
  return { deleted: true };
}

module.exports = {
  STANDARD_DISCIPLINES,
  classNameSuggestsDisciplines,
  countActiveForClass,
  classRequiresDiscipline,
  listByClass,
  listDisciplines,
  assertDisciplineForClass,
  resolveEnrollmentDiscipline,
  createDiscipline,
  createStandardDisciplines,
  updateDiscipline,
  deleteDiscipline,
};
