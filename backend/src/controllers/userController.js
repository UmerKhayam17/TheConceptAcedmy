const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const AcademyStudent = require('../models/academy/AcademyStudent');
const { MODULES } = require('../modules');
const { getSystemModulesForApi } = require('../config/systemModules');
const { isSystemAdmin, seedAdminEmail } = require('../utils/systemAdmin');
const { expandModulePermissions } = require('../modules/expandModulePermissions');
const {
  accountModuleForRoleName,
  accountModuleForListScope,
  hasAccountModulePermission,
  hasAnyAccountModulePermission,
} = require('../middleware/permissions');
const rt = require('../services/realtime/academyRealtime');

function assertAccountAction(reqUser, moduleName, action, label = 'this action') {
  if (isSystemAdmin(reqUser)) return;
  if (moduleName && hasAccountModulePermission(reqUser, moduleName, action)) return;
  if (!moduleName && hasAnyAccountModulePermission(reqUser, action)) return;
  throw new ApiError(403, `You do not have permission for ${label}`);
}

function roleNameFromUserDoc(user) {
  return String(user?.role?.name || user?.roleDoc?.name || '').toLowerCase();
}

function notifyStaff(req, action = 'updated', userId) {
  const io = req.app.get('io');
  if (io) io.emit('staff:update', { at: Date.now() });
  rt.userCrud(action, userId || '');
}

function modulePermissionsToMap(input) {
  const m = new Map();
  if (!input || typeof input !== 'object') return m;
  Object.keys(input).forEach((moduleName) => {
    if (!MODULES[moduleName]) return;
    const raw = input[moduleName];
    const actions = Array.isArray(raw) ? raw : [raw];
    const validActions = actions.filter((a) => MODULES[moduleName].actions.includes(a));
    if (validActions.length > 0) m.set(moduleName, validActions);
  });
  return m;
}

/** Mongoose Map replacement is not always detected — always markModified after assign. */
function setUserModulePermissions(user, inputOrMap) {
  const next =
    inputOrMap instanceof Map ? inputOrMap : modulePermissionsToMap(inputOrMap);
  user.modulePermissions = next;
  user.markModified('modulePermissions');
  return next;
}

function serializeUser(user) {
  const o = user.toObject ? user.toObject({ flattenMaps: true }) : { ...user };
  if (o.modulePermissions instanceof Map) {
    o.modulePermissions = Object.fromEntries(o.modulePermissions);
  }
  if (o.modulePermissions && typeof o.modulePermissions === 'object' && !Array.isArray(o.modulePermissions)) {
    o.modulePermissions = expandModulePermissions(o.modulePermissions);
  } else if (!o.modulePermissions) {
    o.modulePermissions = {};
  }
  return o;
}

function serializeLinkedStudent(student) {
  const classId =
    student.classId && typeof student.classId === 'object'
      ? student.classId._id
      : student.classId;
  const sectionId =
    student.sectionId && typeof student.sectionId === 'object'
      ? student.sectionId._id
      : student.sectionId;
  return {
    _id: student._id,
    studentId: student.studentId,
    studentName: student.studentName,
    classId: classId ? String(classId) : null,
    sectionId: sectionId ? String(sectionId) : null,
    className: student.classId?.className || null,
    sectionName: student.sectionId?.sectionName || null,
    status: student.status,
  };
}

async function fetchLinkedStudentsByParentEmails(emails) {
  const normalized = [
    ...new Set(
      emails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)
    ),
  ];
  if (!normalized.length) return new Map();

  const { sortStudentsByRollAsc } = require('../utils/academyStudentSort');
  const students = sortStudentsByRollAsc(
    await AcademyStudent.find({ guardianEmail: { $in: normalized } })
      .select('_id studentId rollNumber studentName guardianEmail classId sectionId status')
      .populate('classId', 'className')
      .populate('sectionId', 'sectionName')
      .lean()
  );

  const byEmail = new Map();
  students.forEach((s) => {
    const email = String(s.guardianEmail || '').trim().toLowerCase();
    if (!email) return;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(serializeLinkedStudent(s));
  });
  return byEmail;
}

