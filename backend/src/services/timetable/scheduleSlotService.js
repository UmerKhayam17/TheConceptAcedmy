const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const TimetableVersion = require('../../models/timetable/TimetableVersion');
const ApiError = require('../../utils/ApiError');
const { WEEKDAYS } = require('../../models/timetable/constants');
const { validateSlot } = require('./timetableConflictService');
const { assertSessionWritable } = require('../session/sessionGuard');

/** School week used by “Apply to Full Week”. */
const FULL_WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

const subjectPopulate = {
  path: 'subject',
  select: 'subjectName subjectCode enrollmentType choiceGroupName',
  transform: (doc) => {
    if (!doc) return doc;
    const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return { ...o, name: o.subjectName || o.name, code: o.subjectCode || o.code };
  },
};

const slotPopulate = [
  subjectPopulate,
  { path: 'teacher', select: 'name email' },
  {
    path: 'parallelEntries.subject',
    select: 'subjectName subjectCode enrollmentType choiceGroupName',
    transform: (doc) => {
      if (!doc) return doc;
      const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
      return { ...o, name: o.subjectName || o.name, code: o.subjectCode || o.code };
    },
  },
  { path: 'parallelEntries.teacher', select: 'name email' },
  { path: 'room', select: 'name code type' },
];

function dayLabel(day) {
  return String(day || '').charAt(0).toUpperCase() + String(day || '').slice(1);
}

/** Compact conflict toast: class · section + grouped days. */
function formatConflictSummary(details, placeLabel) {
  if (!details?.length) return 'Schedule conflicts prevent saving these days';

  const occupied = details.filter((d) => d.code === 'SECTION_PERIOD_OCCUPIED');
  const other = details.filter((d) => d.code !== 'SECTION_PERIOD_OCCUPIED');
  const parts = [];

  if (occupied.length) {
    const days = [...new Set(occupied.map((d) => dayLabel(d.day)).filter(Boolean))];
    const subjects = [
      ...new Set(
        occupied
          .map((d) => {
            const m = String(d.message || '').match(/already has (.+) in this period/);
            return m?.[1];
          })
          .filter(Boolean)
      ),
    ];
    const subjectBit =
      subjects.length === 1 ? ` (${subjects[0]})` : subjects.length > 1 ? ` (${subjects.join(', ')})` : '';
    parts.push(
      `${placeLabel} already has a lesson in this period${subjectBit} on ${days.join(', ')}`
    );
  }

  other.forEach((d) => {
    if (d.message) parts.push(d.message);
  });

  return parts.join('. ') || 'Schedule conflicts prevent saving these days';
}

function normalizeEntries(body) {
  if (Array.isArray(body.entries) && body.entries.length) {
    return body.entries.map((e) => ({
      subject: e.subject,
      teacher: e.teacher,
    }));
  }
  if (body.subject && body.teacher) {
    return [{ subject: body.subject, teacher: body.teacher }];
  }
  throw new ApiError(400, 'Provide subject/teacher or entries[]');
}

function assertUniqueEntries(entries) {
  const subjects = entries.map((e) => String(e.subject));
  const teachers = entries.map((e) => String(e.teacher));
  if (new Set(subjects).size !== subjects.length) {
    throw new ApiError(400, 'Duplicate subjects in the same period slot');
  }
  if (new Set(teachers).size !== teachers.length) {
    throw new ApiError(400, 'Each parallel subject needs a different teacher');
  }
}

function resolveTargetDays(body) {
  if (body.applyToFullWeek) return [...FULL_WEEK_DAYS];
  if (Array.isArray(body.days) && body.days.length) {
    const unique = [...new Set(body.days.map(String))];
    const invalid = unique.filter((d) => !WEEKDAYS.includes(d));
    if (invalid.length) throw new ApiError(400, `Invalid day(s): ${invalid.join(', ')}`);
    return WEEKDAYS.filter((d) => unique.includes(d));
  }
  if (!body.day) throw new ApiError(400, 'day is required');
  return [String(body.day)];
}

async function listSlots(timetableVersionId) {
  return ScheduleSlot.find({ timetableVersion: timetableVersionId, cancelled: { $ne: true } })
    .populate(slotPopulate)
    .sort({ day: 1 });
}

