/**
 * Central real-time sync + in-app notifications (Socket.io /notifications).
 */
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { SYSTEM_MODULES } = require('../../config/systemModules');
const { hasModuleAccess } = require('../../modules/moduleUtils');
const { isSystemAdmin } = require('../../utils/systemAdmin');

function getNotificationsNsp() {
  try {
    const { getIO } = require('../socket');
    return getIO().of('/notifications');
  } catch {
    return null;
  }
}

function emitModuleSync(moduleKey, resource, action, payload = {}) {
  const nsp = getNotificationsNsp();
  if (!nsp) return;
  const event = {
    module: moduleKey,
    resource,
    action,
    at: Date.now(),
    ...payload,
  };
  nsp.to(`mod:${moduleKey}`).emit('module:sync', event);
  nsp.to('role:admin').emit('module:sync', event);
}

async function createNotificationForUser(userId, doc) {
  const saved = await Notification.create({ userId, ...doc });
  const nsp = getNotificationsNsp();
  if (nsp) {
    nsp.to(`user:${userId}`).emit('notification:new', formatNotification(saved));
  }
  return saved;
}

function formatNotification(n) {
  return {
    _id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body || '',
    path: n.path || '',
    moduleKey: n.moduleKey || '',
    resource: n.resource || '',
    resourceId: n.resourceId || '',
    meta: n.meta || null,
    read: Boolean(n.read),
    createdAt: n.createdAt,
  };
}

function collectPermissionNames(user) {
  const names = new Set();
  const role = user.role;
  if (role?.permissions) {
    role.permissions.forEach((p) => {
      if (p?.name) names.add(p.name);
    });
  }
  if (user.permissions?.length) {
    user.permissions.forEach((p) => {
      if (p?.name) names.add(p.name);
    });
  }
  return names;
}

function userMatchesAccess(user, { roles = [], permissions = [], moduleKey, moduleAction }) {
  if (isSystemAdmin(user)) return true;
  const roleName = roleNameOf(user);
  if (roles.length && roles.includes(roleName)) return true;
  if (permissions.length) {
    const names = collectPermissionNames(user);
    if (permissions.some((p) => names.has(p))) return true;
  }
  if (moduleKey && moduleAction && hasModuleAccess(user, moduleKey)) {
    const perms = user.modulePermissions?.get?.(moduleKey) || user.modulePermissions?.[moduleKey] || [];
    if (Array.isArray(perms) && perms.includes(moduleAction)) return true;
  }
  return false;
}

async function findUsersForAccess(criteria, excludeUserId) {
  const users = await User.find({ isActive: true })
    .populate({ path: 'role', populate: { path: 'permissions' } })
    .populate('permissions');
  return users.filter((u) => {
    if (excludeUserId && String(u._id) === String(excludeUserId)) return false;
    return userMatchesAccess(u, criteria);
  });
}

async function notifyByAccess(criteria, notification, excludeUserId) {
  const users = await findUsersForAccess(criteria, excludeUserId);
  const results = [];
  for (const user of users) {
    const saved = await createNotificationForUser(user._id, notification);
    results.push(saved);
  }
  return results;
}

async function notifyStudentIntake(student, actorId) {
  const studentId = String(student._id);
  const title = 'New admission intake';
  const notes = (student.intakeNotes || '').trim();
  const body = notes
    ? `${student.studentName} is pending fee confirmation. ${notes}`
    : `${student.studentName} is pending fee confirmation.`;
  const path = `/students/${studentId}/activate`;

  try {
    await notifyByAccess(
      {
        roles: ['accountant', 'admin'],
        permissions: ['activate_student', 'manage_academy_fees', 'manage_academy_students'],
        moduleKey: 'student',
        moduleAction: 'edit',
      },
      {
        type: 'student_intake',
        title,
        body,
        path,
        moduleKey: 'student',
        resource: 'students',
        resourceId: studentId,
        meta: {
          studentName: student.studentName,
          rollNumber: student.rollNumber,
          registrationNumber: student.registrationNumber,
          intakeNotes: notes,
          status: student.status,
        },
      },
      actorId
    );
  } catch (err) {
    console.error('notifyStudentIntake notifications failed:', err.message);
  }

  emitModuleSync('studentManagement', 'students', 'created', {
    id: studentId,
    status: student.status,
  });
}

function syncStudentCrud(action, student) {
  const id = String(student._id || student.id || '');
  const payload = { id, status: student.status };
  emitModuleSync('studentManagement', 'students', action, payload);
  emitModuleSync('student', 'students', action, payload);
}

function syncResource(moduleKey, resource, action, id, extra = {}) {
  emitModuleSync(moduleKey, resource, action, { id: String(id), ...extra });
}

function roleNameOf(user) {
  if (!user?.role) return null;
  return typeof user.role === 'object' && user.role.name ? user.role.name : String(user.role);
}

/** Rooms a socket should join based on user access */
function getModuleRoomsForUser(user) {
  const rooms = [`user:${user._id}`];
  const roleName = roleNameOf(user);
  if (roleName) rooms.push(`role:${roleName}`);
  if (isSystemAdmin(user)) {
    SYSTEM_MODULES.forEach((m) => rooms.push(`mod:${m.key}`));
    return rooms;
  }
  const userForPerm = { ...user, role: user.role };
  for (const mod of SYSTEM_MODULES) {
    if (hasModuleAccess(userForPerm, mod.key)) {
      rooms.push(`mod:${mod.key}`);
    }
  }
  return rooms;
}

async function loadUserForRealtime(userId) {
  return User.findById(userId)
    .populate({ path: 'role', populate: { path: 'permissions' } })
    .populate('permissions');
}

module.exports = {
  emitModuleSync,
  createNotificationForUser,
  formatNotification,
  notifyByAccess,
  notifyStudentIntake,
  syncStudentCrud,
  syncResource,
  getModuleRoomsForUser,
  loadUserForRealtime,
};
