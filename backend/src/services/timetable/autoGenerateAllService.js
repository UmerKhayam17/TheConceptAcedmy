/**
 * Auto Generate All Timetables — greedy constraint scheduler.
 * Creates/fills draft TimetableVersions from TeacherAssignments (+ optional SubjectRequirements).
 * Class Board remains a read-only projection of ScheduleSlots.
 */

const mongoose = require('mongoose');
const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const TimetableVersion = require('../../models/timetable/TimetableVersion');
const PeriodTemplate = require('../../models/timetable/PeriodTemplate');
const TimetableSettings = require('../../models/timetable/TimetableSettings');
const TeacherAssignment = require('../../models/timetable/TeacherAssignment');
const TeacherProfile = require('../../models/timetable/TeacherProfile');
const SubjectRequirement = require('../../models/timetable/SubjectRequirement');
const Room = require('../../models/timetable/Room');
const Session = require('../../models/Session');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const AcademySubject = require('../../models/academy/AcademySubject');
const ApiError = require('../../utils/ApiError');
const { WEEKDAYS } = require('../../models/timetable/constants');
const { assertSessionWritable } = require('../session/sessionGuard');
const { createVersion } = require('./timetableVersionService');
const {
  sortClassesByLevel,
  sortSectionsByName,
  formatClassLevelLabel,
  academicProgram,
  academicProgramLabel,
} = require('../../utils/classLevelSort');

const ENGINE = 'greedy-v1';

function dayOrder(workingDays) {
  return WEEKDAYS.filter((d) => workingDays.includes(d));
}

function busyKey(day, periodId) {
  return `${day}|${periodId}`;
}

async function resolvePeriodTemplate(sessionId) {
  const settings = await TimetableSettings.findOne({ session: sessionId });
  if (settings?.defaultPeriodTemplate) {
    const tpl = await PeriodTemplate.findById(settings.defaultPeriodTemplate);
    if (tpl) return { template: tpl, settings };
  }
  const template = await PeriodTemplate.findOne({ session: sessionId, isDefault: true, isActive: true })
    || await PeriodTemplate.findOne({ session: sessionId, isActive: true }).sort({ createdAt: 1 });
  return { template, settings: settings || null };
}

/** Always use/create a draft — never write auto slots onto published. */
async function ensureDraftVersion({ sessionId, classId, sectionId, periodTemplateId, userId }) {
  const existingDraft = await TimetableVersion.findOne({
    session: sessionId,
    section: sectionId,
    status: 'draft',
  });
  if (existingDraft) return existingDraft;

  if (!periodTemplateId) {
    throw new ApiError(400, 'Create an academy time configuration before generating timetables');
  }
  return createVersion(
    {
      session: sessionId,
      class: classId,
      section: sectionId,
      periodTemplate: periodTemplateId,
      notes: 'Auto-generated draft',
    },
    userId
  );
}

/**
 * Build placement jobs from assignments + quotas.
 * Choice subjects with the same choiceGroupName become one parallel job.
 * Same teacher+subject across sections of a class → optional shared job.
 */