/**
 * Create or update a slot. Pass applyToFullWeek or days[] to write the same
 * subject/teacher/period across multiple weekdays (all-or-nothing with conflicts).
 */
async function upsertSlot(timetableVersionId, body, { excludeSlotId, userId } = {}) {
  const version = await TimetableVersion.findById(timetableVersionId)
    .populate('class', 'className')
    .populate('section', 'sectionName');
  if (!version) throw new ApiError(404, 'Timetable version not found');
  if (version.status !== 'draft' && version.status !== 'published') {
    throw new ApiError(400, 'Can only edit slots on draft or published timetables');
  }
  await assertSessionWritable(version.session);

  const entries = normalizeEntries(body);
  assertUniqueEntries(entries);
  const primary = entries[0];
  const parallelEntries = entries.slice(1);
  const targetDays = resolveTargetDays(body);
  const multiDay = targetDays.length > 1;

  const className =
    (version.class && (version.class.className || version.class.name)) || 'Class';
  const sectionName =
    (version.section && (version.section.sectionName || version.section.name)) || 'Section';
  const placeLabel = `${className} · ${sectionName}`;
  const classId = version.class?._id || version.class;
  const sectionId = version.section?._id || version.section;

  const basePayload = {
    timetableVersion: timetableVersionId,
    session: version.session,
    class: classId,
    section: sectionId,
    periodId: body.periodId,
    subject: primary.subject,
    teacher: primary.teacher,
    parallelEntries,
    room: body.room || null,
    source: body.source || 'manual',
    locked: body.locked ?? false,
    isSubstitute: body.isSubstitute ?? false,
    substituteForTeacher: body.substituteForTeacher || null,
  };

  const occupying = await ScheduleSlot.find({
    timetableVersion: timetableVersionId,
    periodId: body.periodId,
    day: { $in: targetDays },
    cancelled: { $ne: true },
  })
    .select('_id day subject teacher')
    .populate({
      path: 'subject',
      select: 'subjectName',
      transform: (doc) => {
        if (!doc) return doc;
        const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
        return { ...o, name: o.subjectName || o.name };
      },
    });
  const occupyingByDay = new Map(occupying.map((s) => [s.day, s]));

  const conflictDetails = [];

  for (const day of targetDays) {
    const existing = occupyingByDay.get(day);
    let excludeId = null;

    if (multiDay) {
      if (day === body.day) {
        // Primary cell: update existing / excludeSlotId (same as single-day upsert)
        excludeId = excludeSlotId || existing?._id || null;
      } else if (existing) {
        const existingSubject =
          existing.subject?.name || existing.subject?.subjectName || 'another subject';
        conflictDetails.push({
          code: 'SECTION_PERIOD_OCCUPIED',
          day,
          className,
          sectionName,
          message: `${dayLabel(day)}: ${placeLabel} already has ${existingSubject} in this period`,
          slotId: existing._id,
        });
        continue;
      }
    } else {
      excludeId = excludeSlotId || existing?._id || null;
    }

    for (const entry of entries) {
      // eslint-disable-next-line no-await-in-loop
      const validation = await validateSlot({
        sessionId: version.session,
        timetableVersionId,
        day,
        periodId: body.periodId,
        subjectId: entry.subject,
        teacherId: entry.teacher,
        roomId: basePayload.room,
        sectionId,
        excludeSlotId: excludeId,
      });
      if (!validation.valid) {
        validation.errors.forEach((e) => {
          let msg = e.message || 'schedule conflict';
          if (e.code === 'TEACHER_CONFLICT') {
            msg = `teacher is already assigned in another class at this time`;
          }
          conflictDetails.push({
            ...e,
            day,
            className,
            sectionName,
            message: `${dayLabel(day)}: ${placeLabel} — ${msg}`,
          });
        });
      }
    }
  }

  if (conflictDetails.length) {
    const summary = formatConflictSummary(conflictDetails, placeLabel);
    throw new ApiError(409, summary, conflictDetails);
  }

  const writeDay = async (day) => {
    const payload = { ...basePayload, day };
    const existing = occupyingByDay.get(day);

    if (day === body.day && excludeSlotId) {
      const slot = await ScheduleSlot.findByIdAndUpdate(excludeSlotId, payload, {
        new: true,
        runValidators: true,
      }).populate(slotPopulate);
      if (!slot) throw new ApiError(404, 'Schedule slot not found');
      return slot;
    }
    if (existing && (!multiDay || day === body.day)) {
      return ScheduleSlot.findByIdAndUpdate(existing._id, payload, {
        new: true,
        runValidators: true,
      }).populate(slotPopulate);
    }
    const created = await ScheduleSlot.create({ ...payload, createdBy: userId || undefined });
    return ScheduleSlot.findById(created._id).populate(slotPopulate).populate('createdBy', 'name email');
  };

  if (!multiDay) {
    return writeDay(targetDays[0]);
  }

  const slots = [];
  for (const day of targetDays) {
    // eslint-disable-next-line no-await-in-loop
    slots.push(await writeDay(day));
  }
  return { days: targetDays, created: slots.length, slots };
}

