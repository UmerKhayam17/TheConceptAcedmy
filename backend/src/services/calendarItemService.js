/**
 * Calendar items planned directly on the Academic Calendar: lesson plans, homework, school events.
 *
 * Who can plan:
 * - System admin, admin-role users, teachers, and anyone granted `academicCalendar: create`.
 * - Teachers may only edit / delete items they created; admins (and roles with
 *   `academicCalendar: delete`) may manage any item.
 * - Parents never plan. They see events + homework for their children's class/section only.
 *
 * Bulk creation: the client sends `dates: [YYYY-MM-DD, …]` (a whole month or the whole session)
 * and one item is created per date (homework due date keeps the same offset from each date).
 */
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const Session = require('../models/Session');
const CalendarItem = require('../models/CalendarItem');
const AcademyClass = require('../models/academy/AcademyClass');
const AcademySection = require('../models/academy/AcademySection');
const AcademySubject = require('../models/academy/AcademySubject');
const { ITEM_TYPES, EVENT_CATEGORIES } = require('../models/CalendarItem');
const { hasModulePermission } = require('../modules');
const { isSystemAdmin, isAdminRole, roleNameOfUser } = require('../utils/systemAdmin');
const { isParentRole } = require('../utils/parentScope');
const { formatDateInTz, resolveTimezone } = require('../utils/schoolDay');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_BULK = 400;

function idStr(ref) {
  if (!ref) return '';
  return String(typeof ref === 'object' ? ref._id || ref : ref);
}

function isTeacher(user) {
  return roleNameOfUser(user) === 'teacher';
}

/** Can the user create calendar items at all? */
function canPlan(req) {
  const user = req.user;
  if (!user || isParentRole(req)) return false;
  return (
    isSystemAdmin(user) ||
    isAdminRole(user) ||
    isTeacher(user) ||
    hasModulePermission(user, 'academicCalendar', 'create')
  );
}

/** Can the user edit / delete items created by someone else? */
function canManageAll(req) {
  const user = req.user;
  if (!user || isParentRole(req)) return false;
  if (isSystemAdmin(user) || isAdminRole(user)) return true;
  if (isTeacher(user)) return false;
  return hasModulePermission(user, 'academicCalendar', 'delete');
}

function canChange(req, item) {
  if (!canPlan(req)) return false;
  if (canManageAll(req)) return true;
  return idStr(item.createdBy) === idStr(req.user._id);
}

function ymdToUtc(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDays(ymd, n) {
  const dt = new Date(ymdToUtc(ymd) + n * 86400000);
  return dt.toISOString().slice(0, 10);
}

function dayDiff(a, b) {
  return Math.round((ymdToUtc(b) - ymdToUtc(a)) / 86400000);
}

function assertYmd(v, label) {
  if (typeof v !== 'string' || !YMD.test(v) || Number.isNaN(ymdToUtc(v))) {
    throw new ApiError(400, `${label} must be a valid date (YYYY-MM-DD)`);
  }
}

function cleanStr(v, max) {
  return String(v ?? '').trim().slice(0, max);
}

async function loadSession(sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) throw new ApiError(400, 'Invalid sessionId');
  const s = await Session.findById(sessionId).lean();
  if (!s) throw new ApiError(404, 'Session not found');
  const tz = resolveTimezone(s.timezone);
  return { session: s, start: formatDateInTz(s.startDate, tz), end: formatDateInTz(s.endDate, tz) };
}

/** Validate class / section / subject belong together. Returns normalized ids. */
async function resolveScope(sessionId, { classId, sectionId, subjectId }) {
  const out = { classId: null, sectionId: null, subjectId: null };
  if (classId) {
    if (!mongoose.isValidObjectId(classId)) throw new ApiError(400, 'Invalid class');
    const cls = await AcademyClass.findById(classId).select('sessionId').lean();
    if (!cls) throw new ApiError(400, 'Class not found');
    if (cls.sessionId && String(cls.sessionId) !== String(sessionId)) {
      throw new ApiError(400, 'Class does not belong to this session');
    }
    out.classId = cls._id;
  }
  if (sectionId) {
    if (!out.classId) throw new ApiError(400, 'Choose a class before choosing a section');
    if (!mongoose.isValidObjectId(sectionId)) throw new ApiError(400, 'Invalid section');
    const sec = await AcademySection.findById(sectionId).select('classId').lean();
    if (!sec || String(sec.classId) !== String(out.classId)) {
      throw new ApiError(400, 'Section does not belong to the chosen class');
    }
    out.sectionId = sec._id;
  }
  if (subjectId) {
    if (!out.classId) throw new ApiError(400, 'Choose a class before choosing a subject');
    if (!mongoose.isValidObjectId(subjectId)) throw new ApiError(400, 'Invalid subject');
    const sub = await AcademySubject.findById(subjectId).select('classId').lean();
    if (!sub || String(sub.classId) !== String(out.classId)) {
      throw new ApiError(400, 'Subject does not belong to the chosen class');
    }
    out.subjectId = sub._id;
  }
  return out;
}

