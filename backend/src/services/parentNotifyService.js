/**
 * In-app alerts for parents (shown on the parent app's Alerts tab, live via Socket.io).
 *
 * A parent is linked to a student the same way as utils/parentScope.js: the parent user's
 * email equals the student's guardianEmail, or the parent's phone equals the student's phone.
 *
 * Every function here swallows its own errors: a failed alert must never break the action
 * that triggered it (saving attendance, marks, fees, ...).
 */
const AcademyStudent = require('../models/academy/AcademyStudent');
const Notification = require('../models/Notification');
const Role = require('../models/Role');
const User = require('../models/User');
const { createNotificationForUser } = require('./realtime/realtimeService');

const SCHOOL_TZ = process.env.ACADEMY_TIMEZONE || process.env.TZ || 'Asia/Karachi';
const PLACEHOLDER_EMAIL =/@parent\.(local|temp)$/i;
const STUDENT_FIELDS = '_id studentName guardianEmail phone classId sectionId';

let parentRoleIdCache = null;
async function parentRoleId() {
  if (!parentRoleIdCache) {
    const role = await Role.findOne({ name: 'parent' }).select('_id').lean();
    parentRoleIdCache = role?._id || null;
  }
  return parentRoleIdCache;
}

function logError(what, err) {
  console.error(`[parent-notify] ${what} failed:`, err?.message || err);
}

function emailOf(student) {
  const email = String(student?.guardianEmail || '').trim().toLowerCase();
  return email && !PLACEHOLDER_EMAIL.test(email) ? email : '';
}

function phoneOf(student) {
  const phone = String(student?.phone || '').trim();
  return phone && phone !== 'N/A' ? phone : '';
}

/** Students given as docs or ids → lean docs with the fields needed for linking. */
async function loadStudents(students) {
  const list = (Array.isArray(students) ? students : [students]).filter(Boolean);
  const docs = [];
  const ids = [];
  list.forEach((s) => {
    if (s && typeof s === 'object' && s.studentName !== undefined && s._id) docs.push(s);
    else ids.push(s?._id || s);
  });
  if (ids.length) {
    const loaded = await AcademyStudent.find({ _id: { $in: ids } }).select(STUDENT_FIELDS).lean();
    docs.push(...loaded);
  }
  const seen = new Set();
  return docs.filter((d) => {
    const key = String(d._id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Map studentId → array of parent user ids. */
async function parentIdsByStudent(students) {
  const roleId = await parentRoleId();
  const result = new Map();
  if (!roleId || !students.length) return result;

  const emails = [...new Set(students.map(emailOf).filter(Boolean))];
  const phones = [...new Set(students.map(phoneOf).filter(Boolean))];
  const or = [];
  if (emails.length) or.push({ email: { $in: emails } });
  if (phones.length) or.push({ phone: { $in: phones } });
  if (!or.length) return result;

  const parents = await User.find({ role: roleId, isActive: true, $or: or })
    .select('_id email phone')
    .lean();

  students.forEach((s) => {
    const email = emailOf(s);
    const phone = phoneOf(s);
    const ids = parents
      .filter(
        (p) =>
          (email && String(p.email || '').toLowerCase() === email && !PLACEHOLDER_EMAIL.test(p.email)) ||
          (phone && String(p.phone || '').trim() === phone)
      )
      .map((p) => String(p._id));
    if (ids.length) result.set(String(s._id), ids);
  });
  return result;
}

/**
 * One alert per (parent, student). `build(student)` returns the notification fields
 * ({ type, title, body, path, ... }) or null to skip that student.
 */
async function notifyParentsOfStudents(students, build) {
  try {
    const docs = await loadStudents(students);
    if (!docs.length) return 0;
    const byStudent = await parentIdsByStudent(docs);
    let sent = 0;
    for (const student of docs) {
      const parentIds = byStudent.get(String(student._id));
      if (!parentIds?.length) continue;
      const doc = build(student);
      if (!doc) continue;
      for (const parentId of parentIds) {
        await createNotificationForUser(parentId, {
          ...doc,
          meta: { studentId: String(student._id), studentName: student.studentName, ...(doc.meta || {}) },
        });
        sent += 1;
      }
    }
    return sent;
  } catch (err) {
    logError('notifyParentsOfStudents', err);
    return 0;
  }
}

/**
 * One alert per parent (not per child), for messages aimed at a group, e.g. a notice.
 * `studentFilter` null → every active parent account.
 */
async function notifyParentsOnce(studentFilter, doc) {
  try {
    let parentIds;
    if (studentFilter) {
      const students = await AcademyStudent.find({
        ...studentFilter,
        status: { $in: ['active', 'pending_fee'] },
      })
        .select(STUDENT_FIELDS)
        .lean();
      const byStudent = await parentIdsByStudent(students);
      parentIds = [...new Set([...byStudent.values()].flat())];
    } else {
      const roleId = await parentRoleId();
      if (!roleId) return 0;
      parentIds = (await User.find({ role: roleId, isActive: true }).select('_id').lean()).map((u) =>
        String(u._id)
      );
    }
    for (const parentId of parentIds) {
      await createNotificationForUser(parentId, doc);
    }
    return parentIds.length;
  } catch (err) {
    logError('notifyParentsOnce', err);
    return 0;
  }
}

/** Run an alert job after the response, so it never slows down or fails the request. */
function later(fn) {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch((err) => logError('background alert', err));
  });
}

// ── Event-specific alerts ────────────────────────────────────────────────────

const ATTENDANCE_TEXT = {
  present: { title: 'Arrived at school', verb: 'was marked present' },
  late: { title: 'Arrived late', verb: 'was marked late' },
  absent: { title: 'Absent today', verb: 'was marked absent' },
  leave: { title: 'On leave', verb: 'was marked on leave' },
};

function formatDay(date) {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: SCHOOL_TZ });
}