function slotEntriesPlain(slotDoc) {
  const primary = {
    subject: slotDoc.subject,
    teacher: slotDoc.teacher,
  };
  const parallel = Array.isArray(slotDoc.parallelEntries) ? slotDoc.parallelEntries : [];
  return [primary, ...parallel.map((e) => ({ subject: e.subject, teacher: e.teacher }))];
}

async function moveSlot(slotId, body) {
  const slot = await ScheduleSlot.findById(slotId);
  if (!slot) throw new ApiError(404, 'Schedule slot not found');
  if (slot.locked) throw new ApiError(400, 'Slot is locked and cannot be moved');

  const toDay = body.day ?? slot.day;
  const toPeriodId = body.periodId ?? slot.periodId;
  const fromDay = slot.day;
  const fromPeriodId = slot.periodId;

  if (toDay === fromDay && String(toPeriodId) === String(fromPeriodId)) {
    return ScheduleSlot.findById(slotId).populate(slotPopulate);
  }

  const targetExisting = await ScheduleSlot.findOne({
    timetableVersion: slot.timetableVersion,
    day: toDay,
    periodId: toPeriodId,
    cancelled: { $ne: true },
  });

  if (targetExisting && String(targetExisting._id) !== String(slotId)) {
    if (targetExisting.locked) {
      throw new ApiError(400, 'Target slot is locked and cannot be swapped');
    }

    const versionId = slot.timetableVersion;
    const aEntries = slotEntriesPlain(slot);
    const bEntries = slotEntriesPlain(targetExisting);

    await ScheduleSlot.deleteOne({ _id: slotId });
    await ScheduleSlot.deleteOne({ _id: targetExisting._id });

    await upsertSlot(versionId, {
      day: toDay,
      periodId: toPeriodId,
      entries: aEntries,
      room: slot.room,
      source: slot.source,
      locked: slot.locked,
    });

    const swapped = await upsertSlot(versionId, {
      day: fromDay,
      periodId: fromPeriodId,
      entries: bEntries,
      room: targetExisting.room,
      source: targetExisting.source,
      locked: targetExisting.locked,
    });

    return swapped;
  }

  let entries;
  if (Array.isArray(body.entries) && body.entries.length) {
    entries = body.entries;
  } else if (body.subject || body.teacher) {
    entries = [
      {
        subject: body.subject ?? slot.subject,
        teacher: body.teacher ?? slot.teacher,
      },
      ...(slot.parallelEntries || []),
    ];
  } else {
    entries = slotEntriesPlain(slot);
  }

  return upsertSlot(
    slot.timetableVersion,
    {
      day: toDay,
      periodId: toPeriodId,
      entries,
      room: body.room !== undefined ? body.room : slot.room,
      source: slot.source,
      locked: slot.locked,
    },
    { excludeSlotId: slotId }
  );
}

async function deleteSlot(slotId) {
  const slot = await ScheduleSlot.findById(slotId);
  if (!slot) throw new ApiError(404, 'Schedule slot not found');

  const version = await TimetableVersion.findById(slot.timetableVersion);
  if (version?.status !== 'draft' && version?.status !== 'published') {
    throw new ApiError(400, 'Can only delete slots on draft or published timetables');
  }

  await ScheduleSlot.findByIdAndDelete(slotId);
  return { deleted: true };
}

