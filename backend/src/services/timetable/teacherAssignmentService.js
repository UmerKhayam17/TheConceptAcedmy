const TeacherAssignment = require('../../models/timetable/TeacherAssignment');
const ApiError = require('../../utils/ApiError');
const { assertSessionWritable } = require('../session/sessionGuard');
const { assertTeacherOnSessionRoster } = require('./teacherProfileService');
const { todayYmd } = require('../../utils/schoolDay');

async function refreshUnpaidSalariesForTeachers(teacherIds, userId, reason = 'teacher_assignment') {
  const { safeRefreshUnpaidPercentageSalariesForStaff } = require('../academy/academySalaryService');
  return safeRefreshUnpaidPercentageSalariesForStaff(teacherIds, userId, reason);
}

function academyClassTransform(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return { ...o, name: o.className || o.name };
}

function academySectionTransform(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return { ...o, name: o.sectionName || o.name };
}

function academySubjectTransform(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return { ...o, name: o.subjectName || o.name, code: o.subjectCode || o.code };
}

const populateOpts = [
  { path: 'class', select: 'className', transform: academyClassTransform },
  { path: 'section', select: 'sectionName', transform: academySectionTransform },
  { path: 'subject', select: 'subjectName subjectCode', transform: academySubjectTransform },
  { path: 'teacher', select: 'name email' },
];

