const AcademyStudent = require('../models/academy/AcademyStudent');
const ApiError = require('../utils/ApiError');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roleNameOf(req) {
  return String(req.user?.roleDoc?.name || req.user?.role?.name || req.user?.role || '');
}

function isParentRole(req) {
  return roleNameOf(req).toLowerCase() === 'parent';
}

/** Active / pending_fee student ObjectIds linked to a parent via guardianEmail or student phone. */
async function linkedStudentIdsForParent(req) {
  const rows = await linkedStudentsForParent(req, { select: '_id' });
  return rows.map((s) => s._id);
}

/**
 * Linked academy students for the authenticated parent.
 * @param {{ select?: string, includeInactive?: boolean }} [opts]
 */
async function linkedStudentsForParent(req, opts = {}) {
  const email = String(req.user?.email || '').trim();
  const phone = String(req.user?.phone || '').trim();
  const or = [];
  if (email && !email.endsWith('@parent.local') && !email.endsWith('@parent.temp')) {
    or.push({ guardianEmail: { $regex: `^${escapeRegExp(email)}$`, $options: 'i' } });
  }
  if (phone && phone !== 'N/A') {
    or.push({ phone });
  }
  if (!or.length) return [];

  const filter = { $or: or };
  if (!opts.includeInactive) {
    filter.status = { $in: ['active', 'pending_fee'] };
  }

  return AcademyStudent.find(filter)
    .select(opts.select || '_id classId sectionId status')
    .lean();
}

async function assertParentOwnsStudent(req, studentId) {
  if (!isParentRole(req)) return;
  if (!studentId) throw new ApiError(403, 'Access denied');
  const ids = await linkedStudentIdsForParent(req);
  if (!ids.some((id) => String(id) === String(studentId))) {
    throw new ApiError(403, 'Access denied');
  }
}

/** Parents may only view timetables for sections their linked children belong to. */
async function assertParentCanAccessSection(req, sectionId) {
  if (!isParentRole(req)) return;
  if (!sectionId) throw new ApiError(403, 'Access denied');
  const kids = await linkedStudentsForParent(req, { select: 'sectionId' });
  const ok = kids.some((s) => s.sectionId && String(s.sectionId) === String(sectionId));
  if (!ok) throw new ApiError(403, 'Access denied');
}

function assertNotParent(req, message = 'Parents cannot perform this action') {
  if (isParentRole(req)) {
    throw new ApiError(403, message);
  }
}

module.exports = {
  roleNameOf,
  isParentRole,
  linkedStudentIdsForParent,
  linkedStudentsForParent,
  assertParentOwnsStudent,
  assertParentCanAccessSection,
  assertNotParent,
  escapeRegExp,
};