/** Validate and normalize the shared (non-date) fields of a create / update body. */
function normalizeFields(type, body) {
  const title = cleanStr(body.title, 200);
  if (!title) throw new ApiError(400, 'Title is required');
  const startTime = cleanStr(body.startTime, 5);
  const endTime = cleanStr(body.endTime, 5);
  if (startTime && !TIME.test(startTime)) throw new ApiError(400, 'Start time must be HH:MM');
  if (endTime && !TIME.test(endTime)) throw new ApiError(400, 'End time must be HH:MM');
  if (startTime && endTime && endTime < startTime) throw new ApiError(400, 'End time must be after start time');
  const out = {
    title,
    description: cleanStr(body.description, 4000),
    objectives: type === 'lesson_plan' ? cleanStr(body.objectives, 2000) : '',
    activities: type === 'lesson_plan' ? cleanStr(body.activities, 2000) : '',
    startTime,
    endTime,
    eventCategory: undefined,
  };
  if (type === 'event') {
    const cat = body.eventCategory || 'other';
    if (!EVENT_CATEGORIES.includes(cat)) throw new ApiError(400, 'Invalid event category');
    out.eventCategory = cat;
  }
  return out;
}

function assertScopeRules(type, scope) {
  if ((type === 'lesson_plan' || type === 'homework') && !scope.classId) {
    throw new ApiError(400, 'Choose a class for lesson plans and homework');
  }
}

/**
 * Create one item, or many when `dates` is given.
 * Body: { sessionId, type, title, …, startDate, endDate } or { …, dates: [ymd], durationDays? }
 */
async function createItems(req, body) {
  if (!canPlan(req)) throw new ApiError(403, 'You do not have permission to plan on the calendar');
  const type = body.type;
  if (!ITEM_TYPES.includes(type)) throw new ApiError(400, 'Invalid item type');
  const { session, start, end } = await loadSession(body.sessionId);
  const fields = normalizeFields(type, body);
  const scope = await resolveScope(session._id, body);
  assertScopeRules(type, scope);

  let spans;
  if (Array.isArray(body.dates) && body.dates.length) {
    const unique = [...new Set(body.dates.map(String))].sort();
    if (unique.length > MAX_BULK) throw new ApiError(400, `At most ${MAX_BULK} dates at a time`);
    const span = Math.max(0, Math.min(60, Number(body.durationDays) || 0));
    spans = unique.map((d) => {
      assertYmd(d, 'Date');
      return { startDate: d, endDate: addDays(d, span) };
    });
  } else {
    assertYmd(body.startDate, 'Start date');
    const endDate = body.endDate || body.startDate;
    assertYmd(endDate, 'End date');
    if (endDate < body.startDate) throw new ApiError(400, 'End date must be on or after the start date');
    spans = [{ startDate: body.startDate, endDate }];
  }

  for (const s of spans) {
    if (s.startDate < start || s.startDate > end) {
      throw new ApiError(400, `${s.startDate} is outside the session (${start} to ${end})`);
    }
  }

  const docs = spans.map((s) => ({
    sessionId: session._id,
    type,
    ...fields,
    ...scope,
    startDate: s.startDate,
    endDate: s.endDate,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  }));
  const created = await CalendarItem.insertMany(docs);
  return { count: created.length, items: created.map((c) => c.toObject()) };
}

async function updateItem(req, id, body) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid id');
  const item = await CalendarItem.findById(id);
  if (!item) throw new ApiError(404, 'Calendar item not found');
  if (!canChange(req, item)) throw new ApiError(403, 'You can only change items you created');

  const { start, end } = await loadSession(item.sessionId);
  const merged = { ...item.toObject(), ...body };
  const fields = normalizeFields(item.type, merged);
  const scope = await resolveScope(item.sessionId, {
    classId: idStr(merged.classId) || null,
    sectionId: idStr(merged.sectionId) || null,
    subjectId: idStr(merged.subjectId) || null,
  });
  assertScopeRules(item.type, scope);
  assertYmd(merged.startDate, 'Start date');
  const endDate = merged.endDate || merged.startDate;
  assertYmd(endDate, 'End date');
  if (endDate < merged.startDate) throw new ApiError(400, 'End date must be on or after the start date');
  if (merged.startDate < start || merged.startDate > end) {
    throw new ApiError(400, `Date is outside the session (${start} to ${end})`);
  }

  Object.assign(item, fields, scope, {
    startDate: merged.startDate,
    endDate,
    updatedBy: req.user._id,
  });
  await item.save();
  return item.toObject();
}

