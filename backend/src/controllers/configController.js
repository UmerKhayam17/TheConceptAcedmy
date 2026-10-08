const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { getSystemModulesForApi } = require('../config/systemModules');
const { logAudit } = require('../services/session/auditService');
const {
  assertSessionWritable,
  syncSessionFlags,
  resolveSessionStatus,
  healSessionFlags,
} = require('../services/session/sessionGuard');
const Session = require('../models/Session');
const AcademyClass = require('../models/academy/AcademyClass');
const AcademySection = require('../models/academy/AcademySection');
const AcademySubject = require('../models/academy/AcademySubject');
const AcademyStudent = require('../models/academy/AcademyStudent');
const academyClassService = require('../services/academy/academyClassService');
const academySectionService = require('../services/academy/academySectionService');
const academySubjectService = require('../services/academy/academySubjectService');

/** Shape Academy class for timetable UI (name/session aliases). */
function shapeClass(cls, sections = [], subjects = []) {
  const plain = typeof cls.toObject === 'function' ? cls.toObject() : { ...cls };
  return {
    ...plain,
    name: plain.className || plain.name,
    session: plain.sessionId || plain.session,
    sections,
    subjects,
  };
}

function shapeSection(sec, classDoc) {
  const plain = typeof sec.toObject === 'function' ? sec.toObject() : { ...sec };
  const classId = plain.classId?._id || plain.classId || plain.class;
  return {
    ...plain,
    name: plain.sectionName || plain.name,
    class: classDoc
      ? {
          _id: classDoc._id,
          name: classDoc.className || classDoc.name,
          session: classDoc.sessionId || classDoc.session,
        }
      : plain.classId && typeof plain.classId === 'object'
        ? {
            _id: plain.classId._id,
            name: plain.classId.className,
            session: plain.classId.sessionId,
          }
        : classId,
    studentCount: plain.studentCount || 0,
  };
}

function shapeSubject(sub, classDoc) {
  const plain = typeof sub.toObject === 'function' ? sub.toObject() : { ...sub };
  return {
    ...plain,
    name: plain.subjectName || plain.name,
    code: plain.subjectCode || plain.code,
    class: classDoc
      ? { _id: classDoc._id, name: classDoc.className || classDoc.name }
      : plain.classId && typeof plain.classId === 'object'
        ? { _id: plain.classId._id, name: plain.classId.className }
        : plain.classId || plain.class,
  };
}

const listSessions = catchAsync(async (req, res) => {
  const { status } = req.query;
  const q = status ? { status } : {};
  const sessions = await Session.find(q).sort({ startDate: -1 });
  const normalized = sessions.map((s) => {
    const doc = s.toObject();
    doc.status = resolveSessionStatus(s);
    doc.writable = doc.status === 'active';
    return doc;
  });
  res.json({ success: true, data: normalized });
});

const createSession = catchAsync(async (req, res) => {
  const body = { ...req.body };
  const name = body.name?.trim();
  if (!name) throw new ApiError(400, 'Session name is required');

  const duplicate = await Session.findOne({ name });
  if (duplicate) {
    throw new ApiError(409, `A session named "${name}" already exists`);
  }

  const existingCount = await Session.countDocuments();
  const shouldActivate =
    existingCount === 0 ||
    (body.isActive !== false && body.status !== 'completed' && body.status !== 'archived');

  if (shouldActivate && existingCount > 0) {
    await Session.updateMany(
      {},
      { $set: { isActive: false, status: 'completed', isClosed: true } }
    );
  }

  const session = await Session.create({
    name,
    startDate: body.startDate,
    endDate: body.endDate,
    workingDays: body.workingDays,
    timezone: body.timezone,
    notes: body.notes,
    createdBy: req.user._id,
  });
  if (shouldActivate) {
    syncSessionFlags(session, 'active');
  } else {
    syncSessionFlags(session, body.status || 'completed');
  }
  await session.save();

  await logAudit({
    sessionId: session._id,
    action: 'SESSION_CREATED',
    userId: req.user._id,
    details: { name: session.name },
  });
  res.status(201).json({ success: true, data: session });
});