/** rows: [{ studentId, status, date }] */
function attendanceMarked(rows) {
  const valid = (rows || []).filter((r) => r?.studentId && ATTENDANCE_TEXT[r.status]);
  if (!valid.length) return;
  const byStudent = new Map(valid.map((r) => [String(r.studentId), r]));
  later(() =>
    notifyParentsOfStudents([...byStudent.keys()], (student) => {
      const row = byStudent.get(String(student._id));
      const text = ATTENDANCE_TEXT[row.status];
      const day = formatDay(row.date);
      return {
        type: `attendance_${row.status}`,
        title: `${student.studentName}: ${text.title}`,
        body: `${student.studentName} ${text.verb} on ${day}.`,
        path: '/attendance',
        moduleKey: 'attendance',
        resource: 'attendance',
        resourceId: String(student._id),
        meta: { status: row.status, date: row.date },
      };
    })
  );
}

/** New marks for a class test / assessment. assessments: lean or mongoose docs. */
function marksPosted(assessments) {
  const list = (assessments || []).filter((a) => a?.studentId);
  if (!list.length) return;
  const byStudent = new Map(list.map((a) => [String(a.studentId?._id || a.studentId), a]));
  later(() =>
    notifyParentsOfStudents([...byStudent.keys()], (student) => {
      const a = byStudent.get(String(student._id));
      const subject = a.subjectId?.subjectName ? ` (${a.subjectId.subjectName})` : '';
      const body = a.isAbsent
        ? `${student.studentName} was absent for ${a.title}${subject}.`
        : `${student.studentName} scored ${a.obtainedMarks}/${a.totalMarks} in ${a.title}${subject}.`;
      return {
        type: 'result_marks',
        title: `New marks: ${a.title}${subject}`,
        body,
        path: '/exams/report-card',
        moduleKey: 'exam',
        resource: 'report-card',
        resourceId: String(a._id || ''),
        meta: { assessmentId: String(a._id || ''), title: a.title },
      };
    })
  );
}

