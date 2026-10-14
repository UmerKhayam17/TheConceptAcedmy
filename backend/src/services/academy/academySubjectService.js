const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const { syncSubjectCount } = require('./academyClassService');
const { populateCreatedBy } = require('../../utils/createdBy');
const { buildChoiceGroupsFromSubjects } = require('./academyEnrollmentSubjectService');
const { defaultSalaryWeights } = require('../../utils/subjectSalaryWeights');
const { applyDefaultWeightsToClass } = require('./percentageSalaryCalculator');

function clampPercent(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function resolveSalaryWeights(className, payload, subjectName, subjectCode) {
  const defaults = defaultSalaryWeights(className, subjectName, subjectCode);
  return {
    tuitionSharePercent: clampPercent(payload.tuitionSharePercent, defaults.tuitionSharePercent),
  };
}

function normalizeChoiceFields(payload) {
  const enrollmentType = payload.enrollmentType === 'choice' ? 'choice' : 'required';
  if (enrollmentType === 'required') {
    return { enrollmentType: 'required', choiceGroupName: undefined, pickCount: 1 };
  }
  const choiceGroupName = String(payload.choiceGroupName || '').trim();
  if (!choiceGroupName) {
    throw new ApiError(400, 'Choice group name is required for group choice subjects');
  }
  const pickCount = Math.max(1, Number(payload.pickCount) || 1);
  return { enrollmentType: 'choice', choiceGroupName, pickCount };
}

async function syncGroupPickCount(classId, choiceGroupName, pickCount) {
  if (!choiceGroupName) return;
  await AcademySubject.updateMany(
    {
      classId,
      enrollmentType: 'choice',
      choiceGroupName: new RegExp(`^${choiceGroupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    },
    { $set: { pickCount, choiceGroupName } }
  );
}

/**
 * Full-package style share total for a class:
 * required subjects sum as-is; each choice group contributes avg(share) × pickCount.
 * Target is ≈100% (±1).
 */
function computeSubjectShareBalance(subjects) {
  const active = (subjects || []).filter((s) => (s.status || 'active') === 'active');
  let total = 0;
  const groups = new Map();

  for (const s of active) {
    const share = Number(s.tuitionSharePercent) || 0;
    if (s.enrollmentType === 'choice' && s.choiceGroupName) {
      const key = String(s.choiceGroupName).trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, { pickCount: 1, shares: [] });
      const g = groups.get(key);
      g.shares.push(share);
      g.pickCount = Math.max(g.pickCount, Number(s.pickCount) || 1);
    } else {
      total += share;
    }
  }

  for (const g of groups.values()) {
    const avg = g.shares.length ? g.shares.reduce((a, b) => a + b, 0) / g.shares.length : 0;
    total += avg * g.pickCount;
  }

  const totalShare = Math.round(total * 1000) / 1000;
  const tolerance = 1;
  return {
    totalShare,
    target: 100,
    tolerance,
    ok: Math.abs(totalShare - 100) <= tolerance,
    delta: Math.round((totalShare - 100) * 1000) / 1000,
    activeCount: active.length,
    choiceGroupCount: groups.size,
  };
}

/**
 * Active students enrolled in each subject (via selectedSubjects).
 * Full-package students with an empty selectedSubjects list count toward every subject in the class.
 * @returns {Map<string, number>}
 */
async function enrolledCountBySubjectIds(classId, subjectIds) {
  const ids = (subjectIds || [])
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!ids.length) return new Map();

  let classOid;
  try {
    classOid = new mongoose.Types.ObjectId(String(classId));
  } catch {
    return new Map();
  }

  const rows = await AcademyStudent.aggregate([
    {
      $match: {
        classId: classOid,
        status: 'active',
        selectedSubjects: { $in: ids },
      },
    },
    { $unwind: '$selectedSubjects' },
    { $match: { selectedSubjects: { $in: ids } } },
    { $group: { _id: '$selectedSubjects', count: { $sum: 1 } } },
  ]);

  const map = new Map(rows.map((r) => [String(r._id), r.count]));

  const fullPkgEmpty = await AcademyStudent.countDocuments({
    classId: classOid,
    status: 'active',
    isFullPackage: true,
    $or: [{ selectedSubjects: { $exists: false } }, { selectedSubjects: { $size: 0 } }],
  });
  if (fullPkgEmpty > 0) {
    for (const id of ids) {
      const key = String(id);
      map.set(key, (map.get(key) || 0) + fullPkgEmpty);
    }
  }

  return map;
}

/** Attach `enrolledStudents` to subject docs/objects for list responses. */
async function attachEnrolledStudentCounts(subjects, classId) {
  const list = Array.isArray(subjects) ? subjects : [];
  if (!list.length || !classId) {
    return list.map((s) => {
      const plain = typeof s?.toObject === 'function' ? s.toObject() : { ...(s || {}) };
      plain.enrolledStudents = Number(plain.enrolledStudents) || 0;
      return plain;
    });
  }

  const counts = await enrolledCountBySubjectIds(
    classId,
    list.map((s) => s._id)
  );

  return list.map((s) => {
    const plain = typeof s.toObject === 'function' ? s.toObject() : { ...s };
    plain.enrolledStudents = counts.get(String(s._id)) || 0;
    return plain;
  });
}

async function listByClass(classId, { status, sectionId } = {}) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');

  if (sectionId) {
    const section = await AcademySection.findById(sectionId);
    if (!section) throw new ApiError(404, 'Section not found');
    if (String(section.classId) !== String(classId)) {
      throw new ApiError(400, 'Section does not belong to this class');
    }
    if (!section.useClassSubjects) {
      const sq = { _id: { $in: section.subjectIds }, classId };
      if (status) sq.status = status;
      const rows = await populateCreatedBy(AcademySubject.find(sq)).sort({ subjectName: 1 });
      return attachEnrolledStudentCounts(rows, classId);
    }
  }

  const q = { classId };
  if (status) q.status = status;
  const rows = await populateCreatedBy(AcademySubject.find(q)).sort({ subjectName: 1 });
  return attachEnrolledStudentCounts(rows, classId);
}

/** Distinct choice groups derived from subjects (for admin dropdowns). */
async function listChoiceGroups(classId) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  const subjects = await AcademySubject.find({ classId, status: 'active' }).sort({ subjectName: 1 });
  return buildChoiceGroupsFromSubjects(subjects).map((g) => ({
    _id: g._id,
    classId,
    groupName: g.groupName,
    pickCount: g.pickCount,
    status: 'active',
    subjectIds: g.subjects,
  }));
}

async function createSubject(payload, userId) {
  const cls = await AcademyClass.findById(payload.classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  const code = payload.subjectCode.trim().toUpperCase();
  const dup = await AcademySubject.findOne({ classId: payload.classId, subjectCode: code });
  if (dup) throw new ApiError(409, 'Subject code already exists for this class');

  const choice = normalizeChoiceFields(payload);
  const name = payload.subjectName.trim();
  const weights = resolveSalaryWeights(cls.className, payload, name, code);
  const subject = await AcademySubject.create({
    subjectName: name,
    classId: payload.classId,
    subjectCode: code,
    status: payload.status || 'active',
    enrollmentType: choice.enrollmentType,
    choiceGroupName: choice.choiceGroupName,
    pickCount: choice.pickCount,
    tuitionSharePercent: weights.tuitionSharePercent,
    createdBy: userId,
  });

  if (choice.enrollmentType === 'choice') {
    await syncGroupPickCount(payload.classId, choice.choiceGroupName, choice.pickCount);
  }

  await syncSubjectCount(payload.classId);
  return subject;
}

async function createBulkChoiceSubjects(payload, userId) {
  const classId = payload.classId;
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');

  const groupName = String(payload.groupName || payload.choiceGroupName || '').trim();
  if (!groupName) throw new ApiError(400, 'Choice group name is required');

  const subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
  if (subjects.length < 2 || subjects.length > 10) {
    throw new ApiError(400, 'Create between 2 and 10 subjects for a choice group');
  }

  const pickCount = Math.max(1, Number(payload.pickCount) || 1);
  if (pickCount > subjects.length) {
    throw new ApiError(400, 'pickCount cannot exceed number of subjects in the group');
  }

  const codes = subjects.map((s) => String(s.subjectCode || '').trim().toUpperCase());
  if (codes.some((c) => !c) || subjects.some((s) => !String(s.subjectName || '').trim())) {
    throw new ApiError(400, 'Each subject needs a name and code');
  }
  if (new Set(codes).size !== codes.length) {
    throw new ApiError(400, 'Subject codes must be unique within the group');
  }

  const existing = await AcademySubject.find({ classId, subjectCode: { $in: codes } }).select('subjectCode');
  if (existing.length) {
    throw new ApiError(409, `Subject code already exists: ${existing.map((e) => e.subjectCode).join(', ')}`);
  }

  const created = await AcademySubject.insertMany(
    subjects.map((s) => {
      const subjectName = String(s.subjectName).trim();
      const subjectCode = String(s.subjectCode).trim().toUpperCase();
      const weights = resolveSalaryWeights(cls.className, s, subjectName, subjectCode);
      return {
        subjectName,
        subjectCode,
        classId,
        status: 'active',
        enrollmentType: 'choice',
        choiceGroupName: groupName,
        pickCount,
        tuitionSharePercent: weights.tuitionSharePercent,
        createdBy: userId,
      };
    })
  );

  await syncSubjectCount(classId);

  return {
    groupName,
    pickCount,
    subjects: created,
  };
}

async function refreshUnpaidSalariesAfterWeightChange(userId) {
  const { recalculateUnpaidPercentageSalariesAfterWeightChange } = require('./academySalaryService');
  try {
    return await recalculateUnpaidPercentageSalariesAfterWeightChange(userId);
  } catch (err) {
    // Subject save already succeeded — don't fail the request if payroll refresh errors.
    console.error('[salary] Failed to refresh unpaid percentage salaries after weight change:', err);
    return { updated: 0, skipped: 0, error: true };
  }
}

async function updateSubject(id, payload, userId) {
  const doc = await AcademySubject.findById(id);
  if (!doc) throw new ApiError(404, 'Subject not found');

  const prevShare = Number(doc.tuitionSharePercent) || 0;

  if (payload.subjectName) doc.subjectName = payload.subjectName.trim();
  if (payload.subjectCode) {
    const code = payload.subjectCode.trim().toUpperCase();
    const dup = await AcademySubject.findOne({
      classId: doc.classId,
      subjectCode: code,
      _id: { $ne: id },
    });
    if (dup) throw new ApiError(409, 'Subject code already exists for this class');
    doc.subjectCode = code;
  }
  if (payload.status) doc.status = payload.status;
  if (payload.tuitionSharePercent !== undefined) {
    doc.tuitionSharePercent = clampPercent(payload.tuitionSharePercent, doc.tuitionSharePercent || 0);
  }

  const weightsChanged =
    payload.tuitionSharePercent !== undefined &&
    (Number(doc.tuitionSharePercent) || 0) !== prevShare;

  if (payload.enrollmentType !== undefined || payload.choiceGroupName !== undefined || payload.pickCount !== undefined) {
    const choice = normalizeChoiceFields({
      enrollmentType: payload.enrollmentType !== undefined ? payload.enrollmentType : doc.enrollmentType,
      choiceGroupName:
        payload.choiceGroupName !== undefined ? payload.choiceGroupName : doc.choiceGroupName,
      pickCount: payload.pickCount !== undefined ? payload.pickCount : doc.pickCount,
    });
    doc.enrollmentType = choice.enrollmentType;
    doc.choiceGroupName = choice.choiceGroupName;
    doc.pickCount = choice.pickCount;
    if (choice.enrollmentType === 'choice') {
      await doc.save();
      await syncGroupPickCount(doc.classId, choice.choiceGroupName, choice.pickCount);
      await syncSubjectCount(doc.classId);
      if (weightsChanged) {
        await refreshUnpaidSalariesAfterWeightChange(userId);
      }
      return AcademySubject.findById(id);
    }
    doc.set('choiceGroupName', undefined);
    doc.pickCount = 1;
  }

  await doc.save();
  await syncSubjectCount(doc.classId);
  if (weightsChanged) {
    await refreshUnpaidSalariesAfterWeightChange(userId);
  }
  return doc;
}

async function deleteSubject(id) {
  const doc = await AcademySubject.findById(id);
  if (!doc) throw new ApiError(404, 'Subject not found');
  const classId = doc.classId;
  // Clear timetable slots that still reference this subject so Class Board / Builder
  // never receive null populated subjects after delete.
  const { purgeSubjectFromSchedule } = require('../timetable/scheduleSlotSanitize');
  await purgeSubjectFromSchedule(doc._id);
  await doc.deleteOne();
  await syncSubjectCount(classId);
  return { deleted: true };
}

/**
 * Create the standard core subject list for a class (idempotent by name or code).
 */
async function createStandardSubjects(classId, userId) {
  const { DEFAULT_ACADEMY_SUBJECTS, generateSubjectCode } = require('../../config/academyDefaultSubjects');
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');

  const existing = await AcademySubject.find({ classId }).select('subjectName subjectCode').lean();
  const nameSet = new Set(existing.map((s) => String(s.subjectName || '').trim().toLowerCase()));
  const codeSet = new Set(existing.map((s) => String(s.subjectCode || '').trim().toUpperCase()));

  const created = [];
  const skipped = [];

  for (const def of DEFAULT_ACADEMY_SUBJECTS) {
    const subjectName = String(def.subjectName).trim();
    const nameKey = subjectName.toLowerCase();
    let subjectCode = generateSubjectCode(subjectName, cls.className);

    if (nameSet.has(nameKey)) {
      skipped.push(subjectName);
      continue;
    }

    // Avoid unique-index collisions if a custom subject already used this code.
    if (codeSet.has(subjectCode)) {
      let n = 2;
      let alt = `${subjectCode}-${n}`;
      while (codeSet.has(alt) && n < 50) {
        n += 1;
        alt = `${subjectCode}-${n}`;
      }
      subjectCode = alt;
    }

    const weights = defaultSalaryWeights(cls.className, subjectName, subjectCode);
    const doc = await AcademySubject.create({
      subjectName,
      subjectCode,
      classId,
      status: 'active',
      enrollmentType: 'required',
      pickCount: 1,
      tuitionSharePercent: weights.tuitionSharePercent,
      createdBy: userId,
    });
    created.push(doc);
    nameSet.add(nameKey);
    codeSet.add(subjectCode);
  }

  await syncSubjectCount(classId);
  const subjects = await listByClass(classId);

  return {
    created: created.length,
    skipped: skipped.length,
    subjects,
  };
}

/** Apply Excel default tuition-share / teacher-cut rates to every subject in the class. */
async function applySalaryWeights(classId, userId) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  const result = await applyDefaultWeightsToClass(classId, cls.className);
  const salaryRefresh = await refreshUnpaidSalariesAfterWeightChange(userId);
  const subjects = await listByClass(classId);
  return { ...result, subjects, salariesRecalculated: salaryRefresh.updated || 0 };
}

module.exports = {
  listByClass,
  listChoiceGroups,
  createSubject,
  createBulkChoiceSubjects,
  updateSubject,
  deleteSubject,
  createStandardSubjects,
  applySalaryWeights,
  attachEnrolledStudentCounts,
  enrolledCountBySubjectIds,
  computeSubjectShareBalance,
};