async function attachLinkedStudentsToUsers(users) {
  const parentEmails = users
    .filter((u) => u.role?.name?.toLowerCase?.() === 'parent')
    .map((u) => u.email);
  const linksByEmail = await fetchLinkedStudentsByParentEmails(parentEmails);
  return users.map((u) => {
    if (u.role?.name?.toLowerCase?.() !== 'parent') return u;
    const email = String(u.email || '').trim().toLowerCase();
    return { ...u, linkedStudents: linksByEmail.get(email) || [] };
  });
}

const listModuleRegistry = catchAsync(async (req, res) => {
  // Hide coming-soon modules from Permissions / Users grant UI
  const modules = getSystemModulesForApi({ forPermissions: true }).map((m) => ({
    key: m.key,
    name: m.label,
    description: m.description,
    actions: m.actions,
    parentGroup: m.parentGroup || null,
  }));
  res.json({ success: true, data: { modules } });
});

const listUsers = catchAsync(async (req, res) => {
  const staffOnly = req.query.staff === 'true' || req.query.staff === '1';
  const scope = String(req.query.scope || '').toLowerCase().trim();
  const users = await User.find().populate('role').populate('permissions').sort({ createdAt: -1 });
  let list = users;
  let attachParents = true;

  const roleName = (u) => u.role?.name?.toLowerCase?.() || '';

  const scopedModule = accountModuleForListScope(staffOnly ? 'staff' : scope);
  if (scopedModule) {
    assertAccountAction(req.user, scopedModule, 'view', 'listing these accounts');
  } else if (!isSystemAdmin(req.user) && !hasAnyAccountModulePermission(req.user, 'view')) {
    throw new ApiError(403, 'You do not have permission for listing accounts');
  }

  if (staffOnly || scope === 'staff') {
    list = users.filter((u) => {
      const n = roleName(u);
      return n === 'teacher' || n === 'accountant';
    });
    attachParents = false;
  } else if (scope === 'parents' || scope === 'parent') {
    list = users.filter((u) => roleName(u) === 'parent');
  } else if (scope === 'admins' || scope === 'admin') {
    list = users.filter((u) => roleName(u) === 'admin');
    attachParents = false;
  } else if (!isSystemAdmin(req.user)) {
    // Unscoped list (e.g. Permissions screen): only roles the caller can manage.
    const { collectPermissionNames } = require('../middleware/permissions');
    const fullLegacy = collectPermissionNames(req.user).has('manage_users');
    if (!fullLegacy) {
      const canParent = hasAccountModulePermission(req.user, 'parentUsers', 'view');
      const canStaff = hasAccountModulePermission(req.user, 'staffUsers', 'view');
      const canAdmin = hasAccountModulePermission(req.user, 'adminUsers', 'view');
      list = users.filter((u) => {
        const n = roleName(u);
        if (n === 'parent') return canParent;
        if (n === 'teacher' || n === 'accountant') return canStaff;
        if (n === 'admin') return canAdmin;
        return false;
      });
      attachParents = canParent;
    }
  }

  const serialized = list.map(serializeUser);
  const data = attachParents ? await attachLinkedStudentsToUsers(serialized) : serialized;
  res.json({ success: true, data });
});

const getParentStudents = catchAsync(async (req, res) => {
  assertAccountAction(req.user, 'parentUsers', 'view', 'viewing parent accounts');
  const user = await User.findById(req.params.id).populate('role');
  if (!user) throw new ApiError(404, 'User not found');
  if (!user.role || user.role.name !== 'parent') throw new ApiError(400, 'User is not a parent');

  const students = await AcademyStudent.find({
    guardianEmail: String(user.email || '').trim().toLowerCase(),
  })
    .select('_id studentId studentName fatherName classId sectionId status')
    .populate('classId', 'className')
    .populate('sectionId', 'sectionName')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: students.map((s) => serializeLinkedStudent(s.toObject ? s.toObject() : s)),
  });
});

