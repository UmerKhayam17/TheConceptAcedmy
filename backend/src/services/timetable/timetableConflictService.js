const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const TimetableVersion = require('../../models/timetable/TimetableVersion');
const TeacherProfile = require('../../models/timetable/TeacherProfile');
const TimetableSettings = require('../../models/timetable/TimetableSettings');
const Room = require('../../models/timetable/Room');
const User = require('../../models/User');

function findPeriodInTemplate(template, periodId) {
  if (!template?.slots?.length || periodId == null) return null;
  if (typeof template.slots.id === 'function') {
    const byId = template.slots.id(periodId);
    if (byId) return byId;
  }
  return template.slots.find((s) => String(s._id) === String(periodId)) || null;
}

/** Any active teacher/admin may be placed on the grid (no per-section assignment required). */
async function isValidTimetableTeacher(teacherId) {
  if (!teacherId) return false;
  const user = await User.findById(teacherId).populate('role', 'name').select('isActive role');
  if (!user?.isActive) return false;
  const roleName = user.role?.name;
  return roleName === 'teacher' || roleName === 'admin';
}

/**
 * Validate a single slot or full timetable version.
 * @returns {{ valid: boolean, errors: object[], warnings: object[] }}
 */
function buildExcludeIdQuery(excludeSlotId, excludeSlotIds) {
  const ids = [];
  if (excludeSlotId) ids.push(excludeSlotId);
  if (Array.isArray(excludeSlotIds)) {
    for (const id of excludeSlotIds) {
      if (id) ids.push(id);
    }
  }
  if (!ids.length) return {};
  const unique = [...new Set(ids.map((id) => String(id)))];
  return unique.length === 1 ? { _id: { $ne: unique[0] } } : { _id: { $nin: unique } };
}

function isSameCombinedGroup(slot, combinedGroupId) {
  if (!combinedGroupId || !slot?.combinedGroupId) return false;
  return String(slot.combinedGroupId) === String(combinedGroupId);
}