const patchSession = catchAsync(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Session not found');
  if (session.status === 'archived') {
    throw new ApiError(403, 'Archived sessions cannot be modified');
  }

  const updates = { ...req.body };
  if (updates.status === 'archived' || updates.status === 'completed') {
    throw new ApiError(400, 'Use session lifecycle endpoints to complete or archive a session');
  }
  if (updates.isActive || updates.status === 'active') {
    const currentStatus = resolveSessionStatus(session);
    if (currentStatus === 'completed' || currentStatus === 'archived') {
      throw new ApiError(400, 'Completed sessions cannot be reactivated. Create a new session instead.');
    }
    await Session.updateMany(
      { _id: { $ne: req.params.id } },
      { $set: { isActive: false, status: 'completed', isClosed: true } }
    );
    updates.isActive = true;
    updates.status = 'active';
    updates.isClosed = false;
  }

  const updated = await Session.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (updated) await healSessionFlags(updated);
  const data = await Session.findById(req.params.id);
  res.json({ success: true, data });
});

const listClasses = catchAsync(async (req, res) => {
  const { sessionId } = req.query;
  const q = sessionId ? { sessionId } : {};
  const { sortClassesByLevel, sortSectionsByName } = require('../utils/classLevelSort');
  const classesRaw = await AcademyClass.find(q);
  const classes = sortClassesByLevel(classesRaw);
  const classIds = classes.map((c) => c._id);
  const [sectionsRaw, subjects] = await Promise.all([
    AcademySection.find({ classId: { $in: classIds } }),
    AcademySubject.find({ classId: { $in: classIds }, status: 'active' }).sort({ subjectName: 1 }),
  ]);
  const sections = sortSectionsByName(sectionsRaw);

  const sectionsByClass = new Map();
  const subjectsByClass = new Map();
  sections.forEach((s) => {
    const key = String(s.classId);
    if (!sectionsByClass.has(key)) sectionsByClass.set(key, []);
    sectionsByClass.get(key).push(shapeSection(s));
  });
  subjects.forEach((s) => {
    const key = String(s.classId);
    if (!subjectsByClass.has(key)) subjectsByClass.set(key, []);
    subjectsByClass.get(key).push(shapeSubject(s));
  });

  const data = classes.map((c) =>
    shapeClass(c, sectionsByClass.get(String(c._id)) || [], subjectsByClass.get(String(c._id)) || [])
  );
  res.json({ success: true, data });
});

const createClass = catchAsync(async (req, res) => {
  const sessionId = req.body.session || req.body.sessionId;
  await assertSessionWritable(sessionId);
  const cls = await academyClassService.createClass(
    {
      sessionId,
      className: (req.body.name || req.body.className || '').trim(),
      totalSubjects: req.body.totalSubjects,
      status: req.body.status || 'active',
    },
    req.user._id
  );
  res.status(201).json({ success: true, data: shapeClass(cls, [], []) });
});

const patchClass = catchAsync(async (req, res) => {
  const existing = await AcademyClass.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Class not found');
  await assertSessionWritable(existing.sessionId);
  const cls = await academyClassService.updateClass(req.params.id, {
    className: req.body.name || req.body.className,
    totalSubjects: req.body.totalSubjects,
    status: req.body.status,
  });
  res.json({ success: true, data: shapeClass(cls) });
});

const createSection = catchAsync(async (req, res) => {
  const classId = req.body.class || req.body.classId;
  const parentClass = await AcademyClass.findById(classId);
  if (!parentClass) throw new ApiError(404, 'Class not found');
  await assertSessionWritable(parentClass.sessionId);
  const section = await academySectionService.createSection(
    {
      classId,
      sectionName: (req.body.name || req.body.sectionName || '').trim(),
      useClassSubjects: true,
      status: 'active',
    },
    req.user._id
  );
  const populated = await AcademySection.findById(section._id).populate('classId', 'className sessionId');
  res.status(201).json({
    success: true,
    data: { ...shapeSection(populated, parentClass), studentCount: 0 },
  });
});

