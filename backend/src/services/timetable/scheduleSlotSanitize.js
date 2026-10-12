/**
 * Guards timetable APIs when AcademySubject (or teacher) refs were deleted
 * after a schedule slot was saved. Populate then returns null and the UI
 * used to crash on `.name`.
 */

const ScheduleSlot = require('../../models/timetable/ScheduleSlot');

const DELETED_SUBJECT = Object.freeze({
  _id: 'deleted',
  name: 'Deleted subject',
  code: '',
  deleted: true,
});

const DELETED_TEACHER = Object.freeze({
  _id: 'deleted',
  name: 'Deleted teacher',
  email: '',
  deleted: true,
});

function toPlain(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === 'function') return doc.toObject({ virtuals: true });
  return { ...doc };
}

function normalizeSubject(subject) {
  if (!subject) return { ...DELETED_SUBJECT };
  const o = toPlain(subject);
  if (!o || (!o._id && !o.subjectName && !o.name)) return { ...DELETED_SUBJECT };
  return {
    ...o,
    name: o.subjectName || o.name || 'Untitled',
    code: o.subjectCode || o.code || '',
  };
}

function normalizeTeacher(teacher) {
  if (!teacher) return { ...DELETED_TEACHER };
  const o = toPlain(teacher);
  if (!o || !o._id) return { ...DELETED_TEACHER };
  return o;
}

/**
 * Ensure a populated slot always has safe subject/teacher objects for the client.
 * Drops parallel entries whose subject is missing; if the primary subject is gone
 * but parallels remain, promotes the first parallel.
 */
function sanitizeSlot(slotDoc) {
  if (!slotDoc) return slotDoc;
  const slot = toPlain(slotDoc);

  const parallels = Array.isArray(slot.parallelEntries) ? slot.parallelEntries : [];
  const validParallels = parallels
    .map((e) => ({
      subject: e?.subject ? normalizeSubject(e.subject) : null,
      teacher: normalizeTeacher(e?.teacher),
    }))
    .filter((e) => e.subject && !e.subject.deleted);

  let subject = slot.subject ? normalizeSubject(slot.subject) : null;
  let teacher = normalizeTeacher(slot.teacher);

  if (!subject || subject.deleted) {
    if (validParallels.length) {
      const [first, ...rest] = validParallels;
      subject = first.subject;
      teacher = first.teacher;
      slot.parallelEntries = rest;
    } else {
      subject = { ...DELETED_SUBJECT };
      slot.parallelEntries = [];
      slot.subjectMissing = true;
    }
  } else {
    slot.parallelEntries = validParallels;
  }

  slot.subject = subject;
  slot.teacher = teacher;
  if (slot.room == null) slot.room = null;
  return slot;
}

function sanitizeSlots(docs) {
  return (docs || []).map(sanitizeSlot);
}

/**
 * Remove a deleted subject from all schedule slots.
 * - Pull from parallelEntries
 * - If primary: promote first remaining parallel, otherwise delete the slot
 */
async function purgeSubjectFromSchedule(subjectId) {
  if (!subjectId) return { updated: 0, deleted: 0 };

  try {
    const TeacherAssignment = require('../../models/timetable/TeacherAssignment');
    await TeacherAssignment.deleteMany({ subject: subjectId });
  } catch (_) {
    // Assignment model optional in some deployments
  }

  await ScheduleSlot.updateMany(
    { 'parallelEntries.subject': subjectId },
    { $pull: { parallelEntries: { subject: subjectId } } }
  );

  const primarySlots = await ScheduleSlot.find({ subject: subjectId });
  let updated = 0;
  let deleted = 0;

  for (const slot of primarySlots) {
    const parallels = Array.isArray(slot.parallelEntries) ? slot.parallelEntries : [];
    if (parallels.length) {
      const [first, ...rest] = parallels;
      slot.subject = first.subject;
      slot.teacher = first.teacher;
      slot.parallelEntries = rest;
      // eslint-disable-next-line no-await-in-loop
      await slot.save();
      updated += 1;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await slot.deleteOne();
      deleted += 1;
    }
  }

  return { updated, deleted };
}

/**
 * Repair slots whose subject/teacher docs were already deleted (populate → null).
 * Call from Class Board / grid reads so legacy orphans do not keep crashing the UI.
 */
async function repairOrphanedSlots(slotDocs) {
  if (!slotDocs?.length) return { repaired: 0, deleted: 0 };
  let repaired = 0;
  let deleted = 0;

  for (const doc of slotDocs) {
    const subjectMissing = !doc.subject;
    const parallels = Array.isArray(doc.parallelEntries) ? doc.parallelEntries : [];
    const validParallels = parallels.filter((e) => e?.subject);
    const parallelChanged = validParallels.length !== parallels.length;

    if (!subjectMissing && !parallelChanged) continue;

    if (subjectMissing && !validParallels.length) {
      // eslint-disable-next-line no-await-in-loop
      await ScheduleSlot.deleteOne({ _id: doc._id });
      deleted += 1;
      continue;
    }

    if (subjectMissing && validParallels.length) {
      const [first, ...rest] = validParallels;
      doc.subject = first.subject._id || first.subject;
      doc.teacher = first.teacher?._id || first.teacher;
      doc.parallelEntries = rest.map((e) => ({
        subject: e.subject._id || e.subject,
        teacher: e.teacher?._id || e.teacher,
      }));
      // eslint-disable-next-line no-await-in-loop
      await doc.save();
      repaired += 1;
      continue;
    }

    if (parallelChanged) {
      doc.parallelEntries = validParallels.map((e) => ({
        subject: e.subject._id || e.subject,
        teacher: e.teacher?._id || e.teacher,
      }));
      // eslint-disable-next-line no-await-in-loop
      await doc.save();
      repaired += 1;
    }
  }

  return { repaired, deleted };
}

module.exports = {
  DELETED_SUBJECT,
  DELETED_TEACHER,
  sanitizeSlot,
  sanitizeSlots,
  purgeSubjectFromSchedule,
  repairOrphanedSlots,
};
