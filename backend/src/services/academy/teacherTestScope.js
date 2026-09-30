/**
 * Teacher Subject Assignment = permission boundary for catalog-linked tests.
 * Scope is subject + class + section combinations — not teacherId alone.
 */
const TeacherAssignment = require('../../models/timetable/TeacherAssignment');
const ApiError = require('../../utils/ApiError');
const { roleNameOf } = require('../../utils/parentScope');

function isTeacherRole(userOrReq) {
  if (userOrReq?.user) return roleNameOf(userOrReq) === 'teacher';
  const role = userOrReq?.roleDoc?.name || userOrReq?.role?.name || userOrReq?.role;
  return String(role || '') === 'teacher';
}

function idStr(ref) {
  if (!ref) return '';
  return String(typeof ref === 'object' ? ref._id || ref : ref);
}

/**
 * Active teaching combos for a teacher (optionally limited to one session).
 * @returns {Promise<Array<{ assignmentId, sessionId, classId, sectionId, subjectId }>>}
 */
async function getTeacherScopeCombos(teacherId, sessionId) {
  const q = { teacher: teacherId, isActive: true };
  if (sessionId) q.session = sessionId;
  const rows = await TeacherAssignment.find(q)
    .select('_id session class section subject')
    .lean();
  return rows.map((r) => ({
    assignmentId: r._id,
    sessionId: r.session,
    classId: r.class,
    sectionId: r.section,
    subjectId: r.subject,
  }));
}

function comboMatchesClassSection(combo, classId, sectionId) {
  if (idStr(combo.classId) !== idStr(classId)) return false;
  if (!sectionId) return true;
  return idStr(combo.sectionId) === idStr(sectionId);
}

function comboMatchesTest(combo, test) {
  if (idStr(combo.classId) !== idStr(test.classId)) return false;
  if (idStr(combo.subjectId) !== idStr(test.subjectId)) return false;
  const testSection = idStr(test.sectionId);
  if (!testSection) return true;
  return idStr(combo.sectionId) === testSection;
}

/** Assignment visible if teacher has any combo for its class (+ section when set). */
function assignmentMatchesCombos(assignment, combos) {
  const classId = idStr(assignment.classId);
  const sectionId = idStr(assignment.sectionId);
  return combos.some((c) => comboMatchesClassSection(c, classId, sectionId || undefined));
}

/** Subject ids the teacher may configure for a class/section. */
function subjectIdsForClassSection(combos, classId, sectionId) {
  const set = new Set();
  for (const c of combos) {
    if (!comboMatchesClassSection(c, classId, sectionId || undefined)) continue;
    if (sectionId && idStr(c.sectionId) !== idStr(sectionId)) continue;
    set.add(idStr(c.subjectId));
  }
  return set;
}

/** Mongo filter: only tests in the given subject/class/section combos. */
function mongoFilterForCombos(combos) {
  if (!combos.length) {
    return { _id: { $in: [] } };
  }
  return {
    $or: combos.map((c) => ({
      classId: c.classId,
      sectionId: c.sectionId,
      subjectId: c.subjectId,
    })),
  };
}

async function assertTeacherOwnsCombo(teacherId, { classId, sectionId, subjectId, sessionId }) {
  if (!classId || !sectionId || !subjectId) {
    throw new ApiError(400, 'Class, section, and subject are required');
  }
  const q = {
    teacher: teacherId,
    class: classId,
    section: sectionId,
    subject: subjectId,
    isActive: true,
  };
  if (sessionId) q.session = sessionId;
  const row = await TeacherAssignment.findOne(q).select('_id').lean();
  if (!row) {
    throw new ApiError(403, 'You are not assigned to this subject/class combination');
  }
  return row;
}

async function assertTeacherHasClassSection(teacherId, { classId, sectionId, sessionId }) {
  if (!classId || !sectionId) {
    throw new ApiError(400, 'Class and section are required for teachers');
  }
  const q = {
    teacher: teacherId,
    class: classId,
    section: sectionId,
    isActive: true,
  };
  if (sessionId) q.session = sessionId;
  const row = await TeacherAssignment.findOne(q).select('_id').lean();
  if (!row) {
    throw new ApiError(403, 'You are not assigned to this class/section');
  }
  return row;
}

async function assertTeacherCanAccessTest(teacherId, test, sessionId) {
  const combos = await getTeacherScopeCombos(teacherId, sessionId);
  if (!combos.some((c) => comboMatchesTest(c, test))) {
    throw new ApiError(403, 'You are not assigned to this test subject/class');
  }
}

