const AcademyStudent = require('../models/academy/AcademyStudent');
const ApiError = require('../utils/ApiError');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roleNameOf(req) {
  return String(req.user?.roleDoc?.name || req.user?.role?.name || req.user?.role || '');
}

/** Active student ObjectIds linked to a parent via guardianEmail or student phone. */
async function linkedStudentIdsForParent(req) {
  const email = String(req.user?.email || '').trim();
  const phone = String(req.user?.phone || '').trim();
  const or = [];
  if (email && !email.endsWith('@parent.local') && !email.endsWith('@parent.temp')) {
    or.push({ guardianEmail: { $regex: `^${escapeRegExp(email)}$`, $options: 'i' } });
  }
  if (phone) {
    or.push({ phone });
  }
  if (!or.length) return [];
  const rows = await AcademyStudent.find({ status: 'active', $or: or }).select('_id').lean();
  return rows.map((s) => s._id);
}

async function assertParentOwnsStudent(req, studentId) {
  if (roleNameOf(req) !== 'parent') return;
  const ids = await linkedStudentIdsForParent(req);
  if (!ids.some((id) => String(id) === String(studentId))) {
    throw new ApiError(403, 'Access denied');
  }
}

module.exports = {
  roleNameOf,
  linkedStudentIdsForParent,
  assertParentOwnsStudent,
  escapeRegExp,
};
