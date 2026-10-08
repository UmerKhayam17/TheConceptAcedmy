const mongoose = require('mongoose');
const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const TimetableVersion = require('../../models/timetable/TimetableVersion');
const PeriodTemplate = require('../../models/timetable/PeriodTemplate');
const Session = require('../../models/Session');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const ApiError = require('../../utils/ApiError');
const { WEEKDAYS } = require('../../models/timetable/constants');
const { validateSlot } = require('./timetableConflictService');
const { assertSessionWritable } = require('../session/sessionGuard');
const { createVersion, publishVersion } = require('./timetableVersionService');
const { moveSlot, upsertSlot } = require('./scheduleSlotService');
const { sortClassesByLevel, sortSectionsByName } = require('../../utils/classLevelSort');

function slotEntriesPlain(slotDoc) {
  const primary = { subject: slotDoc.subject, teacher: slotDoc.teacher };
  const parallel = slotDoc.parallelEntries || [];
  return [primary, ...parallel.map((e) => ({ subject: e.subject, teacher: e.teacher }))];
}

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
  {
    path: 'section', select: 'sectionName', transform: (doc) => {
      if (!doc) return doc;
      const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
      return { ...o, name: o.sectionName || o.name };
    }
  },
];

function normalizeEntries(body) {
  if (Array.isArray(body.entries) && body.entries.length) {
    return body.entries.map((e) => ({ subject: e.subject, teacher: e.teacher }));
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

async function resolvePeriodTemplate(sessionId) {
  const settingsTpl = await PeriodTemplate.findOne({ session: sessionId, isDefault: true, isActive: true });
  if (settingsTpl) return settingsTpl;
  return PeriodTemplate.findOne({ session: sessionId, isActive: true }).sort({ createdAt: 1 });
}

/** Prefer draft; else edit published in place; else create a new draft. */
async function ensureEditableVersion({ sessionId, classId, sectionId, periodTemplateId, userId }) {
  const existingDraft = await TimetableVersion.findOne({
    session: sessionId,
    section: sectionId,
    status: 'draft',
  });
  if (existingDraft) return existingDraft;

  const published = await TimetableVersion.findOne({
    session: sessionId,
    section: sectionId,
    status: 'published',
  });
  if (published) return published;

  if (!periodTemplateId) {
    throw new ApiError(400, 'Create an academy time configuration before placing lessons');
  }
  return createVersion(
    {
      session: sessionId,
      class: classId,
      section: sectionId,
      periodTemplate: periodTemplateId,
    },
    userId
  );
}

/**
 * Class board: sections × periods for one weekday.
 * Omit classId to include every class in the session.
 */
async function getClassBoard({ sessionId, classId, day }) {
  if (!sessionId) throw new ApiError(400, 'sessionId is required');
  if (!day || !WEEKDAYS.includes(day)) throw new ApiError(400, 'Valid day is required');

  const session = await Session.findById(sessionId).select('name workingDays');
  if (!session) throw new ApiError(404, 'Session not found');
  const template = await resolvePeriodTemplate(sessionId);

  const classQuery = { sessionId, status: { $ne: 'inactive' } };
  if (classId) classQuery._id = classId;
  const classesRaw = await AcademyClass.find(classQuery).select('className');
  const classes = sortClassesByLevel(classesRaw);
  if (classId && !classes.length) throw new ApiError(404, 'Class not found');

  const sectionRows = [];
  const allSlots = [];

  for (const klass of classes) {
    // eslint-disable-next-line no-await-in-loop
    const sectionsRaw = await AcademySection.find({
      classId: klass._id,
      status: { $ne: 'inactive' },
    }).select('sectionName classId');
    const sections = sortSectionsByName(sectionsRaw);

    for (const section of sections) {
      // eslint-disable-next-line no-await-in-loop
      const versions = await TimetableVersion.find({
        session: sessionId,
        section: section._id,
        status: { $in: ['draft', 'published'] },
      }).sort({ status: 1, version: -1 });

      const draft = versions.find((v) => v.status === 'draft');
      const published = versions.find((v) => v.status === 'published');
      const active = draft || published || null;

      let slots = [];
      if (active) {
        // eslint-disable-next-line no-await-in-loop
        slots = await ScheduleSlot.find({
          timetableVersion: active._id,
          day,
          cancelled: { $ne: true },
        }).populate(slotPopulate);
      }

      const className = klass.className || klass.name;
      const sectionName = section.sectionName || section.name;
      sectionRows.push({
        class: { _id: klass._id, name: className },
        section: {
          _id: section._id,
          name: sectionName,
          // Raw "9-A1"; frontend formats to "9th-A1" / "1st Year-A1"
          label: `${className}-${sectionName}`,
        },
        version: active
          ? { _id: active._id, status: active.status, version: active.version }
          : null,
        slots,
      });
      allSlots.push(...slots);
    }
  }

  const single = classId && classes[0] ? classes[0] : null;
  return {
    session: { _id: session._id, name: session.name, workingDays: session.workingDays },
    class: single ? { _id: single._id, name: single.className || single.name } : null,
    day,
    periods: template?.slots || [],
    periodTemplateId: template?._id || null,
    sections: sectionRows,
    slots: allSlots,
  };
}

/**
 * Place a lesson on one or more sections at the same day(s) + period.
 * Multiple sections → shared combinedGroupId (teacher/room conflict waived within group).
 */
async function upsertSharedLesson(body, userId) {
  const {
    sessionId,
    classId,
    periodId,
    sectionIds,
    room,
    combinedGroupId: existingGroupId,
  } = body;

  if (!sessionId || !classId || !periodId) {
    throw new ApiError(400, 'sessionId, classId, and periodId are required');
  }
  if (!Array.isArray(sectionIds) || sectionIds.length === 0) {
    throw new ApiError(400, 'Select at least one section');
  }

  await assertSessionWritable(sessionId);

  const entries = normalizeEntries(body);
  assertUniqueEntries(entries);
  const primary = entries[0];
  const parallelEntries = entries.slice(1);
  const targetDays = resolveTargetDays(body);
  const uniqueSectionIds = [...new Set(sectionIds.map(String))];

  const sections = await AcademySection.find({
    _id: { $in: uniqueSectionIds },
    classId,
  }).select('_id sectionName');
  if (sections.length !== uniqueSectionIds.length) {
    throw new ApiError(400, 'One or more sections do not belong to this class');
  }

  const klass = await AcademyClass.findById(classId).select('sessionId');
  if (!klass) throw new ApiError(404, 'Class not found');
  if (klass.sessionId && String(klass.sessionId) !== String(sessionId)) {
    throw new ApiError(400, 'Class does not belong to this session');
  }

  const template = await resolvePeriodTemplate(sessionId);
  if (!template) throw new ApiError(400, 'Create an academy time configuration first');

  const isShared = uniqueSectionIds.length > 1;
  const combinedGroupId = isShared
    ? existingGroupId || new mongoose.Types.ObjectId()
    : null;

  // Ensure draft versions and collect overwrite targets
  const versionBySection = new Map();
  for (const section of sections) {
    // eslint-disable-next-line no-await-in-loop
    const version = await ensureEditableVersion({
      sessionId,
      classId,
      sectionId: section._id,
      periodTemplateId: template._id,
      userId,
    });
    versionBySection.set(String(section._id), version);
  }

  const versionIds = [...versionBySection.values()].map((v) => v._id);
  const existing = await ScheduleSlot.find({
    timetableVersion: { $in: versionIds },
    periodId,
    day: { $in: targetDays },
    cancelled: { $ne: true },
  }).select('_id day section timetableVersion combinedGroupId');

  const excludeSlotIds = existing.map((s) => s._id);
  // If editing an existing group, exclude all current members (including sections being dropped)
  const groupToExclude = existingGroupId || combinedGroupId;
  if (groupToExclude) {
    const siblings = await ScheduleSlot.find({
      combinedGroupId: groupToExclude,
      cancelled: { $ne: true },
    }).select('_id');
    for (const s of siblings) excludeSlotIds.push(s._id);
  }

  const conflictDetails = [];
  for (const section of sections) {
    const version = versionBySection.get(String(section._id));
    for (const day of targetDays) {
      for (const entry of entries) {
        // eslint-disable-next-line no-await-in-loop
        const validation = await validateSlot({
          sessionId,
          timetableVersionId: version._id,
          day,
          periodId,
          subjectId: entry.subject,
          teacherId: entry.teacher,
          roomId: room || null,
          sectionId: section._id,
          excludeSlotIds,
          combinedGroupId,
        });
        if (!validation.valid) {
          validation.errors.forEach((e) => {
            conflictDetails.push({
              ...e,
              day,
              sectionName: section.sectionName,
              message: `${day}: ${section.sectionName} — ${e.message}`,
            });
          });
        }
      }
    }
  }

  if (conflictDetails.length) {
    const summary = conflictDetails.map((d) => d.message).filter(Boolean).join('. ');
    throw new ApiError(409, summary || 'Schedule conflicts prevent saving', conflictDetails);
  }

  // When shrinking/editing a combined group, remove old members not in the new section set
  if (existingGroupId) {
    await ScheduleSlot.deleteMany({
      combinedGroupId: existingGroupId,
      periodId,
      day: { $in: targetDays },
      section: { $nin: sections.map((s) => s._id) },
    });
  }

  const written = [];
  for (const section of sections) {
    const version = versionBySection.get(String(section._id));
    for (const day of targetDays) {
      const payload = {
        timetableVersion: version._id,
        session: sessionId,
        class: classId,
        section: section._id,
        day,
        periodId,
        subject: primary.subject,
        teacher: primary.teacher,
        parallelEntries,
        room: room || null,
        combinedGroupId,
        source: 'manual',
        locked: false,
      };

      const prior = existing.find(
        (s) =>
          String(s.timetableVersion) === String(version._id) &&
          s.day === day
      );

      let slot;
      if (prior) {
        // eslint-disable-next-line no-await-in-loop
        slot = await ScheduleSlot.findByIdAndUpdate(prior._id, payload, {
          new: true,
          runValidators: true,
        }).populate(slotPopulate);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const created = await ScheduleSlot.create({ ...payload, createdBy: userId });
        // eslint-disable-next-line no-await-in-loop
        slot = await ScheduleSlot.findById(created._id).populate(slotPopulate);
      }
      written.push(slot);
    }
  }

  return {
    combinedGroupId: isShared || existingGroupId ? String(combinedGroupId) : null,
    days: targetDays,
    sectionCount: sections.length,
    slots: written,
  };
}

async function deleteCombinedGroup(combinedGroupId) {
  if (!combinedGroupId) throw new ApiError(400, 'combinedGroupId is required');
  const slots = await ScheduleSlot.find({ combinedGroupId }).select('session');
  if (!slots.length) throw new ApiError(404, 'Combined lesson not found');
  await assertSessionWritable(slots[0].session);
  const result = await ScheduleSlot.deleteMany({ combinedGroupId });
  return { deleted: result.deletedCount || 0 };
}

async function publishClassDrafts({ sessionId, classId }, userId) {
  await assertSessionWritable(sessionId);
  const q = { session: sessionId, status: 'draft' };
  if (classId) q.class = classId;
  const drafts = await TimetableVersion.find(q);
  const published = [];
  const failed = [];
  for (const draft of drafts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const v = await publishVersion(draft._id, userId);
      published.push(v);
    } catch (err) {
      failed.push({
        versionId: draft._id,
        sectionId: draft.section,
        message: err.message || 'Publish failed',
        details: err.details,
      });
    }
  }
  return { published: published.length, failed };
}

/**
 * Drag-and-drop move on the class board.
 * - Shared lesson: moves the whole combined group to a new period (same day).
 * - Same section: move/swap within that section's timetable.
 * - Other section: relocate (or swap) into the target section at that period.
 */
async function moveClassBoardLesson(body, userId) {
  const { slotId, toSectionId, toPeriodId, day } = body;
  if (!slotId || !toSectionId || !toPeriodId || !day) {
    throw new ApiError(400, 'slotId, toSectionId, toPeriodId, and day are required');
  }

  const slot = await ScheduleSlot.findById(slotId);
  if (!slot) throw new ApiError(404, 'Schedule slot not found');
  if (slot.locked) throw new ApiError(400, 'Slot is locked and cannot be moved');
  await assertSessionWritable(slot.session);

  const fromSectionId = String(slot.section);
  const fromPeriodId = String(slot.periodId);
  const toSection = String(toSectionId);
  const toPeriod = String(toPeriodId);

  if (day !== slot.day) {
    throw new ApiError(400, 'Class board moves stay on the selected day');
  }

  // Shared / combined lesson: move entire group to the new period column
  if (slot.combinedGroupId) {
    if (fromPeriodId === toPeriod) {
      return { moved: 0, shared: true, slots: [] };
    }

    const groupSlots = await ScheduleSlot.find({
      combinedGroupId: slot.combinedGroupId,
      day,
      cancelled: { $ne: true },
    });

    const results = [];
    for (const member of groupSlots) {
      // eslint-disable-next-line no-await-in-loop
      const moved = await moveSlot(member._id, {
        day,
        periodId: toPeriod,
      });
      results.push(moved);
    }
    return { moved: results.length, shared: true, slots: results };
  }

  // Same section: reuse section-grid move/swap
  if (fromSectionId === toSection) {
    if (fromPeriodId === toPeriod) {
      return {
        moved: 0,
        shared: false,
        slots: [await ScheduleSlot.findById(slotId).populate(slotPopulate)],
      };
    }
    const moved = await moveSlot(slotId, { day, periodId: toPeriod });
    return { moved: 1, shared: false, slots: [moved] };
  }

  // Cross-section: ensure target editable version, then swap or relocate
  const template = await resolvePeriodTemplate(slot.session);
  const targetVersion = await ensureEditableVersion({
    sessionId: slot.session,
    classId: slot.class,
    sectionId: toSection,
    periodTemplateId: template?._id,
    userId,
  });

  const targetExisting = await ScheduleSlot.findOne({
    timetableVersion: targetVersion._id,
    day,
    periodId: toPeriod,
    cancelled: { $ne: true },
  });

  const sourceEntries = slotEntriesPlain(slot);
  const sourcePayload = {
    day,
    periodId: toPeriod,
    entries: sourceEntries,
    room: slot.room,
    source: slot.source || 'manual',
    locked: slot.locked || false,
    combinedGroupId: null,
  };

  if (targetExisting) {
    if (targetExisting.locked) {
      throw new ApiError(400, 'Target slot is locked and cannot be swapped');
    }
    if (targetExisting.combinedGroupId) {
      throw new ApiError(400, 'Cannot drop onto a shared lesson. Move the shared lesson by its period column instead.');
    }

    const targetEntries = slotEntriesPlain(targetExisting);
    await ScheduleSlot.deleteOne({ _id: slot._id });
    await ScheduleSlot.deleteOne({ _id: targetExisting._id });

    const placed = await upsertSlot(targetVersion._id, sourcePayload, { userId });
    const swappedBack = await upsertSlot(
      slot.timetableVersion,
      {
        day,
        periodId: fromPeriodId,
        entries: targetEntries,
        room: targetExisting.room,
        source: targetExisting.source || 'manual',
        locked: targetExisting.locked || false,
        combinedGroupId: null,
      },
      { userId }
    );
    return { moved: 2, shared: false, swapped: true, slots: [placed, swappedBack] };
  }

  await ScheduleSlot.deleteOne({ _id: slot._id });
  const placed = await upsertSlot(targetVersion._id, sourcePayload, { userId });
  return { moved: 1, shared: false, slots: [placed] };
}

module.exports = {
  getClassBoard,
  upsertSharedLesson,
  deleteCombinedGroup,
  publishClassDrafts,
  moveClassBoardLesson,
};
