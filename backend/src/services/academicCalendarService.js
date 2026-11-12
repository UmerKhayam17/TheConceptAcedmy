/**
 * Academic Calendar — one read-only feed of everything dated in a session:
 * session start/end, holidays & vacations, class tests and term exams.
 *
 * Visibility:
 * - Parents: only their linked children's class/section, holidays that apply to students,
 *   published tests/exams, approved holidays.
 * - Everyone else with `academicCalendar: view`: all classes (filterable).
 * - Users who can manage exams also see draft schedules; users who can manage holidays
 *   also see pending (unconfirmed) holidays. Both are flagged so the UI can mark them.
 */
const ApiError = require('../utils/ApiError');
const Session = require('../models/Session');
const Holiday = require('../models/Holiday');
const AssessmentAssignment = require('../models/AssessmentAssignment');
const { hasModulePermission } = require('../modules');
const { isSystemAdmin } = require('../utils/systemAdmin');
const { isParentRole, linkedStudentsForParent } = require('../utils/parentScope');
const { formatDateInTz, resolveTimezone } = require('../utils/schoolDay');
const { assessmentTypeLabel } = require('../config/assessmentTaxonomy');

function idStr(ref) {
  if (!ref) return '';
  return String(typeof ref === 'object' ? ref._id || ref : ref);
}

function canAny(user, modules, actions) {
  if (isSystemAdmin(user)) return true;
  return modules.some((m) => actions.some((a) => hasModulePermission(user, m, a)));
}

async function listSessions() {
  const rows = await Session.find({ status: { $ne: 'archived' } })
    .select('name startDate endDate isActive status')
    .sort({ startDate: -1 })
    .lean();
  return rows.map((s) => ({
    _id: String(s._id),
    name: s.name,
    isActive: Boolean(s.isActive),
    status: s.status,
  }));
}

async function resolveSession(sessionId) {
  if (sessionId) {
    const s = await Session.findById(sessionId).lean();
    if (!s) throw new ApiError(404, 'Session not found');
    return s;
  }
  const active = await Session.findOne({ isActive: true }).lean();
  if (active) return active;
  return Session.findOne({ status: { $ne: 'archived' } }).sort({ startDate: -1 }).lean();
}

/**
 * @param {object} req Express request (needs req.user)
 * @param {{ sessionId?: string, classId?: string, sectionId?: string }} query
 */
