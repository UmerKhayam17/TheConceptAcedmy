const ApiError = require('../../utils/ApiError');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const { syncSubjectCount } = require('./academyClassService');
const { populateCreatedBy } = require('../../utils/createdBy');
const { buildChoiceGroupsFromSubjects } = require('./academyEnrollmentSubjectService');

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
      return populateCreatedBy(AcademySubject.find(sq)).sort({ subjectName: 1 });
    }
  }

  const q = { classId };
  if (status) q.status = status;
  return populateCreatedBy(AcademySubject.find(q)).sort({ subjectName: 1 });
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
  const subject = await AcademySubject.create({
    subjectName: payload.subjectName.trim(),
    classId: payload.classId,
    subjectCode: code,
    status: payload.status || 'active',
    enrollmentType: choice.enrollmentType,
    choiceGroupName: choice.choiceGroupName,
    pickCount: choice.pickCount,
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
    subjects.map((s) => ({
      subjectName: String(s.subjectName).trim(),
      subjectCode: String(s.subjectCode).trim().toUpperCase(),
      classId,
      status: 'active',
      enrollmentType: 'choice',
      choiceGroupName: groupName,
      pickCount,
      createdBy: userId,
    }))
  );

  await syncSubjectCount(classId);

  return {
    groupName,
    pickCount,
    subjects: created,
  };
}

async function updateSubject(id, payload) {
  const doc = await AcademySubject.findById(id);
  if (!doc) throw new ApiError(404, 'Subject not found');
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
      return AcademySubject.findById(id);
    }
    doc.set('choiceGroupName', undefined);
    doc.pickCount = 1;
  }

  await doc.save();
  await syncSubjectCount(doc.classId);
  return doc;
}

async function deleteSubject(id) {
  const doc = await AcademySubject.findById(id);
  if (!doc) throw new ApiError(404, 'Subject not found');
  const classId = doc.classId;
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

    const doc = await AcademySubject.create({
      subjectName,
      subjectCode,
      classId,
      status: 'active',
      enrollmentType: 'required',
      pickCount: 1,
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

module.exports = {
  listByClass,
  listChoiceGroups,
  createSubject,
  createBulkChoiceSubjects,
  updateSubject,
  deleteSubject,
  createStandardSubjects,
};
