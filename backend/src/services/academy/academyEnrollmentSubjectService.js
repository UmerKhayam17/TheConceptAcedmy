const ApiError = require('../../utils/ApiError');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademySection = require('../../models/academy/AcademySection');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademyDiscipline = require('../../models/academy/AcademyDiscipline');

/**
 * Allowed subjects for enrollment.
 * With discipline: shared (not in ANY discipline package) ∪ this discipline's stream subjects.
 * Without discipline: all class (or section) subjects.
 */
async function getAllowedSubjects(classId, sectionId, status = 'active', disciplineId) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');

  const q = { classId };
  if (status) q.status = status;

  let sectionFilterIds = null;
  if (sectionId) {
    const section = await AcademySection.findById(sectionId);
    if (!section) throw new ApiError(404, 'Section not found');
    if (String(section.classId) !== String(classId)) {
      throw new ApiError(400, 'Section does not belong to this class');
    }
    if (!section.useClassSubjects) {
      sectionFilterIds = (section.subjectIds || []).map(String);
    }
  }

  let disciplineFilterIds = null;
  if (disciplineId) {
    const discipline = await AcademyDiscipline.findById(disciplineId);
    if (!discipline) throw new ApiError(404, 'Discipline not found');
    if (String(discipline.classId) !== String(classId)) {
      throw new ApiError(400, 'Discipline does not belong to this class');
    }
    if (discipline.status !== 'active') {
      throw new ApiError(400, 'Discipline is not active');
    }

    const streamIds = (discipline.subjectIds || []).map(String);
    if (streamIds.length === 0) {
      throw new ApiError(
        400,
        `Discipline "${discipline.name}" has no stream subjects yet. Assign Biology/Math/CS etc. in Disciplines setup.`
      );
    }

    const allDisciplines = await AcademyDiscipline.find({ classId, status: 'active' })
      .select('subjectIds')
      .lean();
    const assignedToAnyStream = new Set(
      allDisciplines.flatMap((d) => (d.subjectIds || []).map((id) => String(id)))
    );

    const classSubjectQ = { classId };
    if (status) classSubjectQ.status = status;
    const classSubjects = await AcademySubject.find(classSubjectQ).select('_id').lean();
    const sharedIds = classSubjects
      .map((s) => String(s._id))
      .filter((id) => !assignedToAnyStream.has(id));

    disciplineFilterIds = [...new Set([...sharedIds, ...streamIds])];
  }

  let allowedIds = null;
  if (sectionFilterIds && disciplineFilterIds) {
    const set = new Set(sectionFilterIds);
    allowedIds = disciplineFilterIds.filter((id) => set.has(id));
    if (!allowedIds.length) {
      throw new ApiError(400, 'No subjects overlap between this section and discipline');
    }
  } else if (sectionFilterIds) {
    allowedIds = sectionFilterIds;
  } else if (disciplineFilterIds) {
    allowedIds = disciplineFilterIds;
  }

  if (allowedIds) {
    q._id = { $in: allowedIds };
  }

  return AcademySubject.find(q).sort({ subjectName: 1 });
}

function buildChoiceGroupsFromSubjects(subjects) {
  const byGroup = new Map();

  for (const sub of subjects) {
    if (sub.enrollmentType !== 'choice') continue;
    const groupName = String(sub.choiceGroupName || '').trim();
    if (!groupName) continue;
    const key = groupName.toLowerCase();
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        _id: groupName,
        groupName,
        pickCount: Math.max(1, Number(sub.pickCount) || 1),
        subjects: [],
      });
    }
    const group = byGroup.get(key);
    group.subjects.push(sub);
    group.pickCount = Math.max(group.pickCount, Math.max(1, Number(sub.pickCount) || 1));
  }

  return [...byGroup.values()]
    .filter((g) => g.subjects.length >= 2)
    .sort((a, b) => a.groupName.localeCompare(b.groupName));
}