async function getAcademicCalendar(req, { sessionId, classId, sectionId } = {}) {
  const user = req.user;
  const sessions = await listSessions();
  const session = await resolveSession(sessionId);
  if (!session) {
    return { sessions, session: null, events: [], filters: { classes: [], sections: [] }, scope: {} };
  }

  const tz = resolveTimezone(session.timezone);
  const parent = isParentRole(req);
  const seeDrafts = !parent && canAny(user, ['examTests', 'examTerm'], ['create', 'edit', 'publish']);
  const seePendingHolidays = !parent && canAny(user, ['holidays', 'sessions'], ['create', 'edit']);

  // ── Parent scope: their children's classes / sections ─────────────
  let kidClassIds = null;
  let kidSectionIds = null;
  if (parent) {
    const kids = await linkedStudentsForParent(req, { select: 'classId sectionId' });
    kidClassIds = new Set(kids.map((k) => idStr(k.classId)).filter(Boolean));
    kidSectionIds = new Set(kids.map((k) => idStr(k.sectionId)).filter(Boolean));
  }

  const events = [];

  // ── Session start / end ───────────────────────────────────────────
  const startYmd = formatDateInTz(session.startDate, tz);
  const endYmd = formatDateInTz(session.endDate, tz);
  events.push({
    id: `session-start-${session._id}`,
    kind: 'session',
    title: `${session.name} begins`,
    startDate: startYmd,
    endDate: startYmd,
  });
  events.push({
    id: `session-end-${session._id}`,
    kind: 'session',
    title: `${session.name} ends`,
    startDate: endYmd,
    endDate: endYmd,
  });

  // ── Holidays & vacations ─────────────────────────────────────────
  const holidayQ = { sessionId: session._id };
  if (!seePendingHolidays) holidayQ.status = 'approved';
  const holidays = await Holiday.find(holidayQ).sort({ startDate: 1 }).lean();
  for (const h of holidays) {
    if (parent && h.appliesTo && h.appliesTo.students === false) continue;
    events.push({
      id: `holiday-${h._id}`,
      kind: h.category === 'vacation' ? 'vacation' : 'holiday',
      title: h.name,
      startDate: h.startDate,
      endDate: h.endDate || h.startDate,
      category: h.category,
      status: h.status,
      tentative: h.status !== 'approved' || Boolean(h.estimated),
      notes: h.notes || '',
    });
  }

  // ── Tests & exams (assessment assignments → one event per subject paper) ──
  const assignQ = { sessionId: session._id };
  if (!seeDrafts) assignQ.status = 'published';
  const assignments = await AssessmentAssignment.find(assignQ)
    .populate([
      { path: 'classId', select: 'className' },
      { path: 'sectionId', select: 'sectionName classId' },
      { path: 'disciplineId', select: 'name' },
      { path: 'papers.subjectId', select: 'subjectName' },
    ])
    .lean();

  const classMap = new Map();
  const sectionMap = new Map();

  for (const a of assignments) {
    const cid = idStr(a.classId);
    const sid = idStr(a.sectionId);
    if (parent) {
      if (!kidClassIds.has(cid)) continue;
      if (sid && kidSectionIds.size && !kidSectionIds.has(sid)) continue;
    }

    const className = typeof a.classId === 'object' ? a.classId?.className || '' : '';
    const sectionName = typeof a.sectionId === 'object' ? a.sectionId?.sectionName || '' : '';
    if (cid && !classMap.has(cid)) classMap.set(cid, { _id: cid, className });
    if (sid && !sectionMap.has(sid)) sectionMap.set(sid, { _id: sid, sectionName, classId: cid });

    if (classId && cid !== String(classId)) continue;
    if (sectionId && sid && sid !== String(sectionId)) continue;

    for (const p of a.papers || []) {
      if (!p.examDate) continue;
      const ymd = formatDateInTz(p.examDate, tz);
      const subjectName = typeof p.subjectId === 'object' ? p.subjectId?.subjectName || '' : '';
      events.push({
        id: `paper-${a._id}-${idStr(p.subjectId)}`,
        kind: a.category === 'exam' ? 'exam' : 'test',
        title: subjectName ? `${a.name}: ${subjectName}` : a.name,
        assessmentName: a.name,
        assessmentTypeLabel: assessmentTypeLabel(a.assessmentType),
        startDate: ymd,
        endDate: ymd,
        classId: cid,
        className,
        sectionId: sid,
        sectionName,
        disciplineName: typeof a.disciplineId === 'object' ? a.disciplineId?.name || '' : '',
        subjectName,
        totalMarks: p.totalMarks || null,
        syllabus: p.syllabus || '',
        status: a.status,
        tentative: a.status !== 'published',
      });
    }
  }

  events.sort((x, y) => (x.startDate < y.startDate ? -1 : x.startDate > y.startDate ? 1 : 0));

  const byName = (key) => (x, y) => String(x[key]).localeCompare(String(y[key]), undefined, { numeric: true });

  return {
    sessions,
    session: {
      _id: String(session._id),
      name: session.name,
      startDate: startYmd,
      endDate: endYmd,
      workingDays: session.workingDays || [],
      timezone: tz,
    },
    events,
    filters: {
      classes: [...classMap.values()].sort(byName('className')),
      sections: [...sectionMap.values()].sort(byName('sectionName')),
    },
    scope: { parent, seeDrafts, seePendingHolidays },
  };
}

module.exports = { getAcademicCalendar };
