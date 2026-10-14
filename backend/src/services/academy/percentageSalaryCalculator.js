/**
 * Percentage teacher salary (monthly tuition only — never admission / totalFee):
 *   Salary = teacherPct × Σ (tuition × w)   over that teacher's subject assignments
 *
 * teacherPct = User.salaryPercentage (set when creating/editing the teacher)
 * tuition    = student.monthlyFee − monthlyFeeDiscount  (admission fee is excluded)
 * Full-package / listed subjects: w = tuitionSharePercent / 100
 * Part-time (!isFullPackage): w = 1 / n  (n = number of selected subjects)
 *
 * Teaching scope comes from TeacherAssignment AND Class Board ScheduleSlots
 * (Class Board alone used to miss salary because it only wrote timetable slots).
 */

const User = require('../../models/User');
const TeacherAssignment = require('../../models/timetable/TeacherAssignment');
const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademySubject = require('../../models/academy/AcademySubject');

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function idOf(ref) {
  if (!ref) return '';
  return String(ref._id || ref);
}

/** Net monthly tuition only — excludes admission fee and totalFee. */
function studentMonthlyTuition(student) {
  const gross = Number(student.monthlyFee) || 0;
  const discount = Number(student.monthlyFeeDiscount) || 0;
  return Math.max(0, gross - discount);
}

function studentTakesSubject(student, subjectId) {
  const ids = (student.selectedSubjects || []).map((s) => String(s._id || s));
  return ids.includes(String(subjectId));
}

/**
 * Weight of one student's tuition for a subject.
 * @returns {number} fraction 0–1
 */
function subjectWeightForStudent(student, subject) {
  const tuition = studentMonthlyTuition(student);
  if (tuition <= 0) return 0;
  if (!studentTakesSubject(student, subject._id)) return 0;

  const n = (student.selectedSubjects || []).length;
  // Part-time: equal split across enrolled subjects (Excel D/H).
  if (!student.isFullPackage && n > 0) {
    return 1 / n;
  }

  const share = Number(subject.tuitionSharePercent) || 0;
  if (share <= 0) return 0;
  return share / 100;
}

function comboKey(sectionId, subjectId) {
  return `${String(sectionId)}:${String(subjectId)}`;
}

function putCombo(map, { subject, classDoc, section }) {
  const subjectId = idOf(subject);
  const sectionId = idOf(section);
  if (!subjectId || !sectionId) return;
  const key = comboKey(sectionId, subjectId);
  if (map.has(key)) return;
  map.set(key, {
    subject,
    class: classDoc,
    section,
  });
}

/**
 * Unique section+subject combos this teacher teaches (assignments + Class Board slots).
 */
async function loadTeacherTeachingCombos(teacherId) {
  const tid = String(teacherId);
  const map = new Map();

  const assignments = await TeacherAssignment.find({
    teacher: teacherId,
    isActive: true,
  })
    .populate({ path: 'subject', select: 'subjectName subjectCode tuitionSharePercent status' })
    .populate({ path: 'class', select: 'className' })
    .populate({ path: 'section', select: 'sectionName' })
    .lean();

  for (const a of assignments) {
    putCombo(map, { subject: a.subject, classDoc: a.class, section: a.section });
  }

  const slots = await ScheduleSlot.find({
    cancelled: { $ne: true },
    isSubstitute: { $ne: true },
    $or: [{ teacher: teacherId }, { 'parallelEntries.teacher': teacherId }],
  })
    .populate({ path: 'subject', select: 'subjectName subjectCode tuitionSharePercent status' })
    .populate({ path: 'class', select: 'className' })
    .populate({ path: 'section', select: 'sectionName' })
    .populate({
      path: 'parallelEntries.subject',
      select: 'subjectName subjectCode tuitionSharePercent status',
    })
    .lean();

  for (const slot of slots) {
    if (idOf(slot.teacher) === tid) {
      putCombo(map, { subject: slot.subject, classDoc: slot.class, section: slot.section });
    }
    for (const pe of slot.parallelEntries || []) {
      if (idOf(pe.teacher) !== tid) continue;
      putCombo(map, {
        subject: pe.subject,
        classDoc: slot.class,
        section: slot.section,
      });
    }
  }

  return [...map.values()];
}