async function getEnrollmentLayout(classId, sectionId, disciplineId) {
  const subjects = await getAllowedSubjects(classId, sectionId, 'active', disciplineId);
  const choiceGroups = buildChoiceGroupsFromSubjects(subjects);
  const groupedIds = new Set(choiceGroups.flatMap((g) => g.subjects.map((s) => String(s._id))));
  const coreSubjects = subjects.filter((s) => !groupedIds.has(String(s._id)));

  let sharedSubjects = [];
  let streamSubjects = [];
  if (disciplineId) {
    const discipline = await AcademyDiscipline.findById(disciplineId).select('subjectIds name code');
    const streamSet = new Set((discipline?.subjectIds || []).map(String));
    sharedSubjects = coreSubjects.filter((s) => !streamSet.has(String(s._id)));
    streamSubjects = coreSubjects.filter((s) => streamSet.has(String(s._id)));
  }

  return {
    hasChoiceGroups: choiceGroups.length > 0,
    coreSubjects,
    choiceGroups,
    disciplineId: disciplineId || null,
    sharedSubjects,
    streamSubjects,
  };
}

async function validateEnrollmentSubjects(
  classId,
  sectionId,
  selectedSubjectIds,
  isFullPackage,
  disciplineId
) {
  const layout = await getEnrollmentLayout(classId, sectionId, disciplineId);
  const selected = (selectedSubjectIds || []).map(String);

  if (isFullPackage) {
    if (!layout.hasChoiceGroups) {
      return layout.coreSubjects.map((s) => s._id);
    }

    const result = layout.coreSubjects.map((s) => s._id);

    for (const group of layout.choiceGroups) {
      const groupIds = group.subjects.map((s) => String(s._id));
      const picks = selected.filter((id) => groupIds.includes(id));
      if (picks.length !== group.pickCount) {
        throw new ApiError(
          400,
          `Select exactly ${group.pickCount} subject(s) from "${group.groupName}"`
        );
      }
      if (new Set(picks).size !== picks.length) {
        throw new ApiError(400, `Duplicate selection in "${group.groupName}"`);
      }
      picks.forEach((id) => {
        const sub = group.subjects.find((s) => String(s._id) === id);
        if (sub) result.push(sub._id);
      });
    }

    return result;
  }

  if (!layout.hasChoiceGroups) {
    if (!selected.length) throw new ApiError(400, 'Select at least one subject or full package');
    const allowed = new Set(layout.coreSubjects.map((s) => String(s._id)));
    if (!selected.every((id) => allowed.has(id))) {
      throw new ApiError(400, 'One or more subjects are invalid for this class/section/discipline');
    }
    return layout.coreSubjects.filter((s) => selected.includes(String(s._id))).map((s) => s._id);
  }

  const coreIds = layout.coreSubjects.map((s) => String(s._id));
  const result = [];

  const corePicks = selected.filter((id) => coreIds.includes(id));
  if (new Set(corePicks).size !== corePicks.length) {
    throw new ApiError(400, 'Duplicate subject selection');
  }
  result.push(...corePicks);

  for (const group of layout.choiceGroups) {
    const groupIds = group.subjects.map((s) => String(s._id));
    const picks = selected.filter((id) => groupIds.includes(id));
    if (picks.length > group.pickCount) {
      throw new ApiError(
        400,
        `Select at most ${group.pickCount} subject(s) from "${group.groupName}"`
      );
    }
    if (new Set(picks).size !== picks.length) {
      throw new ApiError(400, `Duplicate selection in "${group.groupName}"`);
    }
    picks.forEach((id) => result.push(id));
  }

  const allSubjects = [...layout.coreSubjects, ...layout.choiceGroups.flatMap((g) => g.subjects)];
  return result.map((id) => {
    const sub = allSubjects.find((s) => String(s._id) === id);
    if (!sub) throw new ApiError(400, 'Invalid subject selection');
    return sub._id;
  });
}

module.exports = {
  getAllowedSubjects,
  getEnrollmentLayout,
  validateEnrollmentSubjects,
  buildChoiceGroupsFromSubjects,
};
