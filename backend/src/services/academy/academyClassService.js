const ApiError = require('../../utils/ApiError');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const { assertSessionWritable } = require('../session/sessionGuard');
const { normalizeDisciplineList } = require('../../utils/academyDiscipline');

async function listClasses({ status, search, sessionId }) {
  const q = {};
  if (status) q.status = status;
  if (sessionId) q.sessionId = sessionId;
  if (search) {
    q.className = { $regex: search.trim(), $options: 'i' };
  }
  return AcademyClass.find(q)
    .populate('createdBy', 'name email')
    .populate('sessionId', 'name status isActive isClosed')
    .sort({ className: 1 });
}

async function createClass(payload, userId) {
  await assertSessionWritable(payload.sessionId);

  const sessionId = payload.sessionId;
  const className = payload.className.trim();
  const exists = await AcademyClass.findOne({ sessionId, className });
  if (exists) throw new ApiError(409, 'Class name already exists for this session');
  const doc = await AcademyClass.create({
    ...payload,
    sessionId,
    className,
    disciplines: normalizeDisciplineList(payload.disciplines),
    createdBy: userId,
  });
  return doc;
}

async function updateClass(id, payload) {
  const doc = await AcademyClass.findById(id);
  if (!doc) throw new ApiError(404, 'Class not found');
  if (payload.className && payload.className.trim() !== doc.className) {
    const dup = await AcademyClass.findOne({
      className: payload.className.trim(),
      sessionId: doc.sessionId,
      _id: { $ne: id },
    });
    if (dup) throw new ApiError(409, 'Class name already exists for this session');
    doc.className = payload.className.trim();
  }
  if (payload.disciplines !== undefined) {
    doc.disciplines = normalizeDisciplineList(payload.disciplines);
  }
  if (payload.totalSubjects !== undefined) doc.totalSubjects = payload.totalSubjects;
  if (payload.status) doc.status = payload.status;
  await doc.save();
  return doc;
}

async function getClassById(id) {
  const doc = await AcademyClass.findById(id).populate('createdBy', 'name email').lean();
  if (!doc) throw new ApiError(404, 'Class not found');
  return doc;
}

async function deleteClass(id) {
  const doc = await AcademyClass.findById(id);
  if (!doc) throw new ApiError(404, 'Class not found');
  const subjectCount = await AcademySubject.countDocuments({ classId: id });
  if (subjectCount > 0) {
    throw new ApiError(400, 'Cannot delete class with subjects. Remove subjects first.');
  }
  const studentCount = await AcademyStudent.countDocuments({ classId: id });
  if (studentCount > 0) {
    throw new ApiError(400, 'Cannot delete class with enrolled students. Move or remove students first.');
  }
  await doc.deleteOne();
  return { deleted: true };
}

async function syncSubjectCount(classId) {
  const count = await AcademySubject.countDocuments({ classId, status: 'active' });
  await AcademyClass.findByIdAndUpdate(classId, { totalSubjects: count });
}

module.exports = {
  listClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  syncSubjectCount,
};
