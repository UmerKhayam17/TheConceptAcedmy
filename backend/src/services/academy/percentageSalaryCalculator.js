/**
 * Percentage teacher salary:
 *   Salary = teacherPct × Σ (tuition × w)   over that teacher's subject assignments
 *
 * teacherPct = User.salaryPercentage (set when creating/editing the teacher)
 * Full-package / listed subjects: w = tuitionSharePercent / 100
 * Part-time (!isFullPackage): w = 1 / n  (n = number of selected subjects)
 */

const User = require('../../models/User');
const TeacherAssignment = require('../../models/timetable/TeacherAssignment');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademySubject = require('../../models/academy/AcademySubject');

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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
  const tuition = Number(student.monthlyFee) || 0;
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

/**
 * Compute percentage salary for one teacher from tuition pools × teacher %.
 * @returns {{ amount: number, breakdown: object[], salaryPercentage: number }}
 */
async function calculateTeacherPercentageSalary(teacherId, teacherDoc) {
  const member =
    teacherDoc ||
    (await User.findById(teacherId).select('salaryPercentage payType').lean());
  const teacherCutPercent = Math.min(100, Math.max(0, Number(member?.salaryPercentage) || 0));

  const assignments = await TeacherAssignment.find({
    teacher: teacherId,
    isActive: true,
  })
    .populate({ path: 'subject', select: 'subjectName subjectCode tuitionSharePercent status' })
    .populate({ path: 'class', select: 'className' })
    .populate({ path: 'section', select: 'sectionName' })
    .lean();

  const breakdown = [];
  let total = 0;

  for (const a of assignments) {
    const subject = a.subject;
    if (!subject || subject.status === 'inactive') continue;

    const sectionId = a.section?._id || a.section;
    if (!sectionId) continue;

    const students = await AcademyStudent.find({
      sectionId,
      status: 'active',
      monthlyFee: { $gt: 0 },
      selectedSubjects: subject._id,
    })
      .select('monthlyFee selectedSubjects isFullPackage')
      .lean();

    let pool = 0;
    let studentCount = 0;
    for (const st of students) {
      const w = subjectWeightForStudent(st, subject);
      if (w <= 0) continue;
      pool += (Number(st.monthlyFee) || 0) * w;
      studentCount += 1;
    }

    pool = roundMoney(pool);
    if (pool <= 0 && studentCount === 0) continue;

    const salary = roundMoney(pool * (teacherCutPercent / 100));

    breakdown.push({
      subjectId: subject._id,
      subjectName: subject.subjectName,
      className: a.class?.className || '',
      sectionName: a.section?.sectionName || '',
      studentCount,
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
  subjectWeightForStudent,
  calculateTeacherPercentageSalary,
  applyDefaultWeightsToClass,
};