const patchSection = catchAsync(async (req, res) => {
  const existing = await AcademySection.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Section not found');
  const parentClass = await AcademyClass.findById(existing.classId);
  if (!parentClass) throw new ApiError(404, 'Class not found');
  await assertSessionWritable(parentClass.sessionId);

  const updates = {};
  if (req.body.name || req.body.sectionName) {
    updates.sectionName = (req.body.name || req.body.sectionName).trim();
  }
  if (req.body.status) updates.status = req.body.status;
  const section = await academySectionService.updateSection(req.params.id, updates);
  const studentCount = await AcademyStudent.countDocuments({ sectionId: section._id });
  res.json({
    success: true,
    data: { ...shapeSection(section, parentClass), studentCount },
  });
});

const deleteSection = catchAsync(async (req, res) => {
  const section = await AcademySection.findById(req.params.id);
  if (!section) throw new ApiError(404, 'Section not found');
  const parentClass = await AcademyClass.findById(section.classId);
  if (!parentClass) throw new ApiError(404, 'Class not found');
  await assertSessionWritable(parentClass.sessionId);

  const enrolled = await AcademyStudent.countDocuments({ sectionId: section._id });
  if (enrolled > 0) {
    throw new ApiError(400, `Cannot delete section: ${enrolled} student(s) are enrolled. Move or remove them first.`);
  }

  await academySectionService.deleteSection(req.params.id);
  res.json({ success: true, data: { deleted: true } });
});

const createSubject = catchAsync(async (req, res) => {
  const classId = req.body.class || req.body.classId;
  const parentClass = await AcademyClass.findById(classId);
  if (!parentClass) throw new ApiError(404, 'Class not found');
  await assertSessionWritable(parentClass.sessionId);
  const subject = await academySubjectService.createSubject(
    {
      classId,
      subjectName: (req.body.name || req.body.subjectName || '').trim(),
      subjectCode: (req.body.code || req.body.subjectCode || '').trim().toUpperCase(),
      status: 'active',
    },
    req.user._id
  );
  res.status(201).json({ success: true, data: shapeSubject(subject, parentClass) });
});

const listSections = catchAsync(async (req, res) => {
  const { classId, sessionId } = req.query;
  const q = {};
  if (classId) {
    q.classId = classId;
  } else if (sessionId) {
    const classes = await AcademyClass.find({ sessionId }).select('_id');
    q.classId = { $in: classes.map((c) => c._id) };
  }
  const sections = await AcademySection.find(q)
    .populate('classId', 'className sessionId')
    .sort({ classId: 1, sectionName: 1 });

  const sectionIds = sections.map((s) => s._id);
  const counts = sectionIds.length
    ? await AcademyStudent.aggregate([
        { $match: { sectionId: { $in: sectionIds } } },
        { $group: { _id: '$sectionId', count: { $sum: 1 } } },
      ])
    : [];
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

  const data = sections.map((s) => ({
    ...shapeSection(s),
    studentCount: countMap[String(s._id)] || 0,
  }));

  res.json({ success: true, data });
});

const listSubjects = catchAsync(async (req, res) => {
  const { classId } = req.query;
  const q = classId ? { classId } : {};
  if (!req.query.includeInactive) q.status = 'active';
  const subjects = await AcademySubject.find(q).populate('classId', 'className sessionId');
  res.json({ success: true, data: subjects.map((s) => shapeSubject(s)) });
});

const patchSubject = catchAsync(async (req, res) => {
  const subject = await academySubjectService.updateSubject(req.params.id, {
    subjectName: req.body.name || req.body.subjectName,
    subjectCode: req.body.code || req.body.subjectCode,
    status: req.body.status,
  });
  const populated = await AcademySubject.findById(subject._id).populate('classId', 'className sessionId');
  res.json({ success: true, data: shapeSubject(populated) });
});

/** Canonical RBAC module list (same source as `moduleConfig` / staff matrix). */
const listSystemModules = catchAsync(async (req, res) => {
  res.json({ success: true, data: { modules: getSystemModulesForApi() } });
});

module.exports = {
  listSessions,
  createSession,
  patchSession,
  listClasses,
  createClass,
  patchClass,
  createSection,
  patchSection,
  deleteSection,
  createSubject,
  listSubjects,
  patchSubject,
  listSections,
  listSystemModules,
};