/** Exam result(s) published. results: [{ _id, academyStudent, exam: {title}, percentage, grade }] */
function examResultsPublished(results) {
  const list = (results || []).filter((r) => r?.academyStudent);
  if (!list.length) return;
  const byStudent = new Map(list.map((r) => [String(r.academyStudent?._id || r.academyStudent), r]));
  later(() =>
    notifyParentsOfStudents([...byStudent.keys()], (student) => {
      const r = byStudent.get(String(student._id));
      const examTitle = r.exam?.title || 'Exam';
      const pct = Number.isFinite(Number(r.percentage)) ? ` (${Math.round(Number(r.percentage))}%)` : '';
      return {
        type: 'result_published',
        title: `Result published: ${examTitle}`,
        body: `${student.studentName}'s ${examTitle} result is out${pct}.`,
        path: '/exams/report-card',
        moduleKey: 'exam',
        resource: 'report-card',
        resourceId: String(r._id || ''),
        meta: { resultId: String(r._id || ''), examTitle },
      };
    })
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function feePeriod(record) {
  return `${MONTHS[(Number(record.month) || 1) - 1]} ${record.year}`;
}
function money(n) {
  return `Rs ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
}

/**
 * kind: 'issued' | 'overdue' | 'paid'. records: fee record docs (studentId may be populated).
 * opts.amount: money actually received (for 'paid'; defaults to the vouchers' total).
 */
function feeEvent(kind, records, opts = {}) {
  const list = (records || []).filter((r) => r?.studentId);
  if (!list.length) return;
  // A student may have several records (e.g. monthly + stationery): keep them all.
  const byStudent = new Map();
  list.forEach((r) => {
    const key = String(r.studentId?._id || r.studentId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(r);
  });
  later(() =>
    notifyParentsOfStudents([...byStudent.keys()], (student) => {
      const recs = byStudent.get(String(student._id));
      const vouchersTotal = recs.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const total = kind === 'paid' && opts.amount != null ? Number(opts.amount) : vouchersTotal;
      if (kind === 'paid' && !(total > 0)) return null;
      const period = feePeriod(recs[0]);
      const due = recs[0].dueDate ? ` Due ${formatDay(recs[0].dueDate)}.` : '';
      const text = {
        issued: {
          title: `Fee voucher issued: ${period}`,
          body: `A fee voucher of ${money(total)} has been issued for ${student.studentName}.${due}`,
        },
        overdue: {
          title: `Fee overdue: ${period}`,
          body: `${student.studentName}'s fee of ${money(total)} is overdue. Please pay as soon as possible.`,
        },
        paid: {
          title: `Fee received: ${period}`,
          body: `Payment of ${money(total)} for ${student.studentName} has been received. Thank you.`,
        },
      }[kind];
      if (!text) return null;
      return {
        type: `fee_${kind}`,
        ...text,
        path: '/fees',
        moduleKey: 'fee',
        resource: 'fees',
        resourceId: String(recs[0]._id || ''),
        meta: { feeRecordIds: recs.map((r) => String(r._id)), month: recs[0].month, year: recs[0].year },
      };
    })
  );
}

/** New notice on the Notice Board. */
function announcementPosted(ann) {
  if (!ann) return;
  const audience = ann.targetAudience || 'all';
  if (audience === 'teachers') return;
  let filter = null;
  if (audience === 'class') {
    if (!ann.targetClass) return;
    filter = { classId: ann.targetClass };
  } else if (audience === 'section') {
    if (!ann.targetSection) return;
    filter = { sectionId: ann.targetSection };
  }
  const body = String(ann.body || '').replace(/\s+/g, ' ').trim();
  later(() =>
    notifyParentsOnce(filter, {
      type: 'announcement',
      title: `Notice: ${ann.title}`,
      body: body.length > 140 ? `${body.slice(0, 137)}...` : body,
      path: '/announcements',
      moduleKey: 'announcement',
      resource: 'announcements',
      resourceId: String(ann._id),
      meta: { announcementType: ann.type },
    })
  );
}

/**
 * New chat message. Parents get one alert per conversation: a newer message replaces the
 * previous unread alert for that chat instead of piling up.
 * recipients: participant user ids other than the sender who are not viewing the chat.
 */
function chatMessage({ conversationId, senderName, text, type, recipientIds }) {
  const ids = [...new Set((recipientIds || []).map(String).filter(Boolean))];
  if (!ids.length) return;
  later(async () => {
    const roleId = await parentRoleId();
    if (!roleId) return;
    const parents = await User.find({ _id: { $in: ids }, role: roleId, isActive: true }).select('_id').lean();
    const preview = text ? String(text).replace(/\s+/g, ' ').trim() : `[${type || 'attachment'}]`;
    for (const p of parents) {
      await Notification.deleteMany({
        userId: p._id,
        type: 'chat_message',
        resourceId: String(conversationId),
        read: false,
      });
      await createNotificationForUser(p._id, {
        type: 'chat_message',
        title: `New message from ${senderName || 'school'}`,
        body: preview.length > 120 ? `${preview.slice(0, 117)}...` : preview,
        path: '/chat',
        moduleKey: 'chat',
        resource: 'conversation',
        resourceId: String(conversationId),
      });
    }
  });
}

module.exports = {
  notifyParentsOfStudents,
  notifyParentsOnce,
  attendanceMarked,
  marksPosted,
  examResultsPublished,
  feeEvent,
  announcementPosted,
  chatMessage,
};
