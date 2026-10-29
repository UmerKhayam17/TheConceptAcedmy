/**
 * Extra data for the salary detail page and printable pay slip:
 *  - fixed-pay salary divided across the classes the teacher teaches
 *  - the teacher's attendance for the voucher month (class periods + daily marks)
 */

const Session = require('../../models/Session');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const staffPeriodAttendanceService = require('../staffPeriodAttendanceService');
const staffAttendanceService = require('../staffAttendanceService');
const { todayYmd } = require('../../utils/schoolDay');
const { roundMoney, loadTeacherTeachingCombos } = require('./percentageSalaryCalculator');
const { sortStudentsByRollAsc } = require('../../utils/academyStudentSort');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function classKey(className, sectionName, subjectName) {
  return [className, sectionName, subjectName]
    .map((v) => String(v || '').trim().toLowerCase())
    .join('|');
}

function emptyCounts() {
  return { totalClasses: 0, present: 0, late: 0, absent: 0, leave: 0 };
}

function percentOf(counts) {
  if (!counts.totalClasses) return 0;
  return Math.round(((counts.present + counts.late) / counts.totalClasses) * 1000) / 10;
}

/** Session covering the voucher month, else the active one. */
async function sessionForMonth(month, year) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);
  const covering = await Session.findOne({
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart },
  })
    .sort({ isActive: -1, startDate: -1 })
    .select('name')
    .lean();
  if (covering) return covering;
  return Session.findOne({ isActive: true }).select('name').lean();
}

/**
 * Class-period attendance (from the published timetable) for one teacher and month.
 * Days after today are left out so a current-month slip does not count future classes.
 */
async function periodAttendance(staffId, month, year) {
  const session = await sessionForMonth(month, year);
  if (!session?._id) return null;

  const data = await staffPeriodAttendanceService.listMonth({
    sessionId: String(session._id),
    month,
    year,
    userId: String(staffId),
  });
  const teacher = (data.teachers || []).find((t) => t.userId === String(staffId));
  const today = todayYmd();
  const periods = (teacher?.periods || []).filter((p) => !p.day || p.day <= today);

  const summary = emptyCounts();
  const byClass = new Map();
  const daysWithClasses = new Set();
  const daysAbsent = new Map();

  for (const p of periods) {
    const status = p.status;
    summary.totalClasses += 1;
    if (summary[status] != null) summary[status] += 1;
    daysWithClasses.add(p.day);

    const entries = p.classes?.length
      ? p.classes
      : [{ className: p.classLabel, sectionName: p.sectionLabel, subjectName: p.subjectLabel }];
    for (const c of entries) {
      const key = classKey(c.className, c.sectionName, c.subjectName);
      let row = byClass.get(key);
      if (!row) {
        row = {
          className: c.className || (p.attendanceType === 'daily' ? 'Full day' : ''),
          sectionName: c.sectionName || '',
          subjectName: c.subjectName || '',
          ...emptyCounts(),
        };
        byClass.set(key, row);
      }
      row.totalClasses += 1;
      if (row[status] != null) row[status] += 1;
    }

    if (status === 'absent' || status === 'leave') {
      const list = daysAbsent.get(p.day) || [];
      list.push({ status, label: p.label || '', classLabel: p.classLabel || '' });
      daysAbsent.set(p.day, list);
    }
  }

  return {
    sessionName: data.sessionName || session.name || '',
    attendanceType: teacher?.attendanceType || 'class',
    workingDaysCount: daysWithClasses.size,
    summary: { ...summary, attendancePercent: percentOf(summary) },
    byClass: [...byClass.values()].map((row) => ({ ...row, attendancePercent: percentOf(row) })),
    exceptions: [...daysAbsent.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, items]) => ({ day, items })),
  };
}

/** Daily check-in marks (AI camera / manual) for the month. */
async function dailyAttendance(staffId, month, year) {
  const rows = await staffAttendanceService.listForUser(staffId, { month, year });
  const counts = { present: 0, late: 0, absent: 0, half_day: 0, leave: 0 };
  rows.forEach((r) => {
    if (counts[r.status] != null) counts[r.status] += 1;
  });
  return { totalDays: rows.length, ...counts };
}

async function buildSalaryAttendance(staffId, month, year) {
  const result = {
    period: `${year}-${pad2(month)}`,
    classes: null,
    daily: null,
  };
  try {
    result.classes = await periodAttendance(staffId, month, year);
  } catch (err) {
    console.error('[salary] Could not load period attendance:', err?.message || err);
  }
  try {
    result.daily = await dailyAttendance(staffId, month, year);
  } catch (err) {
    console.error('[salary] Could not load daily attendance:', err?.message || err);
  }
  return result;
}

/**
 * Split a fixed salary across the teacher's classes.
 * Weight = class periods scheduled this month (from attendance); equal split when none.
 * Rounding remainder goes on the last line so the lines add up to the voucher amount.
 */
async function buildFixedClassAllocation(staffId, amount, attendance) {
  const total = Number(amount) || 0;
  const combos = await loadTeacherTeachingCombos(staffId);
  const lines = [];

  for (const c of combos) {
    const subj = c.subject;
    if (!subj || !subj.subjectName || subj.status === 'inactive') continue;
    const sectionId = c.section?._id || c.section;
    const students = sectionId
      ? sortStudentsByRollAsc(
          await AcademyStudent.find({
            sectionId,
            status: 'active',
            selectedSubjects: subj._id,
          })
            .select('studentName rollNumber studentId registrationNumber')
            .lean()
        )
      : [];
    lines.push({
      subjectId: subj._id,
      subjectName: subj.subjectName,
      className: c.class?.className || '',
      sectionName: c.section?.sectionName || '',
      studentCount: students.length,
      periods: 0,
      students: students.map((st) => ({
        studentId: st._id,
        studentName: st.studentName || '—',
        rollNumber: st.rollNumber || st.studentId || st.registrationNumber || '',
      })),
    });
  }
  if (!lines.length) return { basis: 'none', lines: [] };

  const periodsByKey = new Map(
    (attendance?.classes?.byClass || []).map((r) => [
      classKey(r.className, r.sectionName, r.subjectName),
      r.totalClasses,
    ])
  );
  lines.forEach((l) => {
    l.periods = periodsByKey.get(classKey(l.className, l.sectionName, l.subjectName)) || 0;
  });
  const totalPeriods = lines.reduce((s, l) => s + l.periods, 0);
  const basis = totalPeriods > 0 ? 'periods' : 'equal';

  let allocated = 0;
  lines.forEach((l, idx) => {
    const share = basis === 'periods' ? l.periods / totalPeriods : 1 / lines.length;
    l.sharePercent = Math.round(share * 10000) / 100;
    l.salary =
      idx === lines.length - 1 ? roundMoney(total - allocated) : roundMoney(total * share);
    allocated = roundMoney(allocated + l.salary);
  });

  return { basis, lines };
}

module.exports = { buildSalaryAttendance, buildFixedClassAllocation };