function buildJobs({
  sections,
  subjectsByClass,
  assignments,
  requirements,
  defaultWeeklyPeriods,
  allowSharedLessons,
  applyParallel,
}) {
  const reqMap = new Map();
  for (const r of requirements) {
    reqMap.set(`${r.section}|${r.subject}`, r.weeklyPeriods);
  }

  const assignBySection = new Map();
  for (const a of assignments) {
    const sid = String(a.section);
    if (!assignBySection.has(sid)) assignBySection.set(sid, []);
    assignBySection.get(sid).push(a);
  }

  /** Per-section atomic jobs before shared merging */
  const sectionJobs = [];

  for (const section of sections) {
    const sid = String(section._id);
    const classId = String(section.classId);
    const subjects = subjectsByClass.get(classId) || [];
    const sectionAssign = assignBySection.get(sid) || [];
    const teacherBySubject = new Map();
    for (const a of sectionAssign) {
      const subj = String(a.subject);
      if (!teacherBySubject.has(subj) || a.isPrimary) {
        teacherBySubject.set(subj, String(a.teacher));
      }
    }

    const usedSubjects = new Set();
    const byChoiceGroup = new Map();

    for (const subj of subjects) {
      const id = String(subj._id);
      if (!teacherBySubject.has(id)) continue;

      if (applyParallel && subj.enrollmentType === 'choice' && subj.choiceGroupName?.trim()) {
        const g = subj.choiceGroupName.trim().toLowerCase();
        if (!byChoiceGroup.has(g)) byChoiceGroup.set(g, []);
        byChoiceGroup.get(g).push(subj);
      } else {
        const weekly = reqMap.get(`${sid}|${id}`) || defaultWeeklyPeriods;
        sectionJobs.push({
          kind: 'single',
          classId,
          sectionIds: [sid],
          entries: [{ subject: id, teacher: teacherBySubject.get(id) }],
          weeklyPeriods: weekly,
          label: subj.subjectName || subj.name || id,
        });
        usedSubjects.add(id);
      }
    }

    for (const [, group] of byChoiceGroup) {
      const withTeacher = group.filter((s) => teacherBySubject.has(String(s._id)));
      if (withTeacher.length < 2) {
        for (const s of withTeacher) {
          const id = String(s._id);
          if (usedSubjects.has(id)) continue;
          const weekly = reqMap.get(`${sid}|${id}`) || defaultWeeklyPeriods;
          sectionJobs.push({
            kind: 'single',
            classId,
            sectionIds: [sid],
            entries: [{ subject: id, teacher: teacherBySubject.get(id) }],
            weeklyPeriods: weekly,
            label: s.subjectName || s.name || id,
          });
          usedSubjects.add(id);
        }
        continue;
      }
      const entries = withTeacher.map((s) => ({
        subject: String(s._id),
        teacher: teacherBySubject.get(String(s._id)),
      }));
      // Different teachers required for parallel
      const teacherSet = new Set(entries.map((e) => e.teacher));
      if (teacherSet.size !== entries.length) {
        // Fall back to singles if same teacher on parallel subjects
        for (const s of withTeacher) {
          const id = String(s._id);
          const weekly = reqMap.get(`${sid}|${id}`) || Math.max(1, Math.floor(defaultWeeklyPeriods / 2));
          sectionJobs.push({
            kind: 'single',
            classId,
            sectionIds: [sid],
            entries: [{ subject: id, teacher: teacherBySubject.get(id) }],
            weeklyPeriods: weekly,
            label: s.subjectName || s.name || id,
          });
          usedSubjects.add(id);
        }
        continue;
      }
      const weekly = Math.max(
        ...withTeacher.map((s) => reqMap.get(`${sid}|${String(s._id)}`) || defaultWeeklyPeriods)
      );
      sectionJobs.push({
        kind: 'parallel',
        classId,
        sectionIds: [sid],
        entries,
        weeklyPeriods: weekly,
        label: withTeacher.map((s) => s.subjectName || s.name).join(' / '),
      });
      withTeacher.forEach((s) => usedSubjects.add(String(s._id)));
    }
  }

  if (!allowSharedLessons) return sectionJobs;

  // Merge identical single jobs across sections of the same class into shared jobs
  const sharedBuckets = new Map();
  const keep = [];

  for (const job of sectionJobs) {
    if (job.kind !== 'single' || job.entries.length !== 1) {
      keep.push(job);
      continue;
    }
    const e = job.entries[0];
    const key = `${job.classId}|${e.subject}|${e.teacher}|${job.weeklyPeriods}`;
    if (!sharedBuckets.has(key)) {
      sharedBuckets.set(key, {
        kind: 'shared',
        classId: job.classId,
        sectionIds: [...job.sectionIds],
        entries: job.entries,
        weeklyPeriods: job.weeklyPeriods,
        label: job.label,
      });
    } else {
      const bucket = sharedBuckets.get(key);
      for (const sid of job.sectionIds) {
        if (!bucket.sectionIds.includes(sid)) bucket.sectionIds.push(sid);
      }
    }
  }

  for (const bucket of sharedBuckets.values()) {
    if (bucket.sectionIds.length > 1) {
      keep.push(bucket);
    } else {
      keep.push({
        kind: 'single',
        classId: bucket.classId,
        sectionIds: bucket.sectionIds,
        entries: bucket.entries,
        weeklyPeriods: bucket.weeklyPeriods,
        label: bucket.label,
      });
    }
  }

  return keep;
}

function periodIndex(periods, periodId) {
  return periods.findIndex((p) => String(p._id) === String(periodId));
}

/**
 * In-memory occupancy for fast conflict checks during generation.
 */
function createOccupancy() {
  return {
    teacher: new Map(), // teacherId -> Set(day|period)
    section: new Map(), // sectionId -> Set(day|period)
    room: new Map(), // roomId -> Set(day|period)
    teacherDayCount: new Map(), // teacherId|day -> number
    teacherWeekCount: new Map(), // teacherId -> number of distinct periods
    sectionSubjectDay: new Map(), // sectionId|subjectId|day -> [periodIndexes]
  };
}