const patchParentStudents = catchAsync(async (req, res) => {
  assertAccountAction(req.user, 'parentUsers', 'edit', 'editing parent accounts');
  const { studentIds } = req.body;

  const user = await User.findById(req.params.id).populate('role');
  if (!user) throw new ApiError(404, 'User not found');
  if (!user.role || user.role.name !== 'parent') throw new ApiError(400, 'User is not a parent');

  const email = String(user.email || '').trim().toLowerCase();
  if (!email) throw new ApiError(400, 'Parent email missing');

  // Clear existing mapping for this parent email, then set the new selection.
  await AcademyStudent.updateMany(
    { guardianEmail: email },
    { $unset: { guardianEmail: '' } }
  );

  if (Array.isArray(studentIds) && studentIds.length > 0) {
    await AcademyStudent.updateMany(
      { _id: { $in: studentIds } },
      { guardianEmail: email, guardianName: user.name }
    );
  }

  const students = await AcademyStudent.find({ guardianEmail: email })
    .select('_id studentId studentName fatherName classId sectionId status')
    .populate('classId', 'className')
    .populate('sectionId', 'sectionName')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: students.map((s) => serializeLinkedStudent(s.toObject ? s.toObject() : s)),
  });
});

const createUser = catchAsync(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    role,
    permissionIds,
    modulePermissions,
    isActive,
    profileImage,
    salary,
    payType,
    salaryPercentage,
  } = req.body;
  const exists = await User.findOne({ email });
  if (exists) throw new ApiError(409, 'Email already in use');
  const hash = await bcrypt.hash(password, 12);
  // Only fall back to role defaults when the client omitted the field entirely.
  // An explicit `{}` / partial matrix from Users/Permissions must be respected.
  const modulePermissionsProvided = Object.prototype.hasOwnProperty.call(
    req.body,
    'modulePermissions',
  );
  let userModulePerms = modulePermissionsToMap(modulePermissions);

  const resolvedPayType = payType === 'percentage' ? 'percentage' : 'fixed';
  const resolvedSalary =
    typeof salary === 'number' && !Number.isNaN(salary) ? Math.max(0, salary) : 0;
  const resolvedPct =
    typeof salaryPercentage === 'number' && !Number.isNaN(salaryPercentage)
      ? Math.min(100, Math.max(0, salaryPercentage))
      : 0;

  const Role = require('../models/Role');
  const roleDoc = await Role.findById(role);
  const roleName = String(roleDoc?.name || '').toLowerCase();
  if (roleName === 'student') {
    throw new ApiError(400, 'Student portal logins are disabled. Create a parent user instead.');
  }
  const createModule = accountModuleForRoleName(roleName);
  assertAccountAction(req.user, createModule, 'create', `creating ${roleName || 'user'} accounts`);

  // New teachers / accountants / parents inherit role defaults when none provided.
  // Secondary admins keep the request matrix (or empty) — they never inherit full admin-role access.
  if (
    (roleName === 'teacher' || roleName === 'accountant' || roleName === 'parent') &&
    !modulePermissionsProvided
  ) {
    if (roleName === 'teacher') {
      const { teacherModulePermissionsMap } = require('../config/teacherDefaults');
      userModulePerms =
        roleDoc?.modulePermissions instanceof Map && roleDoc.modulePermissions.size > 0
          ? new Map(roleDoc.modulePermissions)
          : teacherModulePermissionsMap();
    } else if (roleName === 'accountant') {
      const { accountantModulePermissionsMap } = require('../config/accountantDefaults');
      userModulePerms =
        roleDoc?.modulePermissions instanceof Map && roleDoc.modulePermissions.size > 0
          ? new Map(roleDoc.modulePermissions)
          : accountantModulePermissionsMap();
    } else if (roleName === 'parent') {
      userModulePerms =
        roleDoc?.modulePermissions instanceof Map && roleDoc.modulePermissions.size > 0
          ? new Map(roleDoc.modulePermissions)
          : new Map(
              Object.entries({
                student: ['view'],
                attendance: ['view'],
                examTests: ['view'],
                examTerm: ['view'],
                examDateSheet: ['view'],
                examReportCard: ['view'],
                timetableBuilder: ['view'],
                timetableBoard: ['view'],
                timetableView: ['view'],
                chat: ['view', 'create', 'participate'],
                announcement: ['view'],
              })
            );
    }
  }

  if (roleName === 'admin') {
    const newEmail = String(email || '').toLowerCase().trim();
    if (newEmail === seedAdminEmail()) {
      throw new ApiError(400, 'Cannot create another account with the system admin email.');
    }
    // Ensure Map exists so secondary admins always use dynamic permissions (not role full-access).
    if (!userModulePerms) userModulePerms = new Map();
  }

  const user = await User.create({
    name,
    email,
    password: hash,
    phone,
    role,
    permissions: permissionIds || roleDoc?.permissions || [],
    modulePermissions: userModulePerms,
    isActive: typeof isActive === 'boolean' ? isActive : true,
    payType: resolvedPayType,
    salary: resolvedPayType === 'fixed' ? resolvedSalary : 0,
    salaryPercentage: resolvedPayType === 'percentage' ? resolvedPct : 0,
    ...(profileImage ? { profileImage } : {}),
    createdBy: req.user._id,
  });

  await user.populate('role');
  await user.populate('permissions');
  notifyStaff(req);
  res.status(201).json({ success: true, data: serializeUser(user) });
});

const updateUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id).populate('role');
  if (!user) throw new ApiError(404, 'User not found');

  const {
    name,
    email,
    phone,
    role,
    isActive,
    fcmToken,
    password,
    profileImage,
    salary,
    payType,
    salaryPercentage,
    modulePermissions,
  } = req.body;

  const targetIsSystemAdmin = isSystemAdmin(user);
  const currentRoleName = roleNameFromUserDoc(user);
  assertAccountAction(
    req.user,
    accountModuleForRoleName(currentRoleName),
    'edit',
    `editing ${currentRoleName || 'user'} accounts`,
  );

  if (name !== undefined) user.name = name;
  if (email !== undefined) {
    if (targetIsSystemAdmin && String(email).toLowerCase().trim() !== seedAdminEmail()) {
      throw new ApiError(400, 'Cannot change the system admin email.');
    }
    user.email = email;
  }
  if (phone !== undefined) user.phone = phone;
  if (role !== undefined) {
    if (targetIsSystemAdmin) {
      throw new ApiError(400, 'Cannot change the system admin role.');
    }
    const Role = require('../models/Role');
    const nextRole = await Role.findById(role);
    const nextRoleName = String(nextRole?.name || '').toLowerCase();
    const nextModule = accountModuleForRoleName(nextRoleName);
    if (nextModule !== accountModuleForRoleName(currentRoleName)) {
      assertAccountAction(req.user, nextModule, 'create', `moving accounts to ${nextRoleName || 'role'}`);
    }
    user.role = role;
  }
  if (typeof isActive === 'boolean') {
    if (targetIsSystemAdmin && isActive === false) {
      throw new ApiError(400, 'Cannot deactivate the system admin account.');
    }
    user.isActive = isActive;
  }
  if (fcmToken !== undefined) user.fcmToken = fcmToken;
  if (profileImage !== undefined) user.profileImage = profileImage;
  if (payType === 'fixed' || payType === 'percentage') {
    user.payType = payType;
  }
  if (typeof salary === 'number' && !Number.isNaN(salary)) {
    user.salary = Math.max(0, salary);
  }
  if (typeof salaryPercentage === 'number' && !Number.isNaN(salaryPercentage)) {
    user.salaryPercentage = Math.min(100, Math.max(0, salaryPercentage));
  }
  // Keep fields consistent with the active pay type.
  if (user.payType === 'percentage') {
    user.salary = 0;
  } else {
    user.payType = 'fixed';
    user.salaryPercentage = 0;
  }
  if (password) {
    user.password = await bcrypt.hash(password, 12);
  }
  // System admin access is always full at runtime — ignore matrix edits that could confuse operators.
  if (
    !targetIsSystemAdmin &&
    modulePermissions !== undefined &&
    typeof modulePermissions === 'object'
  ) {
    setUserModulePermissions(user, modulePermissions);
  }

  const shouldRefreshSalaries =
    payType === 'percentage' ||
    payType === 'fixed' ||
    typeof salaryPercentage === 'number';

  await user.save();

  // Unpaid percentage vouchers use this teacher's % — refresh when rate/pay type changes.
  if (shouldRefreshSalaries) {
    try {
      const {
        recalculateUnpaidPercentageSalariesForStaff,
      } = require('../services/academy/academySalaryService');
      await recalculateUnpaidPercentageSalariesForStaff(user._id, req.user._id);
      const rt = require('../services/realtime/academyRealtime');
      rt.salaryCrud('updated', 'batch');
    } catch (err) {
      console.error('[salary] Failed to refresh unpaid salaries after staff % change:', err);
    }
  }

  const populatedUser = await User.findById(user._id).populate('role').populate('permissions');
  notifyStaff(req);
  res.json({ success: true, data: serializeUser(populatedUser) });
});

