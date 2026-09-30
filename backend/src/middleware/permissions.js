const ApiError = require('../utils/ApiError');
const { hasModulePermission } = require('../modules');

/**
 * Legacy Permission.name → module RBAC.
 * Seed used read/update/approve; module matrix uses view/edit/publish.
 */
const LEGACY_PERMISSION_MODULE = {
  manage_users: { module: 'user', actions: ['view', 'create', 'edit', 'delete'] },
  manage_roles: { module: 'role', actions: ['view', 'create', 'edit', 'delete'] },
  manage_sessions: { module: 'config', actions: ['view', 'create', 'edit'] },
  manage_classes: { module: 'config', actions: ['view', 'create', 'edit'] },
  temporary_register_student: { module: 'student', actions: ['create'] },
  activate_student: { module: 'student', actions: ['activate', 'edit'] },
  view_students: { module: 'student', actions: ['view'] },
  update_student_status: { module: 'student', actions: ['edit', 'suspend'] },
  mark_attendance: { module: 'attendance', actions: ['create', 'edit'] },
  correct_attendance: { module: 'attendance', actions: ['correct', 'edit'] },
  view_attendance: { module: 'attendance', actions: ['view'] },
  manage_fee_structures: { module: 'fee', actions: ['create', 'edit'] },
  generate_vouchers: { module: 'fee', actions: ['generate', 'create'] },
  record_fee_payment: { module: 'fee', actions: ['record', 'edit'] },
  view_fee_reports: { module: 'fee', actions: ['view'] },
  manage_exams: { module: 'exam', actions: ['create', 'edit'] },
  enter_exam_marks: { module: 'exam', actions: ['edit'] },
  publish_results: { module: 'exam', actions: ['publish'] },
  view_results: { module: 'exam', actions: ['view'] },
  manage_announcements: { module: 'announcement', actions: ['create', 'edit'] },
  manage_conversations: { module: 'chat', actions: ['create', 'edit'] },
  use_chat: { module: 'chat', actions: ['view', 'participate'] },
  view_timetables: { module: 'timetable', actions: ['view'] },
  manage_timetables: { module: 'timetable', actions: ['create', 'edit'] },
  manage_academy_classes: { module: 'studentManagement', actions: ['create', 'edit'] },
  manage_academy_subjects: { module: 'studentManagement', actions: ['create', 'edit'] },
  manage_academy_fee_structures: { module: 'studentManagement', actions: ['create', 'edit'] },
  manage_academy_students: { module: 'studentManagement', actions: ['create', 'edit'] },
  view_academy_students: { module: 'studentManagement', actions: ['view'] },
  manage_academy_fees: { module: 'studentManagement', actions: ['record', 'edit'] },
  view_academy_fee_reports: { module: 'studentManagement', actions: ['view'] },
  manage_academy_salaries: { module: 'studentManagement', actions: ['edit', 'record'] },
  view_academy_salaries: { module: 'studentManagement', actions: ['view'] },
  manage_academy_expenses: { module: 'studentManagement', actions: ['create', 'edit'] },
  view_academy_expenses: { module: 'studentManagement', actions: ['view'] },
  manage_datasheets: { module: 'datasheets', actions: ['create', 'edit'] },
  view_datasheets: { module: 'datasheets', actions: ['view'] },
};

function collectPermissionNames(user) {
  const names = new Set();
  const role = user.roleDoc || user.role;
  if (role && role.permissions) {
    role.permissions.forEach((p) => {
      if (p && p.name) names.add(p.name);
    });
  }
  if (user.permissions && user.permissions.length) {
    user.permissions.forEach((p) => {
      if (p && p.name) names.add(p.name);
    });
  }
  return names;
}

function hasLegacyOrModulePermission(user, permissionName) {
  const names = collectPermissionNames(user);
  if (names.has(permissionName)) return true;

  const mapped = LEGACY_PERMISSION_MODULE[permissionName];
  if (!mapped) return false;
  return mapped.actions.some((action) => hasModulePermission(user, mapped.module, action));
}

function roleNameOf(user) {
  const role = user?.roleDoc || user?.role;
  return typeof role === 'object' && role?.name ? role.name : null;
}

function requirePermission(...permissionNames) {
  return (req, res, next) => {
    if (roleNameOf(req.user) === 'admin') return next();

    const allowed = permissionNames.some((p) => hasLegacyOrModulePermission(req.user, p));
    if (!allowed) {
      return next(new ApiError(403, 'You do not have permission for this action'));
    }
    return next();
  };
}

function requireAnyPermission(...permissionNames) {
  return requirePermission(...permissionNames);
}

/**
 * Require module-based permission
 * @param {String} moduleName - Module name (e.g., 'exam', 'assignment')
 * @param {String|Array} action - Action(s) to require (e.g., 'view', 'create', or ['view', 'edit'])
 */
function requireModulePermission(moduleName, action) {
  return (req, res, next) => {
    if (roleNameOf(req.user) === 'admin') return next();

    const actions = Array.isArray(action) ? action : [action];
    const hasPermission = actions.some((a) => hasModulePermission(req.user, moduleName, a));

    if (!hasPermission) {
      return next(
        new ApiError(403, `You do not have ${action} permission for ${moduleName} module`)
      );
    }
    return next();
  };
}

/** Face enrollment photos: staff managers or AI Attendance operators — not general view_attendance. */
function requireFaceImageAccess() {
  return (req, res, next) => {
    if (roleNameOf(req.user) === 'admin') return next();
    if (hasLegacyOrModulePermission(req.user, 'manage_users')) return next();
    if (hasLegacyOrModulePermission(req.user, 'manage_academy_students')) return next();
    if (['view', 'create', 'edit'].some((a) => hasModulePermission(req.user, 'aiAttendance', a))) {
      return next();
    }
    return next(new ApiError(403, 'You do not have permission for this action'));
  };
}

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireModulePermission,
  requireFaceImageAccess,
  collectPermissionNames,
  hasLegacyOrModulePermission,
  LEGACY_PERMISSION_MODULE,
};