async function deleteItem(req, id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid id');
  const item = await CalendarItem.findById(id);
  if (!item) throw new ApiError(404, 'Calendar item not found');
  if (!canChange(req, item)) throw new ApiError(403, 'You can only delete items you created');
  await item.deleteOne();
  return { deleted: 1 };
}

/** Classes / sections / subjects of a session for the planner form. */
async function plannerOptions(sessionId) {
  const { session } = await loadSession(sessionId);
  const classes = await AcademyClass.find({ sessionId: session._id }).select('className').lean();
  const classIds = classes.map((c) => c._id);
  const [sections, subjects] = await Promise.all([
    AcademySection.find({ classId: { $in: classIds } }).select('sectionName classId').lean(),
    AcademySubject.find({ classId: { $in: classIds } }).select('subjectName classId').lean(),
  ]);
  const byName = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true });
  return {
    classes: classes.map((c) => ({ _id: String(c._id), className: c.className })).sort(byName('className')),
    sections: sections
      .map((s) => ({ _id: String(s._id), sectionName: s.sectionName, classId: String(s.classId) }))
      .sort(byName('sectionName')),
    subjects: subjects
      .map((s) => ({ _id: String(s._id), subjectName: s.subjectName, classId: String(s.classId) }))
      .sort(byName('subjectName')),
    eventCategories: EVENT_CATEGORIES,
  };
}

/**
 * Feed rows for getAcademicCalendar.
 * @param {{ parent: boolean, kidClassIds: Set<string>|null, kidSectionIds: Set<string>|null, classId?: string, sectionId?: string }} opts
 */
async function calendarItemEvents(req, session, opts) {
  const { parent, kidClassIds, kidSectionIds, classId, sectionId } = opts;
  const q = { sessionId: session._id };
  if (parent) q.type = { $in: ['event', 'homework'] };
  const rows = await CalendarItem.find(q)
    .populate([
      { path: 'classId', select: 'className' },
      { path: 'sectionId', select: 'sectionName' },
      { path: 'subjectId', select: 'subjectName' },
      { path: 'createdBy', select: 'name firstName lastName' },
    ])
    .sort({ startDate: 1 })
    .lean();

  const manageAll = canManageAll(req);
  const planner = canPlan(req);
  const me = idStr(req.user?._id);
  const out = [];
  const classMap = new Map();
  const sectionMap = new Map();

  for (const r of rows) {
    const cid = idStr(r.classId);
    const sid = idStr(r.sectionId);
    if (parent && cid) {
      if (!kidClassIds.has(cid)) continue;
      if (sid && kidSectionIds.size && !kidSectionIds.has(sid)) continue;
    }
    const className = r.classId?.className || '';
    const sectionName = r.sectionId?.sectionName || '';
    if (cid && !classMap.has(cid)) classMap.set(cid, { _id: cid, className });
    if (sid && !sectionMap.has(sid)) sectionMap.set(sid, { _id: sid, sectionName, classId: cid });

    // Whole-school items always pass the class filter; class items must match.
    if (classId && cid && cid !== String(classId)) continue;
    if (sectionId && sid && sid !== String(sectionId)) continue;

    const creator = r.createdBy || {};
    out.push({
      id: `item-${r._id}`,
      itemId: String(r._id),
      kind: r.type,
      title: r.title,
      startDate: r.startDate,
      endDate: r.endDate || r.startDate,
      description: r.description || '',
      objectives: r.objectives || '',
      activities: r.activities || '',
      startTime: r.startTime || '',
      endTime: r.endTime || '',
      eventCategory: r.eventCategory || '',
      classId: cid,
      className,
      sectionId: sid,
      sectionName,
      subjectId: idStr(r.subjectId),
      subjectName: r.subjectId?.subjectName || '',
      createdByName:
        creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(' ') || '',
      canEdit: planner && (manageAll || idStr(r.createdBy) === me),
    });
  }
  return { events: out, classMap, sectionMap };
}

module.exports = {
  canPlan,
  canManageAll,
  createItems,
  updateItem,
  deleteItem,
  plannerOptions,
  calendarItemEvents,
};