function markBusy(occ, { teachers, sectionIds, roomId, day, periodId, subjectIds, periodIdx }) {
  const key = busyKey(day, periodId);
  for (const t of teachers) {
    if (!occ.teacher.has(t)) occ.teacher.set(t, new Set());
    const periods = occ.teacher.get(t);
    if (periods.has(key)) continue;
    periods.add(key);
    const dk = `${t}|${day}`;
    occ.teacherDayCount.set(dk, (occ.teacherDayCount.get(dk) || 0) + 1);
    occ.teacherWeekCount.set(t, (occ.teacherWeekCount.get(t) || 0) + 1);
  }
  for (const sid of sectionIds) {
    if (!occ.section.has(sid)) occ.section.set(sid, new Set());
    occ.section.get(sid).add(key);
    for (const subj of subjectIds) {
      const sk = `${sid}|${subj}|${day}`;
      if (!occ.sectionSubjectDay.has(sk)) occ.sectionSubjectDay.set(sk, []);
      occ.sectionSubjectDay.get(sk).push(periodIdx);
    }
  }
  if (roomId) {
    if (!occ.room.has(roomId)) occ.room.set(roomId, new Set());
    occ.room.get(roomId).add(key);
  }
}

function subjectCountOnDay(occ, sectionIds, subjectIds, day) {
  let n = 0;
  for (const sid of sectionIds) {
    for (const subj of subjectIds) {
      n += (occ.sectionSubjectDay.get(`${sid}|${subj}|${day}`) || []).length;
    }
  }
  return n;
}

function canPlace(occ, opts) {
  const {
    teachers,
    sectionIds,
    roomId,
    day,
    periodId,
    subjectIds,
    periodIdx,
    maxTeacherPerDay,
    maxTeacherPerWeek = 999,
    maxConsecutive,
    preventTeacherConflicts,
    preventRoomConflicts,
    /** Prefer at most one lesson of the same subject per section per day */
    maxSameSubjectPerDay = 1,
  } = opts;
  const key = busyKey(day, periodId);

  for (const sid of sectionIds) {
    if (occ.section.get(sid)?.has(key)) return false;
  }

  if (maxSameSubjectPerDay > 0) {
    if (subjectCountOnDay(occ, sectionIds, subjectIds, day) >= maxSameSubjectPerDay) {
      return false;
    }
  }

  if (preventTeacherConflicts) {
    for (const t of teachers) {
      if (occ.teacher.get(t)?.has(key)) return false;
      const dayCount = occ.teacherDayCount.get(`${t}|${day}`) || 0;
      if (dayCount >= maxTeacherPerDay) return false;
      const weekCount = occ.teacherWeekCount.get(t) || 0;
      if (weekCount >= maxTeacherPerWeek) return false;
    }
  }

  if (preventRoomConflicts && roomId && occ.room.get(roomId)?.has(key)) {
    return false;
  }

  if (maxConsecutive > 0) {
    for (const sid of sectionIds) {
      for (const subj of subjectIds) {
        const placed = occ.sectionSubjectDay.get(`${sid}|${subj}|${day}`) || [];
        const all = [...placed, periodIdx].sort((a, b) => a - b);
        let run = 1;
        let best = 1;
        for (let i = 1; i < all.length; i += 1) {
          if (all[i] === all[i - 1] + 1) {
            run += 1;
            best = Math.max(best, run);
          } else run = 1;
        }
        if (best > maxConsecutive) return false;
      }
    }
  }

  return true;
}