/**
 * Compute percentage salary for one teacher from tuition pools × teacher %.
 * @returns {{ amount: number, breakdown: object[], salaryPercentage: number }}
 */
async function calculateTeacherPercentageSalary(teacherId, teacherDoc) {
  const member =
    teacherDoc ||
    (await User.findById(teacherId).select('salaryPercentage payType').lean());
  const teacherCutPercent = Math.min(100, Math.max(0, Number(member?.salaryPercentage) || 0));

  const combos = await loadTeacherTeachingCombos(teacherId);

  const breakdown = [];
  let total = 0;

  // Resolve any subject refs that did not populate (e.g. parallelEntries).
  const missingSubjectIds = [
    ...new Set(
      combos
        .filter((c) => c.subject && !c.subject.subjectName && idOf(c.subject))
        .map((c) => idOf(c.subject))
    ),
  ];
  if (missingSubjectIds.length) {
    const found = await AcademySubject.find({ _id: { $in: missingSubjectIds } })
      .select('subjectName subjectCode tuitionSharePercent status')
      .lean();
    const byId = new Map(found.map((s) => [String(s._id), s]));
    for (const c of combos) {
      if (c.subject && !c.subject.subjectName) {
        const full = byId.get(idOf(c.subject));
        if (full) c.subject = full;
      }
    }
  }

  for (const a of combos) {
    const subj = a.subject;
    if (!subj || !subj.subjectName || subj.status === 'inactive') continue;

    const sectionId = idOf(a.section);
    if (!sectionId) continue;

    const students = await AcademyStudent.find({
      sectionId,
      status: 'active',
      monthlyFee: { $gt: 0 },
      selectedSubjects: subj._id,
    })
      .select('monthlyFee monthlyFeeDiscount selectedSubjects isFullPackage')
      .lean();

    let pool = 0;
    let studentCount = 0;
    let monthlyTuitionTotal = 0;
    for (const st of students) {
      const tuition = studentMonthlyTuition(st);
      const w = subjectWeightForStudent(st, subj);
      if (w <= 0 || tuition <= 0) continue;
      pool += tuition * w;
      monthlyTuitionTotal += tuition;
      studentCount += 1;
    }

    pool = roundMoney(pool);
    monthlyTuitionTotal = roundMoney(monthlyTuitionTotal);
    if (pool <= 0 && studentCount === 0) continue;

    const salary = roundMoney(pool * (teacherCutPercent / 100));

    breakdown.push({
      subjectId: subj._id,
      subjectName: subj.subjectName,
      className: a.class?.className || '',
      sectionName: a.section?.sectionName || '',
      studentCount,
      monthlyTuitionTotal,
      tuitionSharePercent: Number(subj.tuitionSharePercent) || 0,
      pool,
      teacherCutPercent,
      salary,
    });

    total += salary;
  }

  return {
    amount: roundMoney(total),
    breakdown,
    salaryPercentage: teacherCutPercent,
  };
}

/**
 * Apply Excel default tuition-share weights to all subjects in a class (overwrite).
 * Does not touch teacher percentage — that lives on the staff user.
 */
async function applyDefaultWeightsToClass(classId, className) {
  const { defaultSalaryWeights } = require('../../utils/subjectSalaryWeights');
  const subjects = await AcademySubject.find({ classId });
  let updated = 0;
  for (const doc of subjects) {
    const defaults = defaultSalaryWeights(className, doc.subjectName, doc.subjectCode);
    doc.tuitionSharePercent = defaults.tuitionSharePercent;
    await doc.save();
    updated += 1;
  }
  return { updated };
}

module.exports = {
  roundMoney,
  studentMonthlyTuition,
  subjectWeightForStudent,
  loadTeacherTeachingCombos,
  calculateTeacherPercentageSalary,
  applyDefaultWeightsToClass,
};