/** YYYY-MM-DD or null. */
function normalizeAssignedFrom(value) {
  const s = value != null ? String(value).trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/** Explicit date, else today (academy TZ default). */
function resolveAssignedFrom(explicit) {
  return normalizeAssignedFrom(explicit) || todayYmd();
}

async function listTeacherAssignments({ sessionId, sectionId, classId, teacherId, subjectId }) {
  const q = { isActive: true };
  if (sessionId) q.session = sessionId;
  if (sectionId) q.section = sectionId;
  if (classId) q.class = classId;
  if (teacherId) q.teacher = teacherId;
  if (subjectId) q.subject = subjectId;
  return TeacherAssignment.find(q).populate(populateOpts).sort({ priority: 1 });
}

async function getTeacherAssignment(id) {
  const row = await TeacherAssignment.findById(id).populate(populateOpts);
  if (!row) throw new ApiError(404, 'Teacher assignment not found');
  return row;
}

async function createTeacherAssignment(body, userId) {
  await assertSessionWritable(body.session);
  await assertTeacherOnSessionRoster(body.session, body.teacher);
  const assignedFrom = resolveAssignedFrom(body.assignedFrom);
  const row = await TeacherAssignment.create({
    ...body,
    assignedFrom,
    createdBy: userId,
  });
  await refreshUnpaidSalariesForTeachers([body.teacher], userId, 'assignment_create');
  return row;
}

/**
 * Replace a teacher's subject assignments for a session with the given list.
 * Creates missing rows and deletes rows no longer selected.
 */
async function bulkSyncTeacherAssignments(body, userId) {
  const { session, teacher, assignments } = body;
  await assertSessionWritable(session);
  await assertTeacherOnSessionRoster(session, teacher);

  const desiredKeys = new Set(
    assignments.map((a) => `${String(a.section)}:${String(a.subject)}`)
  );

  const existing = await TeacherAssignment.find({ session, teacher, isActive: true });
  const existingByKey = new Map(
    existing.map((row) => [`${String(row.section)}:${String(row.subject)}`, row])
  );

  const toCreate = [];
  for (const a of assignments) {
    const key = `${String(a.section)}:${String(a.subject)}`;
    if (!existingByKey.has(key)) {
      toCreate.push({
        session,
        teacher,
        class: a.class,
        section: a.section,
        subject: a.subject,
        assignedFrom: resolveAssignedFrom(a.assignedFrom),
        createdBy: userId,
      });
    }
  }

  const toDeleteIds = existing
    .filter((row) => !desiredKeys.has(`${String(row.section)}:${String(row.subject)}`))
    .map((row) => row._id);

  if (toDeleteIds.length) {
    await TeacherAssignment.deleteMany({ _id: { $in: toDeleteIds } });
  }
  if (toCreate.length) {
    try {
      await TeacherAssignment.insertMany(toCreate, { ordered: false });
    } catch (err) {
      // Ignore duplicate-key races; unique index already covers section+subject+teacher
      if (err?.code !== 11000 && !err?.writeErrors) throw err;
    }
  }

  if (toCreate.length || toDeleteIds.length) {
    await refreshUnpaidSalariesForTeachers([teacher], userId, 'assignment_bulk_sync');
  }

  return listTeacherAssignments({ sessionId: session, teacherId: teacher });
}

/**
 * Assign exactly one teacher to a subject in a class section.
 * Clears any previous teachers for that section+subject, or clears when teacher is null/empty.
 */
async function upsertSubjectTeacher(body, userId) {
  const { session, class: classId, section, subject, teacher } = body;
  await assertSessionWritable(session);

  const previous = await TeacherAssignment.find({ session, section, subject }).select(
    'teacher assignedFrom'
  );
  const affectedTeachers = previous.map((r) => r.teacher);
  const sameTeacherPrev = previous.find((r) => teacher && String(r.teacher) === String(teacher));
  await TeacherAssignment.deleteMany({ session, section, subject });

  if (!teacher) {
    await refreshUnpaidSalariesForTeachers(affectedTeachers, userId, 'assignment_clear');
    return { cleared: true, data: null };
  }

  await assertTeacherOnSessionRoster(session, teacher);

  const assignedFrom =
    normalizeAssignedFrom(body.assignedFrom) ||
    (sameTeacherPrev ? normalizeAssignedFrom(sameTeacherPrev.assignedFrom) : null) ||
    todayYmd();

  const row = await TeacherAssignment.create({
    session,
    class: classId,
    section,
    subject,
    teacher,
    assignedFrom,
    isPrimary: true,
    priority: 1,
    createdBy: userId,
  });

  affectedTeachers.push(teacher);
  await refreshUnpaidSalariesForTeachers(affectedTeachers, userId, 'assignment_upsert');

  return {
    cleared: false,
    data: await TeacherAssignment.findById(row._id).populate(populateOpts),
  };
}

/**
 * Sync all subject→teacher mappings for one class section.
 * items[].teacher may be null/empty to leave unassigned.
 * Keeps assignedFrom when the same teacher stays on a subject; new teachers get today (or item.assignedFrom).
 */
async function syncSectionSubjectTeachers(body, userId) {
  const { session, class: classId, section, items } = body;
  await assertSessionWritable(session);

  const subjectIds = items.map((i) => i.subject);
  const previous = subjectIds.length
    ? await TeacherAssignment.find({
        session,
        section,
        subject: { $in: subjectIds },
      }).select('teacher subject assignedFrom')
    : [];
  const previousBySubject = new Map(previous.map((r) => [String(r.subject), r]));
  const affectedTeachers = previous.map((r) => r.teacher);

  if (subjectIds.length) {
    await TeacherAssignment.deleteMany({
      session,
      section,
      subject: { $in: subjectIds },
    });
  }

  const toCreate = items
    .filter((i) => i.teacher)
    .map((i) => {
      const prev = previousBySubject.get(String(i.subject));
      const sameTeacher = prev && String(prev.teacher) === String(i.teacher);
      const assignedFrom =
        normalizeAssignedFrom(i.assignedFrom) ||
        (sameTeacher ? normalizeAssignedFrom(prev.assignedFrom) : null) ||
        todayYmd();
      return {
        session,
        class: classId,
        section,
        subject: i.subject,
        teacher: i.teacher,
        assignedFrom,
        isPrimary: true,
        priority: 1,
        createdBy: userId,
      };
    });

  for (const row of toCreate) {
    // eslint-disable-next-line no-await-in-loop
    await assertTeacherOnSessionRoster(session, row.teacher);
    affectedTeachers.push(row.teacher);
  }

  if (toCreate.length) {
    try {
      await TeacherAssignment.insertMany(toCreate, { ordered: false });
    } catch (err) {
      if (err?.code !== 11000 && !err?.writeErrors) throw err;
    }
  }

  await refreshUnpaidSalariesForTeachers(affectedTeachers, userId, 'assignment_section_sync');

  return listTeacherAssignments({ sessionId: session, sectionId: section });
}

/**
 * Ensure a TeacherAssignment exists for a timetable slot teacher.
 * New teacher for section+subject gets assignedFrom=today; same teacher keeps existing date.
 */
async function ensureAssignmentForSlot({
  session,
  class: classId,
  section,
  subject,
  teacher,
  userId,
  assignedFrom: explicitFrom,
}) {
  if (!session || !classId || !section || !subject || !teacher) return null;

  const existing = await TeacherAssignment.findOne({
    session,
    section,
    subject,
    teacher,
    isActive: true,
  });
  if (existing) {
    if (!existing.assignedFrom && normalizeAssignedFrom(explicitFrom)) {
      existing.assignedFrom = normalizeAssignedFrom(explicitFrom);
      await existing.save();
    }
    return existing;
  }

  // Clear other teachers for this section+subject (one teacher per subject in Assignments).
  const previous = await TeacherAssignment.find({ session, section, subject }).select('teacher');
  if (previous.length) {
    await TeacherAssignment.deleteMany({ session, section, subject });
  }

  try {
    await assertTeacherOnSessionRoster(session, teacher);
  } catch {
    // Class Board may assign before roster sync; still record the date for attendance.
  }

  const row = await TeacherAssignment.create({
    session,
    class: classId,
    section,
    subject,
    teacher,
    assignedFrom: resolveAssignedFrom(explicitFrom),
    isPrimary: true,
    priority: 1,
    createdBy: userId || undefined,
  });

  const affected = [...previous.map((r) => r.teacher), teacher];
  await refreshUnpaidSalariesForTeachers(affected, userId, 'assignment_slot_ensure');
  return row;
}

async function updateTeacherAssignment(id, body) {
  const existing = await TeacherAssignment.findById(id);
  if (!existing) throw new ApiError(404, 'Teacher assignment not found');
  await assertSessionWritable(existing.session);
  if (body.teacher) {
    await assertTeacherOnSessionRoster(existing.session, body.teacher);
  }
  const patch = { ...body };
  if (Object.prototype.hasOwnProperty.call(body, 'assignedFrom')) {
    patch.assignedFrom = normalizeAssignedFrom(body.assignedFrom);
  }
  const previousTeacher = existing.teacher;
  const row = await TeacherAssignment.findByIdAndUpdate(id, patch, {
    new: true,
    runValidators: true,
  }).populate(populateOpts);
  if (!row) throw new ApiError(404, 'Teacher assignment not found');
  await refreshUnpaidSalariesForTeachers(
    [previousTeacher, row.teacher],
    undefined,
    'assignment_update'
  );
  return row;
}

async function deleteTeacherAssignment(id) {
  const existing = await TeacherAssignment.findById(id);
  if (!existing) throw new ApiError(404, 'Teacher assignment not found');
  await assertSessionWritable(existing.session);
  const previousTeacher = existing.teacher;
  const row = await TeacherAssignment.findByIdAndDelete(id);
  if (!row) throw new ApiError(404, 'Teacher assignment not found');
  await refreshUnpaidSalariesForTeachers([previousTeacher], undefined, 'assignment_delete');
  return { deleted: true };
}

module.exports = {
  listTeacherAssignments,
  getTeacherAssignment,
  createTeacherAssignment,
  bulkSyncTeacherAssignments,
  upsertSubjectTeacher,
  syncSectionSubjectTeachers,
  ensureAssignmentForSlot,
  updateTeacherAssignment,
  deleteTeacherAssignment,
};
