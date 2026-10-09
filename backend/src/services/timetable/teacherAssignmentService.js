const TeacherAssignment = require('../../models/timetable/TeacherAssignment');
const ApiError = require('../../utils/ApiError');
const { assertSessionWritable } = require('../session/sessionGuard');
const { assertTeacherOnSessionRoster } = require('./teacherProfileService');

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
  return TeacherAssignment.create({ ...body, createdBy: userId });
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

  return listTeacherAssignments({ sessionId: session, teacherId: teacher });
}

/**
 * Assign exactly one teacher to a subject in a class section.
 * Clears any previous teachers for that section+subject, or clears when teacher is null/empty.
 */
async function upsertSubjectTeacher(body, userId) {
  const { session, class: classId, section, subject, teacher } = body;
  await assertSessionWritable(session);

  await TeacherAssignment.deleteMany({ session, section, subject });

  if (!teacher) {
    return { cleared: true, data: null };
  }

  await assertTeacherOnSessionRoster(session, teacher);

  const row = await TeacherAssignment.create({
    session,
    class: classId,
    section,
    subject,
    teacher,
    isPrimary: true,
    priority: 1,
    createdBy: userId,
  });

  return {
    cleared: false,
    data: await TeacherAssignment.findById(row._id).populate(populateOpts),
  };
}

/**
 * Sync all subject→teacher mappings for one class section.
 * items[].teacher may be null/empty to leave unassigned.
 */
async function syncSectionSubjectTeachers(body, userId) {
  const { session, class: classId, section, items } = body;
  await assertSessionWritable(session);

  const subjectIds = items.map((i) => i.subject);
  if (subjectIds.length) {
    await TeacherAssignment.deleteMany({
      session,
      section,
      subject: { $in: subjectIds },
    });
  }

  const toCreate = items
    .filter((i) => i.teacher)
    .map((i) => ({
      session,
      class: classId,
      section,
      subject: i.subject,
      teacher: i.teacher,
      isPrimary: true,
      priority: 1,
      createdBy: userId,
    }));

  for (const row of toCreate) {
    // eslint-disable-next-line no-await-in-loop
    await assertTeacherOnSessionRoster(session, row.teacher);
  }

  if (toCreate.length) {
    try {
      await TeacherAssignment.insertMany(toCreate, { ordered: false });
    } catch (err) {
      if (err?.code !== 11000 && !err?.writeErrors) throw err;
    }
  }

  return listTeacherAssignments({ sessionId: session, sectionId: section });
}

async function updateTeacherAssignment(id, body) {
  const existing = await TeacherAssignment.findById(id);
  if (!existing) throw new ApiError(404, 'Teacher assignment not found');
  await assertSessionWritable(existing.session);
  if (body.teacher) {
    await assertTeacherOnSessionRoster(existing.session, body.teacher);
  }
  const row = await TeacherAssignment.findByIdAndUpdate(id, body, {
    new: true,
    runValidators: true,
  }).populate(populateOpts);
  if (!row) throw new ApiError(404, 'Teacher assignment not found');
  return row;
}

async function deleteTeacherAssignment(id) {
  const existing = await TeacherAssignment.findById(id);
  if (!existing) throw new ApiError(404, 'Teacher assignment not found');
  await assertSessionWritable(existing.session);
  const row = await TeacherAssignment.findByIdAndDelete(id);
  if (!row) throw new ApiError(404, 'Teacher assignment not found');
  return { deleted: true };
}

module.exports = {
  listTeacherAssignments,
  getTeacherAssignment,
  createTeacherAssignment,
  bulkSyncTeacherAssignments,
  upsertSubjectTeacher,
  syncSectionSubjectTeachers,
  updateTeacherAssignment,
  deleteTeacherAssignment,
};