function shuffleList(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * If section B/C have no teacher assignments but section A of the same class does,
 * clone A's assignments so Auto Generate can fill every section.
 */
async function propagateAssignmentsToSiblingSections({ sessionId, sections, assignments, userId }) {
  const byClass = new Map();
  for (const s of sections) {
    const cid = String(s.classId);
    if (!byClass.has(cid)) byClass.set(cid, []);
    byClass.get(cid).push(s);
  }

  const assignBySection = new Map();
  for (const a of assignments) {
    const sid = String(a.section);
    if (!assignBySection.has(sid)) assignBySection.set(sid, []);
    assignBySection.get(sid).push(a);
  }

  const created = [];
  for (const [, classSections] of byClass) {
    const donor = classSections.find((s) => (assignBySection.get(String(s._id)) || []).length > 0);
    if (!donor) continue;
    const donorRows = assignBySection.get(String(donor._id)) || [];

    for (const target of classSections) {
      if (String(target._id) === String(donor._id)) continue;
      if ((assignBySection.get(String(target._id)) || []).length > 0) continue;

      for (const row of donorRows) {
        // eslint-disable-next-line no-await-in-loop
        const doc = await TeacherAssignment.findOneAndUpdate(
          {
            session: sessionId,
            section: target._id,
            subject: row.subject,
            teacher: row.teacher,
          },
          {
            $setOnInsert: {
              session: sessionId,
              class: row.class || target.classId,
              section: target._id,
              subject: row.subject,
              teacher: row.teacher,
              isPrimary: row.isPrimary !== false,
              priority: row.priority || 1,
              isActive: true,
              createdBy: userId,
            },
          },
          { upsert: true, new: true }
        );
        created.push(doc);
      }
    }
  }
  return created;
}

function pickRoom(rooms, classId, autoAssignRooms) {
  if (!autoAssignRooms || !rooms.length) return null;
  const home = rooms.find((r) => r.assignedClass && String(r.assignedClass) === String(classId));
  if (home) return String(home._id);
  const classroom = rooms.find((r) => r.type === 'classroom');
  return classroom ? String(classroom._id) : String(rooms[0]._id);
}

function roomIsFree(occ, roomId, day, periodId) {
  if (!roomId) return false;
  return !occ.room.get(String(roomId))?.has(busyKey(day, periodId));
}

/** Preferred rooms on the teacher profile, then the class room, then any classroom. */
function pickRoomForPlacement(rooms, classId, autoAssignRooms, teachers, profileByTeacher, occ, day, periodId) {
  if (!autoAssignRooms || !rooms.length) return null;
  const known = new Set(rooms.map((room) => String(room._id)));
  const candidates = [];
  for (const teacherId of teachers) {
    const prefs = profileByTeacher.get(String(teacherId))?.preferredRooms || [];
    for (const pref of prefs) {
      const id = String(pref?._id || pref);
      if (known.has(id)) candidates.push(id);
    }
  }
  const fallback = pickRoom(rooms, classId, true);
  if (fallback) candidates.push(String(fallback));
  const unique = [...new Set(candidates)];
  return unique.find((id) => roomIsFree(occ, id, day, periodId)) || unique[0] || null;
}

function seedOccupancyFromSlots(occ, slots, periods) {
  for (const slot of slots) {
    const teachers = [String(slot.teacher)];
    for (const pe of slot.parallelEntries || []) {
      if (pe.teacher) teachers.push(String(pe.teacher));
    }
    const subjectIds = [String(slot.subject)];
    for (const pe of slot.parallelEntries || []) {
      if (pe.subject) subjectIds.push(String(pe.subject));
    }
    const periodIdx = periodIndex(periods, slot.periodId);
    markBusy(occ, {
      teachers,
      sectionIds: [String(slot.section)],
      roomId: slot.room ? String(slot.room) : null,
      day: slot.day,
      periodId: String(slot.periodId),
      subjectIds,
      periodIdx,
    });
  }
}

/**
 * @param {object} body
 * @param {string} body.sessionId
 * @param {string[]} [body.classIds] empty / omit = all classes
 * @param {number} [body.defaultWeeklyPeriods=4]
 * @param {boolean} [body.balanceSubjects=true]
 * @param {boolean} [body.preventTeacherConflicts=true]
 * @param {boolean} [body.preventRoomConflicts=true]
 * @param {boolean} [body.applyParallel=true]
 * @param {boolean} [body.allowSharedLessons=false] only combine when same teacher intentionally shared
 * @param {boolean} [body.replaceUnlocked=true] clear unlocked draft slots before generate
 * @param {boolean} [body.propagateAssignments=true] copy teacher assignments to sibling sections missing them
 * @param {string} userId
 */
async function autoGenerateAll(body, userId) {
  const {
    sessionId,
    classIds,
    defaultWeeklyPeriods = 4,
    balanceSubjects = true,
    preventTeacherConflicts = true,
    preventRoomConflicts = true,
    applyParallel = true,
    allowSharedLessons = false,
    replaceUnlocked = true,
    propagateAssignments = true,
  } = body;

  if (!sessionId) throw new ApiError(400, 'sessionId is required');
  await assertSessionWritable(sessionId);

  const session = await Session.findById(sessionId).select('name workingDays');
  if (!session) throw new ApiError(404, 'Session not found');

  const { template, settings } = await resolvePeriodTemplate(sessionId);
  if (!template) throw new ApiError(400, 'Create an academy time configuration (periods) first');

  const lecturePeriods = (template.slots || []).filter((s) => s.type === 'lecture');
  if (!lecturePeriods.length) {
    throw new ApiError(400, 'Period template has no lecture periods');
  }

  const workingDays = dayOrder(
    (session.workingDays || []).length ? session.workingDays : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  );

  const classQuery = { sessionId, status: { $ne: 'inactive' } };
  if (Array.isArray(classIds) && classIds.length) {
    classQuery._id = { $in: classIds };
  }
  const classes = sortClassesByLevel(await AcademyClass.find(classQuery).select('className'));
  if (!classes.length) throw new ApiError(404, 'No classes found for this session');

  const classIdList = classes.map((c) => c._id);
  const sectionsRaw = await AcademySection.find({
    classId: { $in: classIdList },
    status: { $ne: 'inactive' },
  }).select('sectionName classId');
  const sections = sortSectionsByName(sectionsRaw);
  if (!sections.length) throw new ApiError(400, 'No sections found — create sections before generating');

  const subjects = await AcademySubject.find({
    classId: { $in: classIdList },
    status: { $ne: 'inactive' },
  }).select('subjectName subjectCode enrollmentType choiceGroupName classId');

  const subjectsByClass = new Map();
  for (const s of subjects) {
    const cid = String(s.classId);
    if (!subjectsByClass.has(cid)) subjectsByClass.set(cid, []);
    subjectsByClass.get(cid).push(s);
  }

  const sectionIds = sections.map((s) => s._id);
  let assignments = await TeacherAssignment.find({
    session: sessionId,
    section: { $in: sectionIds },
    isActive: { $ne: false },
  }).select('section subject teacher class isPrimary priority');

  let propagatedCount = 0;
  if (propagateAssignments) {
    const created = await propagateAssignmentsToSiblingSections({
      sessionId,
      sections,
      assignments,
      userId,
    });
    propagatedCount = created.length;
    if (propagatedCount) {
      assignments = await TeacherAssignment.find({
        session: sessionId,
        section: { $in: sectionIds },
        isActive: { $ne: false },
      }).select('section subject teacher class isPrimary priority');
    }
  }

  if (!assignments.length) {
    throw new ApiError(
      400,
      'No teacher assignments found. Assign teachers to subjects (System Config → Teacher Assignments) before auto-generating.'
    );
  }

  const requirements = await SubjectRequirement.find({
    session: sessionId,
    section: { $in: sectionIds },
    isActive: { $ne: false },
  }).select('section subject weeklyPeriods');

  const profiles = await TeacherProfile.find({
    session: sessionId,
    isActive: { $ne: false },
  }).select('user maxLecturesPerDay maxLecturesPerWeek availability preferredRooms');

  const profileByTeacher = new Map();
  for (const p of profiles) {
    profileByTeacher.set(String(p.user), p);
  }

  const rooms = await Room.find({ session: sessionId, isActive: { $ne: false } }).select(
    'name code type assignedClass'
  );

  const maxTeacherPerDayDefault = settings?.defaultMaxTeacherPerDay || 6;
  const maxConsecutive = settings?.defaultMaxConsecutive || 2;
  const autoAssignRooms = settings?.autoAssignRooms !== false && preventRoomConflicts;

  // Diagnose sections that cannot participate (why 1st Year / 2nd Year may be missing)
  const assignBySection = new Map();
  for (const a of assignments) {
    const sid = String(a.section);
    if (!assignBySection.has(sid)) assignBySection.set(sid, []);
    assignBySection.get(sid).push(a);
  }
  const skipped = [];
  const classMeta = new Map();
  for (const klass of classes) {
    const cname = klass.className || klass.name || '';
    classMeta.set(String(klass._id), {
      className: cname,
      label: formatClassLevelLabel(cname) || cname,
      program: academicProgram(cname),
      programLabel: academicProgramLabel(academicProgram(cname)),
    });
  }
  for (const section of sections) {
    const sid = String(section._id);
    const classId = String(section.classId);
    const meta = classMeta.get(classId) || { label: classId, program: 'other' };
    const sectionLabel = `${meta.label}-${section.sectionName || section.name}`;
    const subjects = subjectsByClass.get(classId) || [];
    const sectionAssign = assignBySection.get(sid) || [];
    const reasons = [];
    if (!subjects.length) reasons.push('No subjects on this class');
    if (!sectionAssign.length) reasons.push('No teacher assignments for this section');
    else {
      const assignedSubjectIds = new Set(sectionAssign.map((a) => String(a.subject)));
      const unmatched = subjects.filter((s) => !assignedSubjectIds.has(String(s._id)));
      if (unmatched.length === subjects.length) {
        reasons.push('Teacher assignments do not match any class subjects');
      }
    }
    if (reasons.length) {
      skipped.push({
        classId,
        className: meta.className || meta.label,
        classLabel: meta.label,
        program: meta.program,
        programLabel: meta.programLabel,
        sectionId: sid,
        sectionName: section.sectionName || section.name,
        sectionLabel,
        reasons,
      });
    }
  }
  // Classes with zero sections
  for (const klass of classes) {
    const cid = String(klass._id);
    const hasSection = sections.some((s) => String(s.classId) === cid);
    if (!hasSection) {
      const meta = classMeta.get(cid);
      skipped.push({
        classId: cid,
        className: meta.className,
        classLabel: meta.label,
        program: meta.program,
        programLabel: meta.programLabel,
        sectionId: null,
        sectionName: null,
        sectionLabel: meta.label,
        reasons: ['No sections — create sections in Student Management'],
      });
    }
  }

  const jobs = buildJobs({
    sections,
    subjectsByClass,
    assignments,
    requirements,
    defaultWeeklyPeriods: Math.max(1, Number(defaultWeeklyPeriods) || 4),
    allowSharedLessons,
    applyParallel,
  });

  if (!jobs.length) {
    const hint =
      skipped.length > 0
        ? ` Skipped ${skipped.length} section(s)/class(es): ${skipped
            .slice(0, 3)
            .map((s) => `${s.sectionLabel} (${s.reasons[0]})`)
            .join('; ')}`
        : '';
    throw new ApiError(
      400,
      `Nothing to schedule. Ensure subjects exist and teachers are assigned to every section (including 1st Year / 2nd Year).${hint}`
    );
  }

  // Harder jobs first (shared, then parallel, then high weekly count)
  jobs.sort((a, b) => {
    const w = (j) =>
      (j.kind === 'shared' ? 1000 : 0) +
      (j.kind === 'parallel' ? 100 : 0) +
      j.weeklyPeriods * 10 +
      j.sectionIds.length;
    return w(b) - w(a);
  });

  // Ensure drafts + optionally clear unlocked slots
  const versionBySection = new Map();
  const jobId = new mongoose.Types.ObjectId().toString();

  for (const section of sections) {
    // eslint-disable-next-line no-await-in-loop
    const version = await ensureDraftVersion({
      sessionId,
      classId: section.classId,
      sectionId: section._id,
      periodTemplateId: template._id,
      userId,
    });
    versionBySection.set(String(section._id), version);

    if (replaceUnlocked) {
      // eslint-disable-next-line no-await-in-loop
      await ScheduleSlot.deleteMany({
        timetableVersion: version._id,
        locked: { $ne: true },
      });
    }
  }

  // Seed occupancy from remaining locked / kept slots
  const occ = createOccupancy();
  const keptSlots = await ScheduleSlot.find({
    timetableVersion: { $in: [...versionBySection.values()].map((v) => v._id) },
    cancelled: { $ne: true },
  }).select('day periodId teacher subject parallelEntries section room combinedGroupId');

  // Shared locked groups: mark all teachers busy once
  seedOccupancyFromSlots(occ, keptSlots, lecturePeriods);

  const placedSlots = [];
  const unplaced = [];
  let sharedLessonCount = 0;
  let parallelLessonCount = 0;
  const byClass = new Map();

  for (const klass of classes) {
    const cid = String(klass._id);
    const meta = classMeta.get(cid);
    byClass.set(cid, {
      classId: cid,
      className: meta?.className || klass.className || klass.name,
      classLabel: meta?.label || klass.className || klass.name,
      program: meta?.program || 'other',
      programLabel: meta?.programLabel || academicProgramLabel('other'),
      placed: 0,
      unplaced: 0,
      shared: 0,
      parallel: 0,
    });
  }

  /**
   * Day-centric schedule: each weekday gets a fresh shuffled subject→period map.
   * Avoids Mon=Tue=Wed identical grids (subject-first packing reused the same periods).
   */
  const jobState = jobs.map((job) => {
    const effectiveWeekly = balanceSubjects
      ? Math.min(job.weeklyPeriods, workingDays.length)
      : job.weeklyPeriods;
    return {
      ...job,
      remaining: effectiveWeekly,
      targetWeekly: effectiveWeekly,
      teachers: job.entries.map((e) => e.teacher),
      subjectIds: job.entries.map((e) => e.subject),
      primary: job.entries[0],
      parallelEntries: job.entries.slice(1).map((e) => ({
        subject: e.subject,
        teacher: e.teacher,
      })),
      isShared: job.kind === 'shared' && job.sectionIds.length > 1,
      combinedGroupId:
        job.kind === 'shared' && job.sectionIds.length > 1
          ? new mongoose.Types.ObjectId()
          : null,
      roomId: pickRoom(rooms, job.classId, autoAssignRooms),
      usedPeriodIdx: new Set(),
    };
  });

  const teacherLimits = (teachers) => {
    const days = teachers.map((t) => profileByTeacher.get(String(t))?.maxLecturesPerDay || maxTeacherPerDayDefault);
    const weeks = teachers
      .map((t) => profileByTeacher.get(String(t))?.maxLecturesPerWeek)
      .filter((n) => Number(n) > 0);
    return {
      maxTeacherPerDay: days.length ? Math.min(...days) : maxTeacherPerDayDefault,
      maxTeacherPerWeek: weeks.length ? Math.min(...weeks) : 999,
    };
  };

  const teacherAvailable = (teachers, day, periodId) => {
    for (const t of teachers) {
      const profile = profileByTeacher.get(String(t));
      if (!profile?.availability?.length) continue;
      const dayAvail = profile.availability.find((a) => a.day === day);
      if (!dayAvail?.periodIds?.length) return false;
      const allowed = dayAvail.periodIds.map(String);
      if (!allowed.includes(String(periodId))) return false;
    }
    return true;
  };

  const roomFor = (teachers, classId, day, periodId) =>
    pickRoomForPlacement(
      rooms,
      classId,
      autoAssignRooms,
      teachers,
      profileByTeacher,
      occ,
      day,
      periodId
    );

  const writePlacement = async (job, day, period) => {
    const periodIdx = periodIndex(lecturePeriods, period._id);
    const limits = teacherLimits(job.teachers);
    const roomId = roomFor(job.teachers, job.classId, day, period._id);
    if (!teacherAvailable(job.teachers, day, period._id)) return false;
    const ok = canPlace(occ, {
      teachers: job.teachers,
      sectionIds: job.sectionIds,
      roomId,
      day,
      periodId: String(period._id),
      subjectIds: job.subjectIds,
      periodIdx,
      maxTeacherPerDay: limits.maxTeacherPerDay,
      maxTeacherPerWeek: limits.maxTeacherPerWeek,
      maxConsecutive: balanceSubjects ? 1 : maxConsecutive,
      preventTeacherConflicts,
      preventRoomConflicts,
      maxSameSubjectPerDay: balanceSubjects ? 1 : 99,
    });
    if (!ok) return false;

    const writtenForPlacement = [];
    for (const sid of job.sectionIds) {
      const version = versionBySection.get(sid);
      if (!version) {
        if (writtenForPlacement.length) {
          // eslint-disable-next-line no-await-in-loop
          await ScheduleSlot.deleteMany({ _id: { $in: writtenForPlacement.map((s) => s._id) } });
        }
        return false;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const created = await ScheduleSlot.create({
          timetableVersion: version._id,
          session: sessionId,
          class: job.classId,
          section: sid,
          day,
          periodId: period._id,
          subject: job.primary.subject,
          teacher: job.primary.teacher,
          parallelEntries: job.parallelEntries,
          room: roomId,
          combinedGroupId: job.combinedGroupId,
          source: 'auto',
          locked: false,
          createdBy: userId,
        });
        writtenForPlacement.push(created);
      } catch (err) {
        if (writtenForPlacement.length) {
          // eslint-disable-next-line no-await-in-loop
          await ScheduleSlot.deleteMany({ _id: { $in: writtenForPlacement.map((s) => s._id) } });
        }
        return false;
      }
    }

    if (writtenForPlacement.length !== job.sectionIds.length) return false;

    markBusy(occ, {
      teachers: job.teachers,
      sectionIds: job.sectionIds,
      roomId,
      day,
      periodId: String(period._id),
      subjectIds: job.subjectIds,
      periodIdx,
    });
    job.usedPeriodIdx.add(periodIdx);
    job.remaining -= 1;
    placedSlots.push(...writtenForPlacement);

    const classStat = byClass.get(job.classId);
    if (classStat) {
      classStat.placed += writtenForPlacement.length;
      if (job.isShared) classStat.shared += 1;
      if (job.kind === 'parallel') classStat.parallel += 1;
    }
    if (job.isShared) sharedLessonCount += 1;
    if (job.kind === 'parallel') parallelLessonCount += 1;
    return true;
  };

  // Pass 1: build each day independently with shuffled subjects & periods
  for (const day of shuffleList(workingDays)) {
    const periodsToday = shuffleList(lecturePeriods);
    const eligible = shuffleList(jobState.filter((j) => j.remaining > 0));

    for (const period of periodsToday) {
      const periodIdx = periodIndex(lecturePeriods, period._id);
      let best = null;
      let bestScore = Infinity;

      for (const job of eligible) {
        if (job.remaining <= 0) continue;
        if (
          balanceSubjects &&
          subjectCountOnDay(occ, job.sectionIds, job.subjectIds, day) >= 1
        ) {
          continue;
        }
        // Prefer subjects that still need more lessons, and haven't used this period yet
        const need = job.remaining;
        const periodReuse = job.usedPeriodIdx.has(periodIdx) ? 400 : 0;
        const score = periodReuse - need * 10 + Math.random();
        if (score >= bestScore) continue;

        const limits = teacherLimits(job.teachers);
        if (!teacherAvailable(job.teachers, day, period._id)) continue;
        if (
          !canPlace(occ, {
            teachers: job.teachers,
            sectionIds: job.sectionIds,
            roomId: roomFor(job.teachers, job.classId, day, period._id),
            day,
            periodId: String(period._id),
            subjectIds: job.subjectIds,
            periodIdx,
            maxTeacherPerDay: limits.maxTeacherPerDay,
            maxTeacherPerWeek: limits.maxTeacherPerWeek,
            maxConsecutive: balanceSubjects ? 1 : maxConsecutive,
            preventTeacherConflicts,
            preventRoomConflicts,
            maxSameSubjectPerDay: balanceSubjects ? 1 : 99,
          })
        ) {
          continue;
        }
        best = job;
        bestScore = score;
      }

      if (best) {
        // eslint-disable-next-line no-await-in-loop
        await writePlacement(best, day, period);
      }
    }
  }

  // Pass 2: fill remaining quotas anywhere valid (still avoid same-subject same-day)
  for (const job of jobState) {
    if (job.remaining <= 0) continue;
    const daysTry = shuffleList(workingDays);
    for (const day of daysTry) {
      if (job.remaining <= 0) break;
      const periodsTry = shuffleList(lecturePeriods);
      for (const period of periodsTry) {
        if (job.remaining <= 0) break;
        // eslint-disable-next-line no-await-in-loop
        await writePlacement(job, day, period);
      }
    }
  }

  for (const job of jobState) {
    if (job.remaining > 0) {
      unplaced.push({
        label: job.label,
        kind: job.kind,
        classId: job.classId,
        sectionIds: job.sectionIds,
        weeklyPeriods: job.targetWeekly,
        remaining: job.remaining,
        entries: job.entries,
      });
      const classStat = byClass.get(job.classId);
      if (classStat) classStat.unplaced += job.remaining;
    }
  }

  // Persist generationMeta on each draft version
  const score =
    jobs.reduce((s, j) => s + j.weeklyPeriods, 0) === 0
      ? 100
      : Math.round(
          (1 -
            unplaced.reduce((s, u) => s + u.remaining, 0) /
              Math.max(
                1,
                jobs.reduce((s, j) => s + j.weeklyPeriods, 0)
              )) *
            100
        );

  for (const version of versionBySection.values()) {
    // eslint-disable-next-line no-await-in-loop
    await TimetableVersion.findByIdAndUpdate(version._id, {
      generationMeta: {
        engine: ENGINE,
        jobId,
        score,
        unplacedCount: unplaced.reduce((s, u) => s + u.remaining, 0),
        ranAt: new Date(),
      },
      notes: `Auto-generated ${new Date().toISOString().slice(0, 10)} (${ENGINE})`,
    });
  }

  return {
    jobId,
    engine: ENGINE,
    session: { _id: session._id, name: session.name },
    versionMode: 'draft',
    summary: {
      lessonsPlaced: placedSlots.length,
      sharedLessons: sharedLessonCount,
      parallelLessons: parallelLessonCount,
      conflicts: 0,
      unplaced: unplaced.reduce((s, u) => s + u.remaining, 0),
      score,
      sectionsProcessed: versionBySection.size,
      classesProcessed: classes.length,
      skipped: skipped.length,
      assignmentsPropagated: propagatedCount,
    },
    classes: [...byClass.values()],
    skipped,
    unplaced,
    options: {
      defaultWeeklyPeriods,
      balanceSubjects,
      preventTeacherConflicts,
      preventRoomConflicts,
      applyParallel,
      allowSharedLessons,
      replaceUnlocked,
      propagateAssignments,
    },
  };
}

module.exports = {
  autoGenerateAll,
  ENGINE,
};
