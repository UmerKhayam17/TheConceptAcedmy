/**
 * Section Dashboard — management overview of every section in a session.
 * Data comes from Student Management (AcademyClass → AcademySection), not a separate timetable DB.
 */

const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const TeacherAssignment = require('../../models/timetable/TeacherAssignment');
const TimetableVersion = require('../../models/timetable/TimetableVersion');
const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const PeriodTemplate = require('../../models/timetable/PeriodTemplate');
const Session = require('../../models/Session');
const ApiError = require('../../utils/ApiError');
const {
  sortClassesByLevel,
  sortSectionsByName,
  formatClassLevelLabel,
  academicProgram,
  academicProgramLabel,
} = require('../../utils/classLevelSort');
const { WEEKDAYS } = require('../../models/timetable/constants');

async function resolvePeriodTemplate(sessionId) {
  const settingsTpl = await PeriodTemplate.findOne({ session: sessionId, isDefault: true, isActive: true });
  if (settingsTpl) return settingsTpl;
  return PeriodTemplate.findOne({ session: sessionId, isActive: true }).sort({ createdAt: 1 });
}

/**
 * @param {{ sessionId: string, classId?: string, program?: 'school'|'college'|'other'|'all' }} opts
 */
async function getSectionDashboard({ sessionId, classId, program = 'all' }) {
  if (!sessionId) throw new ApiError(400, 'sessionId is required');

  const session = await Session.findById(sessionId).select('name workingDays');
  if (!session) throw new ApiError(404, 'Session not found');

  const classQuery = { sessionId, status: { $ne: 'inactive' } };
  if (classId) classQuery._id = classId;
  const classes = sortClassesByLevel(await AcademyClass.find(classQuery).select('className'));

  const template = await resolvePeriodTemplate(sessionId);
  const lectureCount = (template?.slots || []).filter((s) => s.type === 'lecture').length;
  const workingDays = (session.workingDays || []).length
    ? WEEKDAYS.filter((d) => session.workingDays.includes(d))
    : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const capacityPerWeek = lectureCount * workingDays.length;

  const rows = [];
  const programBuckets = {
    school: { key: 'school', label: academicProgramLabel('school'), classes: 0, sections: 0 },
    college: { key: 'college', label: academicProgramLabel('college'), classes: 0, sections: 0 },
    other: { key: 'other', label: academicProgramLabel('other'), classes: 0, sections: 0 },
  };
  const classesSeenInProgram = { school: new Set(), college: new Set(), other: new Set() };

  for (const klass of classes) {
    const className = klass.className || klass.name || '';
    const classLabel = formatClassLevelLabel(className) || className;
    const prog = academicProgram(className);
    if (program && program !== 'all' && prog !== program) continue;

    // eslint-disable-next-line no-await-in-loop
    const sections = sortSectionsByName(
      await AcademySection.find({ classId: klass._id, status: { $ne: 'inactive' } }).select(
        'sectionName classId'
      )
    );

    // eslint-disable-next-line no-await-in-loop
    const subjectCount = await AcademySubject.countDocuments({
      classId: klass._id,
      status: { $ne: 'inactive' },
    });

    for (const section of sections) {
      const sid = section._id;
      // eslint-disable-next-line no-await-in-loop
      const [studentCount, assignments, draft, published] = await Promise.all([
        AcademyStudent.countDocuments({ sectionId: sid, status: { $ne: 'inactive' } }),
        TeacherAssignment.find({
          session: sessionId,
          section: sid,
          isActive: { $ne: false },
        }).select('teacher subject'),
        TimetableVersion.findOne({ session: sessionId, section: sid, status: 'draft' }).select(
          '_id version generationMeta'
        ),
        TimetableVersion.findOne({ session: sessionId, section: sid, status: 'published' }).select(
          '_id version'
        ),
      ]);

      const teacherIds = new Set(assignments.map((a) => String(a.teacher)));
      const subjectAssigned = new Set(assignments.map((a) => String(a.subject)));

      const activeVersion = draft || published || null;
      let weeklyLessons = 0;
      const dayFill = {};
      for (const d of workingDays) dayFill[d] = 0;

      if (activeVersion) {
        // eslint-disable-next-line no-await-in-loop
        const slots = await ScheduleSlot.find({
          timetableVersion: activeVersion._id,
          cancelled: { $ne: true },
        }).select('day');
        weeklyLessons = slots.length;
        for (const s of slots) {
          if (dayFill[s.day] != null) dayFill[s.day] += 1;
        }
      }

      let timetableStatus = 'none';
      if (draft && published) timetableStatus = 'draft';
      else if (draft) timetableStatus = 'draft';
      else if (published) timetableStatus = 'published';

      const readiness = [];
      if (!subjectCount) readiness.push('No subjects on class');
      if (!assignments.length) readiness.push('No teacher assignments');
      if (!sections.length) readiness.push('No sections');

      rows.push({
        program: prog,
        programLabel: academicProgramLabel(prog),
        class: { _id: klass._id, name: className, label: classLabel },
        section: {
          _id: section._id,
          name: section.sectionName || section.name,
          label: `${classLabel}-${section.sectionName || section.name}`,
        },
        students: studentCount,
        teachersAssigned: teacherIds.size,
        subjectsOnClass: subjectCount,
        subjectsAssigned: subjectAssigned.size,
        weeklyLessons,
        capacityPerWeek,
        dayFill,
        lecturePeriodsPerDay: lectureCount,
        timetableStatus,
        version: activeVersion
          ? {
              _id: activeVersion._id,
              status: draft ? 'draft' : 'published',
              version: activeVersion.version,
              generationMeta: draft?.generationMeta || null,
            }
          : null,
        readiness,
        readyForGenerate: subjectCount > 0 && assignments.length > 0,
      });

      classesSeenInProgram[prog].add(String(klass._id));
      programBuckets[prog].sections += 1;
    }

    if (sections.length) {
      // counted via Set above
    } else if (!program || program === 'all' || academicProgram(className) === program) {
      // Class with zero sections — still surface for visibility
      const prog = academicProgram(className);
      rows.push({
        program: prog,
        programLabel: academicProgramLabel(prog),
        class: { _id: klass._id, name: className, label: classLabel },
        section: null,
        students: 0,
        teachersAssigned: 0,
        subjectsOnClass: subjectCount,
        subjectsAssigned: 0,
        weeklyLessons: 0,
        capacityPerWeek,
        dayFill: Object.fromEntries(workingDays.map((d) => [d, 0])),
        lecturePeriodsPerDay: lectureCount,
        timetableStatus: 'none',
        version: null,
        readiness: ['No sections — create sections in Student Management'],
        readyForGenerate: false,
      });
      classesSeenInProgram[prog].add(String(klass._id));
    }
  }

  for (const key of Object.keys(programBuckets)) {
    programBuckets[key].classes = classesSeenInProgram[key].size;
  }

  return {
    session: { _id: session._id, name: session.name, workingDays },
    periodsPerDay: lectureCount,
    capacityPerWeek,
    programs: Object.values(programBuckets).filter((p) => p.classes > 0 || p.sections > 0),
    sections: rows,
    summary: {
      classes: classes.length,
      sections: rows.filter((r) => r.section).length,
      readyForGenerate: rows.filter((r) => r.readyForGenerate).length,
      withDraft: rows.filter((r) => r.timetableStatus === 'draft').length,
      withPublished: rows.filter((r) => r.timetableStatus === 'published').length,
      missingAssignments: rows.filter((r) => r.section && !r.teachersAssigned).length,
    },
  };
}

module.exports = { getSectionDashboard };
