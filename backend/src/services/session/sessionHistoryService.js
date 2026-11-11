const ApiError = require('../../utils/ApiError');
const Session = require('../../models/Session');
const TimetableVersion = require('../../models/timetable/TimetableVersion');
const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const { logAudit, listAuditLogs } = require('./auditService');
const { getSessionOrThrow, syncSessionFlags, activateExclusively } = require('./sessionGuard');
const { shiftFullSessionConfiguration } = require('./sessionShiftService');

async function getAcademySessionSummary(sessionId) {
  const classes = await AcademyClass.find({ sessionId }).sort({ className: 1 }).lean();
  const classIds = classes.map((c) => c._id);
  const sections = classIds.length
    ? await AcademySection.find({ classId: { $in: classIds } })
        .sort({ sectionName: 1 })
        .lean()
    : [];
  const subjects = classIds.length
    ? await AcademySubject.find({ classId: { $in: classIds } })
        .sort({ subjectName: 1 })
        .lean()
    : [];
  const studentCount = classIds.length
    ? await AcademyStudent.countDocuments({ classId: { $in: classIds }, status: 'active' })
    : 0;

  const sectionsByClass = sections.reduce((acc, sec) => {
    const key = String(sec.classId);
    if (!acc[key]) acc[key] = [];
    acc[key].push({ _id: sec._id, sectionName: sec.sectionName, name: sec.sectionName, status: sec.status });
    return acc;
  }, {});

  const subjectsByClass = subjects.reduce((acc, sub) => {
    const key = String(sub.classId);
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      _id: sub._id,
      name: sub.subjectName,
      code: sub.subjectCode,
      subjectName: sub.subjectName,
      subjectCode: sub.subjectCode,
    });
    return acc;
  }, {});

  return {
    classCount: classes.length,
    sectionCount: sections.length,
    studentCount,
    classes: classes.map((c) => ({
      _id: c._id,
      className: c.className,
      name: c.className,
      status: c.status,
      sections: sectionsByClass[String(c._id)] || [],
      subjects: subjectsByClass[String(c._id)] || [],
    })),
  };
}

async function getSessionHistory(sessionId) {
  const session = await getSessionOrThrow(sessionId);
  const academy = await getAcademySessionSummary(sessionId);

  const [versions, auditLogs] = await Promise.all([
    TimetableVersion.find({ session: sessionId })
      .populate('class', 'className')
      .populate('section', 'sectionName')
      .sort({ section: 1, version: -1 }),
    listAuditLogs(sessionId, { limit: 200 }),
  ]);

  const slotCount = await ScheduleSlot.countDocuments({
    timetableVersion: { $in: versions.map((v) => v._id) },
  });

  const versionsByStatus = versions.reduce((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {});

  return {
    session,
    summary: {
      classCount: academy.classCount,
      sectionCount: academy.sectionCount,
      studentCount: academy.studentCount,
      timetableVersions: versions.length,
      scheduleSlots: slotCount,
      versionsByStatus,
    },
    academy,
    classes: academy.classes.map((c) => ({
      _id: c._id,
      name: c.className,
      sections: (c.sections || []).map((s) => ({ _id: s._id, name: s.sectionName || s.name })),
      subjects: (c.subjects || []).map((s) => ({
        _id: s._id,
        name: s.subjectName || s.name,
        code: s.subjectCode || s.code,
      })),
    })),
    timetableVersions: versions,
    auditLogs,
  };
}

async function completeSession(sessionId, userId) {
  const session = await getSessionOrThrow(sessionId);
  if (session.status !== 'active') {
    throw new ApiError(400, 'Only an active session can be completed');
  }

  syncSessionFlags(session, 'completed');
  session.completedAt = new Date();
  await session.save();

  const draftResult = await TimetableVersion.updateMany(
    { session: sessionId, status: 'draft' },
    { $set: { status: 'archived', notes: 'Auto-archived when session completed' } }
  );

  await logAudit({
    sessionId,
    action: 'SESSION_COMPLETED',
    userId,
    details: {
      name: session.name,
      draftsArchived: draftResult.modifiedCount,
    },
  });

  return Session.findById(sessionId);
}

async function archiveSession(sessionId, userId) {
  const session = await getSessionOrThrow(sessionId);
  if (session.status === 'archived') {
    throw new ApiError(400, 'Session is already archived');
  }

  syncSessionFlags(session, 'archived');
  session.archivedAt = new Date();
  if (!session.completedAt) session.completedAt = new Date();
  await session.save();

  await TimetableVersion.updateMany(
    { session: sessionId, status: { $in: ['draft', 'published'] } },
    { $set: { status: 'archived' } }
  );

  await logAudit({
    sessionId,
    action: 'SESSION_ARCHIVED',
    userId,
    details: { name: session.name },
  });

  return Session.findById(sessionId);
}

async function activateSession(sessionId, userId) {
  const session = await getSessionOrThrow(sessionId);
  if (session.status === 'archived') {
    throw new ApiError(400, 'Archived sessions cannot be reactivated. Create a new session instead.');
  }
  if (session.status === 'completed' || session.isClosed) {
    throw new ApiError(400, 'Completed sessions cannot be reactivated. Create a new session or shift configuration from session history.');
  }

  await activateExclusively(session);

  await logAudit({
    sessionId,
    action: 'SESSION_ACTIVATED',
    userId,
    details: { name: session.name },
  });

  return Session.findById(sessionId);
}

async function cloneSessionStructure(sourceSessionId, body, userId) {
  const source = await getSessionOrThrow(sourceSessionId);

  const name = body.name?.trim();
  if (!name) throw new ApiError(400, 'Session name is required');
  const duplicate = await Session.findOne({ name });
  if (duplicate) {
    throw new ApiError(409, `A session named "${name}" already exists`);
  }

  // The configuration is copied into the new session, which needs it to be writable, and a
  // non-active session can never be activated later. So the clone always becomes the one
  // active session and the previous active session is closed.
  if (body.activate === false) {
    throw new ApiError(
      400,
      'A shifted session always becomes the active session. Only one session can be active at a time.'
    );
  }

  const newSession = new Session({
    name,
    startDate: body.startDate,
    endDate: body.endDate,
    workingDays: body.workingDays || source.workingDays,
    timezone: body.timezone || source.timezone,
    clonedFrom: source._id,
    createdBy: userId,
    notes: body.notes || `Shifted configuration from ${source.name}`,
  });
  await activateExclusively(newSession);

  try {
    const { ensureSessionHolidays } = require('../holidayService');
    await ensureSessionHolidays(newSession, userId);
  } catch (err) {
    console.error('[holidays] Could not seed session holidays:', err?.message || err);
  }

  const shift = await shiftFullSessionConfiguration(
    newSession._id,
    { sourceSessionId, includeFeeStructure: body.includeFeeStructure !== false },
    userId
  );

  await logAudit({
    sessionId: sourceSessionId,
    action: 'SESSION_STRUCTURE_CLONED',
    userId,
    details: { targetSessionId: newSession._id, targetName: newSession.name },
  });

  return {
    session: newSession,
    shift,
    maps: {
      classes: shift.timetable.classes,
      sections: shift.timetable.sections,
      subjects: shift.timetable.subjects,
      periodTemplates: shift.timetable.periodTemplates,
    },
  };
}

module.exports = {
  getSessionHistory,
  completeSession,
  archiveSession,
  activateSession,
  cloneSessionStructure,
  shiftFullSessionConfiguration,
};