async function assertTeacherCanAccessAssignment(teacherId, assignment, sessionId) {
  const combos = await getTeacherScopeCombos(teacherId, sessionId);
  if (!assignmentMatchesCombos(assignment, combos)) {
    throw new ApiError(403, 'You are not assigned to this class/section');
  }
  return combos;
}

/** Resolve teaching teacher for a subject/class/section (for ClassTest.teacherId). */
async function resolveTeacherForCombo({ sessionId, classId, sectionId, subjectId }) {
  const q = {
    class: classId,
    subject: subjectId,
    isActive: true,
  };
  if (sessionId) q.session = sessionId;
  if (sectionId) q.section = sectionId;
  const row = await TeacherAssignment.findOne(q).select('teacher').sort({ priority: 1 }).lean();
  return row?.teacher || null;
}

/** Unique class ObjectIds from assignment combos. */
function classIdsFromCombos(combos) {
  const ids = [];
  const seen = new Set();
  for (const c of combos) {
    const id = idStr(c.classId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(c.classId);
  }
  return ids;
}

/**
 * Mongo filter: students in the teacher's assigned class/section combos.
 * Students without a section are included when the teacher has any assignment for that class.
 */
function mongoStudentFilterForCombos(combos) {
  if (!combos.length) {
    return { _id: { $in: [] } };
  }
  const seen = new Set();
  const or = [];
  for (const c of combos) {
    const classKey = idStr(c.classId);
    const sectionKey = idStr(c.sectionId);
    if (!classKey) continue;
    const pairKey = `${classKey}:${sectionKey}`;
    if (!seen.has(pairKey) && sectionKey) {
      seen.add(pairKey);
      or.push({ classId: c.classId, sectionId: c.sectionId });
    }
    const noSectionKey = `${classKey}:__none__`;
    if (!seen.has(noSectionKey)) {
      seen.add(noSectionKey);
      or.push({
        classId: c.classId,
        $or: [{ sectionId: null }, { sectionId: { $exists: false } }],
      });
    }
  }
  return or.length ? { $or: or } : { _id: { $in: [] } };
}

async function assertTeacherCanAccessStudent(teacherId, student, sessionId) {
  const combos = await getTeacherScopeCombos(teacherId, sessionId);
  const classId = student?.classId?._id || student?.classId;
  const sectionId = student?.sectionId?._id || student?.sectionId;
  if (!combos.some((c) => comboMatchesClassSection(c, classId, sectionId || undefined))) {
    throw new ApiError(403, 'You are not assigned to this student\'s class');
  }
  return combos;
}

async function assertTeacherCanAccessClass(teacherId, classId, sessionId) {
  const combos = await getTeacherScopeCombos(teacherId, sessionId);
  if (!combos.some((c) => idStr(c.classId) === idStr(classId))) {
    throw new ApiError(403, 'You are not assigned to this class');
  }
  return combos;
}

const TEACHER_HIDDEN_STUDENT_FIELDS = [
  'phone',
  'contactPhoneRes',
  'monthlyFee',
  'admissionFee',
  'monthlyFeeDiscount',
  'admissionFeeDiscount',
  'discountAmount',
  'totalFee',
  'feeStructureId',
];

/** Strip contact/fee fields teachers must not see. */
function sanitizeStudentForTeacher(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: true }) : { ...doc };
  for (const field of TEACHER_HIDDEN_STUDENT_FIELDS) {
    delete obj[field];
  }
  return obj;
}

function sanitizeStudentRecordForTeacher(record) {
  if (!record) return record;
  return {
    ...record,
    student: sanitizeStudentForTeacher(record.student),
    fees: {
      summary: {
        recordsCount: 0,
        totalPaid: 0,
        totalPending: 0,
        byStatus: { pending: 0, paid: 0, overdue: 0, waived: 0 },
      },
      records: [],
    },
  };
}

module.exports = {
  isTeacherRole,
  idStr,
  getTeacherScopeCombos,
  comboMatchesClassSection,
  comboMatchesTest,
  assignmentMatchesCombos,
  subjectIdsForClassSection,
  mongoFilterForCombos,
  mongoStudentFilterForCombos,
  classIdsFromCombos,
  assertTeacherOwnsCombo,
  assertTeacherHasClassSection,
  assertTeacherCanAccessTest,
  assertTeacherCanAccessAssignment,
  assertTeacherCanAccessStudent,
  assertTeacherCanAccessClass,
  sanitizeStudentForTeacher,
  sanitizeStudentRecordForTeacher,
  TEACHER_HIDDEN_STUDENT_FIELDS,
  resolveTeacherForCombo,
};