const uploadProfilePhoto = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Image file required');
  const user = await User.findById(req.params.id).populate('role');
  if (!user) throw new ApiError(404, 'User not found');
  assertAccountAction(
    req.user,
    accountModuleForRoleName(roleNameFromUserDoc(user)),
    'edit',
    'updating profile photos',
  );

  const uploadDir = path.join(__dirname, '../../uploads/staff');
  fs.mkdirSync(uploadDir, { recursive: true });
  const ext = path.extname(req.file.originalname) || '.jpg';
  const filename = `${req.params.id}-${Date.now()}${ext}`;
  const dest = path.join(uploadDir, filename);
  fs.writeFileSync(dest, req.file.buffer);

  user.profileImage = `/uploads/staff/${filename}`;
  await user.save();
  const populatedUser = await User.findById(user._id).populate('role').populate('permissions');
  notifyStaff(req);
  res.json({ success: true, data: serializeUser(populatedUser) });
});

const patchPermissions = catchAsync(async (req, res) => {
  const { permissionIds } = req.body;
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { permissions: permissionIds },
    { new: true }
  )
    .populate('role')
    .populate('permissions');
  if (!user) throw new ApiError(404, 'User not found');
  notifyStaff(req);
  res.json({ success: true, data: serializeUser(user) });
});

const patchModulePermissions = catchAsync(async (req, res) => {
  const { moduleName, actions } = req.body;

  if (!moduleName || !Array.isArray(actions)) {
    throw new ApiError(400, 'moduleName and actions array required');
  }

  if (!MODULES[moduleName]) {
    throw new ApiError(400, `Invalid module: ${moduleName}`);
  }

  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (isSystemAdmin(user)) {
    throw new ApiError(400, 'System admin permissions cannot be changed.');
  }

  const validActions = actions.filter((a) => MODULES[moduleName].actions.includes(a));

  const modulePerms = user.modulePermissions || new Map();
  if (validActions.length > 0) {
    modulePerms.set(moduleName, validActions);
  } else {
    modulePerms.delete(moduleName);
  }

  setUserModulePermissions(user, modulePerms);
  await user.save();

  const updatedUser = await User.findById(user._id).populate('role').populate('permissions');
  notifyStaff(req);
  res.json({ success: true, data: serializeUser(updatedUser) });
});