async function validateSlot({
  sessionId,
  timetableVersionId,
  day,
  periodId,
  subjectId,
  teacherId,
  roomId,
  sectionId,
  excludeSlotId,
  excludeSlotIds,
  combinedGroupId,
  strict = false,
}) {
  const errors = [];
  const warnings = [];

  const version = await TimetableVersion.findById(timetableVersionId).populate('periodTemplate');
  if (!version) {
    errors.push({ code: 'VERSION_NOT_FOUND', message: 'Timetable version not found' });
    return { valid: false, errors, warnings };
  }

  const template = version.periodTemplate;
  const slotDef = findPeriodInTemplate(template, periodId);
  if (!slotDef) {
    errors.push({ code: 'INVALID_PERIOD', message: 'Period does not exist in template' });
    return { valid: false, errors, warnings };
  }
  if (slotDef.type === 'break') {
    errors.push({ code: 'INVALID_PERIOD', message: 'Cannot assign subjects to a break period' });
    return { valid: false, errors, warnings };
  }

  const settings = await TimetableSettings.findOne({ session: sessionId });
  const checkCrossVersion = settings?.conflictCheckOnDraft !== false;

  const baseQuery = {
    cancelled: { $ne: true },
    ...buildExcludeIdQuery(excludeSlotId, excludeSlotIds),
  };

  // R1: Teacher conflict (published + optionally draft across session)
  const teacherConflictQuery = {
    ...baseQuery,
    session: sessionId,
    day,
    periodId,
    $or: [{ teacher: teacherId }, { 'parallelEntries.teacher': teacherId }],
  };
  let crossVersionIds = null;
  if (checkCrossVersion) {
    const otherVersions = await TimetableVersion.find({
      session: sessionId,
      status: { $in: ['draft', 'published'] },
      _id: { $ne: timetableVersionId },
    }).select('_id');
    crossVersionIds = [timetableVersionId, ...otherVersions.map((v) => v._id)];
    teacherConflictQuery.timetableVersion = { $in: crossVersionIds };
  } else {
    teacherConflictQuery.timetableVersion = timetableVersionId;
  }

  const teacherConflicts = await ScheduleSlot.find(teacherConflictQuery).select('_id combinedGroupId');
  const blockingTeacher = teacherConflicts.find((s) => !isSameCombinedGroup(s, combinedGroupId));
  if (blockingTeacher) {
    errors.push({
      code: 'TEACHER_CONFLICT',
      message: 'Teacher is already assigned at this day and period',
      slotId: blockingTeacher._id,
    });
  }

  // R2: Room conflict + exclusive class assignment
  if (roomId) {
    const Room = require('../../models/timetable/Room');
    const roomDoc = await Room.findById(roomId).select('assignedClass name code isActive');
    if (!roomDoc || roomDoc.isActive === false) {
      errors.push({ code: 'INVALID_ROOM', message: 'Room not found or inactive' });
    } else if (roomDoc.assignedClass) {
      const versionClassId = version.class?._id || version.class;
      if (String(roomDoc.assignedClass) !== String(versionClassId)) {
        errors.push({
          code: 'ROOM_CLASS_MISMATCH',
          message: `Room ${roomDoc.code || roomDoc.name} is reserved for another class`,
        });
      }
    }

    const roomConflictQuery = {
      ...baseQuery,
      session: sessionId,
      day,
      periodId,
      room: roomId,
    };
    if (checkCrossVersion && crossVersionIds) {
      roomConflictQuery.timetableVersion = { $in: crossVersionIds };
    } else {
      roomConflictQuery.timetableVersion = timetableVersionId;
    }
    const roomConflicts = await ScheduleSlot.find(roomConflictQuery).select('_id combinedGroupId');
    const blockingRoom = roomConflicts.find((s) => !isSameCombinedGroup(s, combinedGroupId));
    if (blockingRoom) {
      errors.push({
        code: 'ROOM_CONFLICT',
        message: 'Room is already assigned at this day and period',
        slotId: blockingRoom._id,
      });
    }
  }

  // R7: Teacher availability
  const profile = await TeacherProfile.findOne({ user: teacherId, session: sessionId, isActive: true });
  if (profile?.availability?.length) {
    const dayAvail = profile.availability.find((a) => a.day === day);
    if (dayAvail && dayAvail.periodIds?.length && !dayAvail.periodIds.some((id) => String(id) === String(periodId))) {
      const entry = {
        code: 'TEACHER_UNAVAILABLE',
        message: 'Teacher is not available at this period',
      };
      if (strict) errors.push(entry);
      else warnings.push(entry);
    }
  }

  // R8: Teacher must be an active staff member (not tied to a single section/class)
  const validTeacher = await isValidTimetableTeacher(teacherId);
  if (!validTeacher) {
    errors.push({
      code: 'INVALID_TEACHER',
      message: 'Selected user is not an active teacher',
    });
  } else if (profile?.subjects?.length && subjectId) {
    const teachesSubject = profile.subjects.some((s) => String(s._id || s) === String(subjectId));
    if (!teachesSubject) {
      warnings.push({
        code: 'SUBJECT_NOT_ON_PROFILE',
        message: 'This subject is not listed on the teacher profile (allowed for multi-section teaching)',
      });
    }
  }

  // R4: Daily teacher limit
  if (profile?.maxLecturesPerDay) {
    const dayCount = await ScheduleSlot.countDocuments({
      timetableVersion: timetableVersionId,
      day,
      cancelled: { $ne: true },
      $or: [{ teacher: teacherId }, { 'parallelEntries.teacher': teacherId }],
      ...(excludeSlotId ? { _id: { $ne: excludeSlotId } } : {}),
    });
    if (dayCount >= profile.maxLecturesPerDay) {
      errors.push({
        code: 'TEACHER_DAILY_LIMIT',
        message: `Teacher exceeds max ${profile.maxLecturesPerDay} lectures per day`,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function slotSubjectIds(slot) {
  const ids = [String(slot.subject)];
  for (const e of slot.parallelEntries || []) {
    if (e?.subject) ids.push(String(e.subject));
  }
  return ids;
}

async function validateVersion(timetableVersionId, { forPublish = false } = {}) {
  const errors = [];
  const warnings = [];

  const version = await TimetableVersion.findById(timetableVersionId).populate('periodTemplate');
  if (!version) {
    return { valid: false, errors: [{ code: 'VERSION_NOT_FOUND', message: 'Timetable version not found' }], warnings };
  }

  const slots = await ScheduleSlot.find({
    timetableVersion: timetableVersionId,
    cancelled: { $ne: true },
  });

  const settings = await TimetableSettings.findOne({ session: version.session });

  // Per-slot validation (every concurrent subject/teacher pair)
  for (const slot of slots) {
    const entries = [
      { subject: slot.subject, teacher: slot.teacher },
      ...(slot.parallelEntries || []),
    ];
    for (const entry of entries) {
      const result = await validateSlot({
        sessionId: version.session,
        timetableVersionId,
        day: slot.day,
        periodId: slot.periodId,
        subjectId: entry.subject,
        teacherId: entry.teacher,
        roomId: slot.room,
        sectionId: version.section,
        excludeSlotId: slot._id,
        combinedGroupId: slot.combinedGroupId || null,
        strict: forPublish,
      });
      result.errors.forEach((e) =>
        errors.push({ ...e, day: slot.day, periodId: slot.periodId, slotId: slot._id })
      );
    }
  }

  // Consecutive subject limit per day (session default)
  const template = version.periodTemplate;
  const lectureSlots = (template?.slots || [])
    .filter((s) => s.type === 'lecture')
    .sort((a, b) => a.order - b.order);
  const maxConsecutive = settings?.defaultMaxConsecutive ?? 2;
  const subjectIds = [...new Set(slots.flatMap((s) => slotSubjectIds(s)))];

  for (const subjectId of subjectIds) {
    for (const day of [...new Set(slots.map((s) => s.day))]) {
      let run = 0;
      for (const period of lectureSlots) {
        const hasSubject = slots.some(
          (s) =>
            s.day === day &&
            String(s.periodId) === String(period._id) &&
            slotSubjectIds(s).includes(subjectId)
        );
        if (hasSubject) {
          run += 1;
          if (run > maxConsecutive) {
            errors.push({
              code: 'CONSECUTIVE_LIMIT',
              message: `More than ${maxConsecutive} consecutive periods for subject`,
              subjectId,
              day,
            });
            break;
          }
        } else {
          run = 0;
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
  validateSlot,
  validateVersion,
};