function teacherInSlotQuery(teacherId) {
  return {
    $or: [{ teacher: teacherId }, { 'parallelEntries.teacher': teacherId }],
  };
}

async function getTeacherSchedule(sessionId, teacherId, { status = 'published' } = {}) {
  const versionQuery = { session: sessionId, status };
  const versions = await TimetableVersion.find(versionQuery).select('_id section class');
  const versionIds = versions.map((v) => v._id);

  const slots = await ScheduleSlot.find({
    session: sessionId,
    ...teacherInSlotQuery(teacherId),
    timetableVersion: { $in: versionIds },
    cancelled: { $ne: true },
  })
    .populate(slotPopulate)
    .populate({
      path: 'section',
      select: 'sectionName',
      transform: (doc) => {
        if (!doc) return doc;
        const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
        return { ...o, name: o.sectionName || o.name };
      },
    })
    .populate({
      path: 'class',
      select: 'className',
      transform: (doc) => {
        if (!doc) return doc;
        const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
        return { ...o, name: o.className || o.name };
      },
    })
    .sort({ day: 1 });

  return { slots, versions };
}

async function getRoomSchedule(sessionId, roomId, { status = 'published' } = {}) {
  const versions = await TimetableVersion.find({ session: sessionId, status }).select('_id');
  const versionIds = versions.map((v) => v._id);

  const slots = await ScheduleSlot.find({
    session: sessionId,
    room: roomId,
    timetableVersion: { $in: versionIds },
    cancelled: { $ne: true },
  })
    .populate(slotPopulate)
    .populate({
      path: 'section',
      select: 'sectionName',
      transform: (doc) => {
        if (!doc) return doc;
        const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
        return { ...o, name: o.sectionName || o.name };
      },
    })
    .populate({
      path: 'class',
      select: 'className',
      transform: (doc) => {
        if (!doc) return doc;
        const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
        return { ...o, name: o.className || o.name };
      },
    })
    .sort({ day: 1 });

  return slots;
}

async function createSubstitution(body, userId) {
  const version = await TimetableVersion.findOne({
    session: body.sessionId,
    section: body.sectionId,
    status: 'published',
  });
  if (!version) throw new ApiError(404, 'No published timetable for this section');

  const original = await ScheduleSlot.findOne({
    timetableVersion: version._id,
    day: body.day,
    periodId: body.periodId,
    ...teacherInSlotQuery(body.originalTeacherId),
    cancelled: { $ne: true },
  });
  if (!original) throw new ApiError(404, 'Original slot not found');

  const entries = slotEntriesPlain(original).map((e) => {
    if (String(e.teacher) === String(body.originalTeacherId)) {
      return { subject: e.subject, teacher: body.substituteTeacherId };
    }
    return e;
  });

  const validation = await validateSlot({
    sessionId: version.session,
    timetableVersionId: version._id,
    day: body.day,
    periodId: body.periodId,
    subjectId: entries.find((e) => String(e.teacher) === String(body.substituteTeacherId))?.subject
      || original.subject,
    teacherId: body.substituteTeacherId,
    roomId: original.room,
    sectionId: version.section,
  });
  if (!validation.valid) {
    throw new ApiError(400, 'Substitution validation failed', validation.errors);
  }

  original.cancelled = true;
  await original.save();

  const primary = entries[0];
  const slot = await ScheduleSlot.create({
    timetableVersion: version._id,
    session: version.session,
    class: version.class,
    section: version.section,
    day: body.day,
    periodId: body.periodId,
    subject: primary.subject,
    teacher: primary.teacher,
    parallelEntries: entries.slice(1),
    room: original.room,
    isSubstitute: true,
    substituteForTeacher: body.originalTeacherId,
    source: 'manual',
    createdBy: userId,
  });
  return ScheduleSlot.findById(slot._id).populate(slotPopulate).populate('createdBy', 'name email');
}

module.exports = {
  listSlots,
  upsertSlot,
  moveSlot,
  deleteSlot,
  getTeacherSchedule,
  getRoomSchedule,
  createSubstitution,
  slotPopulate,
  FULL_WEEK_DAYS,
  resolveTargetDays,
};