const revokeModulePermissions = catchAsync(async (req, res) => {
  const { moduleName } = req.body;

  if (!moduleName) {
    throw new ApiError(400, 'moduleName required');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (isSystemAdmin(user)) {
    throw new ApiError(400, 'System admin permissions cannot be changed.');
  }

  const modulePerms = user.modulePermissions || new Map();
  modulePerms.delete(moduleName);
  setUserModulePermissions(user, modulePerms);
  await user.save();

  const updatedUser = await User.findById(user._id).populate('role').populate('permissions');
  notifyStaff(req);
  res.json({ success: true, data: serializeUser(updatedUser) });
});

const deleteUser = catchAsync(async (req, res) => {
  const targetId = String(req.params.id || '');
  if (!targetId) throw new ApiError(400, 'User id required');
  if (String(req.user._id) === targetId) {
    throw new ApiError(400, 'You cannot delete your own account.');
  }

  const user = await User.findById(targetId).populate('role');
  if (!user) throw new ApiError(404, 'User not found');

  if (isSystemAdmin(user)) {
    throw new ApiError(400, 'Cannot delete the system admin account.');
  }

  const roleName = String(user.role?.name || '').toLowerCase();
  assertAccountAction(
    req.user,
    accountModuleForRoleName(roleName),
    'delete',
    `deleting ${roleName || 'user'} accounts`,
  );
  if (roleName === 'admin') {
    const adminCount = await User.countDocuments({
      role: user.role._id,
      _id: { $ne: user._id },
      isActive: true,
    });
    if (adminCount === 0) {
      throw new ApiError(400, 'Cannot delete the last active admin account.');
    }
  }

  await User.findByIdAndDelete(user._id);
  notifyStaff(req, 'deleted', String(user._id));
  res.json({ success: true, data: { deleted: true, id: String(user._id) } });
});

const DEFAULT_RESET_PASSWORD = 'Concept@1234';

const bulkUsers = catchAsync(async (req, res) => {
  const action = String(req.body.action || '');
  const ids = [...new Set((req.body.ids || []).map((id) => String(id)))];
  if (!ids.length) throw new ApiError(400, 'Select at least one account');

  const neededAction = action === 'delete' ? 'delete' : 'edit';
  if (!isSystemAdmin(req.user) && !hasAnyAccountModulePermission(req.user, neededAction)) {
    throw new ApiError(403, `You do not have permission to ${action} accounts`);
  }

  const resetPassword =
    action === 'resetPassword'
      ? String(req.body.password || DEFAULT_RESET_PASSWORD).trim() || DEFAULT_RESET_PASSWORD
      : null;
  if (action === 'resetPassword' && resetPassword.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }
  const passwordHash =
    action === 'resetPassword' ? await bcrypt.hash(resetPassword, 12) : null;

  const selfId = String(req.user._id);
  const results = { processed: 0, skipped: 0, failed: [] };

  for (const id of ids) {
    try {
      if (id === selfId && (action === 'delete' || action === 'deactivate')) {
        results.failed.push({ id, reason: 'You cannot modify your own account this way' });
        continue;
      }

      const user = await User.findById(id).populate('role');
      if (!user) {
        results.failed.push({ id, reason: 'User not found' });
        continue;
      }
      if (isSystemAdmin(user)) {
        results.failed.push({ id, reason: 'System admin is protected' });
        continue;
      }

      const roleName = roleNameFromUserDoc(user);
      const moduleName = accountModuleForRoleName(roleName);
      assertAccountAction(
        req.user,
        moduleName,
        neededAction,
        `${action} ${roleName || 'user'} accounts`,
      );

      if (action === 'activate') {
        user.isActive = true;
        await user.save();
        results.processed += 1;
      } else if (action === 'deactivate') {
        if (roleName === 'admin') {
          const adminCount = await User.countDocuments({
            role: user.role._id,
            _id: { $ne: user._id },
            isActive: true,
          });
          if (adminCount === 0) {
            results.failed.push({ id, reason: 'Cannot deactivate the last active admin' });
            continue;
          }
        }
        user.isActive = false;
        await user.save();
        results.processed += 1;
      } else if (action === 'resetPassword') {
        user.password = passwordHash;
        await user.save();
        results.processed += 1;
      } else if (action === 'delete') {
        if (roleName === 'admin') {
          const adminCount = await User.countDocuments({
            role: user.role._id,
            _id: { $ne: user._id },
            isActive: true,
          });
          if (adminCount === 0) {
            results.failed.push({ id, reason: 'Cannot delete the last active admin' });
            continue;
          }
        }
        await User.findByIdAndDelete(user._id);
        results.processed += 1;
      } else {
        results.failed.push({ id, reason: 'Unknown action' });
      }
    } catch (err) {
      results.failed.push({ id, reason: err.message || 'Failed' });
    }
  }

  notifyStaff(req, action === 'delete' ? 'deleted' : 'updated');
  res.json({
    success: true,
    data: {
      ...results,
      action,
      ...(action === 'resetPassword' ? { password: resetPassword } : {}),
    },
  });
});

module.exports = {
  listUsers,
  listModuleRegistry,
  createUser,
  updateUser,
  deleteUser,
  bulkUsers,
  uploadProfilePhoto,
  patchPermissions,
  patchModulePermissions,
  revokeModulePermissions,
  getParentStudents,
  patchParentStudents,
};
