const Joi = require('joi');
const { WEEKDAYS, PERIOD_TYPES, ROOM_TYPES, TIMETABLE_STATUSES, SLOT_SOURCES } = require('../models/timetable/constants');

const objectId = Joi.string().hex().length(24);

const periodSlotBody = Joi.object({
  order: Joi.number().integer().min(1).required(),
  label: Joi.string().required().trim(),
  startTime: Joi.string().required().trim(),
  endTime: Joi.string().required().trim(),
  type: Joi.string().valid(...PERIOD_TYPES).default('lecture'),
});

const periodBreakBody = Joi.object({
  breakName: Joi.string().required().trim(),
  startTime: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required()
    .trim(),
  endTime: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required()
    .trim(),
});

const roomBody = Joi.object({
  session: objectId.required(),
  name: Joi.string().required().trim(),
  code: Joi.string().required().trim(),
  capacity: Joi.number().integer().min(1),
  type: Joi.string().valid(...ROOM_TYPES),
  assignedClass: objectId.allow(null),
  equipment: Joi.array().items(Joi.string().trim()),
  isActive: Joi.boolean(),
});

const roomPatch = roomBody.fork(['session', 'name', 'code'], (s) => s.optional()).min(1);

const periodTemplateBody = Joi.object({
  session: objectId.required(),
  name: Joi.string().trim().allow(''),
  academyStartTime: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required()
    .trim(),
  academyEndTime: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required()
    .trim(),
  periodDurationMinutes: Joi.number().integer().min(1).required(),
  breaks: Joi.array().items(periodBreakBody).default([]),
  isDefault: Joi.boolean(),
  isActive: Joi.boolean(),
});

const periodTemplatePatch = Joi.object({
  name: Joi.string().trim().allow(''),
  academyStartTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).trim(),
  academyEndTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).trim(),
  periodDurationMinutes: Joi.number().integer().min(1),
  breaks: Joi.array().items(periodBreakBody),
  slots: Joi.array().items(periodSlotBody).min(1),
  isDefault: Joi.boolean(),
  isActive: Joi.boolean(),
}).min(1);

const teacherAvailability = Joi.object({
  day: Joi.string().valid(...WEEKDAYS).required(),
  periodIds: Joi.array().items(objectId).default([]),
});

const teacherProfileBody = Joi.object({
  user: objectId.required(),
  session: objectId.required(),
  subjects: Joi.array().items(objectId).default([]),
  maxLecturesPerDay: Joi.number().integer().min(1),
  maxLecturesPerWeek: Joi.number().integer().min(1),
  availability: Joi.array().items(teacherAvailability).default([]),
  preferredRooms: Joi.array().items(objectId).default([]),
  isActive: Joi.boolean(),
});

const teacherProfilePatch = teacherProfileBody
  .fork(['user', 'session'], (s) => s.optional())
  .min(1);

const teacherAssignmentBody = Joi.object({
  session: objectId.required(),
  class: objectId.required(),
  section: objectId.required(),
  subject: objectId.required(),
  teacher: objectId.required(),
  isPrimary: Joi.boolean(),
  priority: Joi.number().integer().min(1),
  isActive: Joi.boolean(),
});

const teacherAssignmentPatch = teacherAssignmentBody
  .fork(['session', 'class', 'section', 'subject', 'teacher'], (s) => s.optional())
  .min(1);

const timetableSettingsBody = Joi.object({
  defaultPeriodTemplate: objectId.allow(null),
  defaultMaxTeacherPerDay: Joi.number().integer().min(1),
  defaultMaxConsecutive: Joi.number().integer().min(1),
  allowDoublePeriods: Joi.boolean(),
  autoAssignRooms: Joi.boolean(),
  conflictCheckOnDraft: Joi.boolean(),
  publishRequiresCompleteQuotas: Joi.boolean(),
  gridStartDay: Joi.string().valid(...WEEKDAYS),
}).min(1);

const timetableVersionBody = Joi.object({
  session: objectId.required(),
  class: objectId.required(),
  section: objectId.required(),
  periodTemplate: objectId.required(),
  effectiveFrom: Joi.date().allow(null),
  notes: Joi.string().allow('').trim(),
});

const scheduleSlotBody = Joi.object({
  day: Joi.string().valid(...WEEKDAYS).required(),
  /** Extra days to create the same period assignment (Mon–Fri apply, or custom selection). */
  days: Joi.array().items(Joi.string().valid(...WEEKDAYS)).min(1).max(7),
  /** Shorthand: create Mon–Fri at the same period/subject/teachers. */
  applyToFullWeek: Joi.boolean(),
  periodId: objectId.required(),
  /** Single-subject slots (legacy / simple). */
  subject: objectId,
  teacher: objectId,
  /** Choice-group slots: concurrent subjects with a teacher each. */
  entries: Joi.array()
    .items(
      Joi.object({
        subject: objectId.required(),
        teacher: objectId.required(),
      })
    )
    .min(1)
    .max(10),
  room: objectId.allow(null),
  locked: Joi.boolean(),
  source: Joi.string().valid(...SLOT_SOURCES),
})
  .xor('entries', 'subject')
  .and('subject', 'teacher');

const scheduleSlotMove = Joi.object({
  day: Joi.string().valid(...WEEKDAYS),
  periodId: objectId,
  subject: objectId,
  teacher: objectId,
  entries: Joi.array()
    .items(
      Joi.object({
        subject: objectId.required(),
        teacher: objectId.required(),
      })
    )
    .min(1)
    .max(10),
  room: objectId.allow(null),
}).min(1);

const substitutionBody = Joi.object({
  sessionId: objectId.required(),
  sectionId: objectId.required(),
  day: Joi.string().valid(...WEEKDAYS).required(),
  periodId: objectId.required(),
  originalTeacherId: objectId.required(),
  substituteTeacherId: objectId.required(),
});

const sessionBodyExtended = Joi.object({
  name: Joi.string().required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  isActive: Joi.boolean(),
  workingDays: Joi.array().items(Joi.string().valid(...WEEKDAYS)).min(1),
  timezone: Joi.string().trim(),
});

module.exports = {
  roomBody,
  roomPatch,
  periodTemplateBody,
  periodTemplatePatch,
  teacherProfileBody,
  teacherProfilePatch,
  teacherAssignmentBody,
  teacherAssignmentPatch,
  timetableSettingsBody,
  timetableVersionBody,
  scheduleSlotBody,
  scheduleSlotMove,
  substitutionBody,
  sessionBodyExtended,
};
