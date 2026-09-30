const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const AcademyStudent = require('../models/academy/AcademyStudent');
const { MODULES } = require('../modules');
const { getSystemModulesForApi } = require('../config/systemModules');
const rt = require('../services/realtime/academyRealtime');

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

function serializeUser(user) {
  const o = user.toObject ? user.toObject({ flattenMaps: true }) : { ...user };
  if (o.modulePermissions instanceof Map) {
    o.modulePermissions = Object.fromEntries(o.modulePermissions);
  }
  if (o.modulePermissions && typeof o.modulePermissions === 'object' && !Array.isArray(o.modulePermissions)) {
    /* already plain */
  } else if (!o.modulePermissions) {
    o.modulePermissions = {};
  }
  return o;
}

function serializeLinkedStudent(student) {
  return {
    _id: student._id,
    studentId: student.studentId,
    studentName: student.studentName,
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

  const students = await AcademyStudent.find({ guardianEmail: { $in: normalized } })
    .select('_id studentId studentName guardianEmail classId sectionId status')
    .populate('classId', 'className')
    .populate('sectionId', 'sectionName')
    .sort({ studentName: 1 })
    .lean();

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
  const modules = getSystemModulesForApi().map((m) => ({
    key: m.key,
    name: m.label,
    description: m.description,
    actions: m.actions,
  }));
  res.json({ success: true, data: { modules } });
});

const listUsers = catchAsync(async (req, res) => {
  const staffOnly = req.query.staff === 'true' || req.query.staff === '1';
  const users = await User.find().populate('role').populate('permissions').sort({ createdAt: -1 });
  let list = users;
  if (staffOnly) {
    list = users.filter((u) => {
      const n = u.role?.name?.toLowerCase?.();
      return n === 'teacher' || n === 'accountant';
    });
  }
  const serialized = list.map(serializeUser);
  const data = staffOnly ? serialized : await attachLinkedStudentsToUsers(serialized);
  res.json({ success: true, data });
});

const getParentStudents = catchAsync(async (req, res) => {
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
  } = req.body;
  const exists = await User.findOne({ email });
  if (exists) throw new ApiError(409, 'Email already in use');
  const hash = await bcrypt.hash(password, 12);
  let userModulePerms = modulePermissionsToMap(modulePermissions);

  const Role = require('../models/Role');
  const roleDoc = await Role.findById(role);
  const roleName = String(roleDoc?.name || '').toLowerCase();
  if (roleName === 'student') {
    throw new ApiError(400, 'Student portal logins are disabled. Create a parent user instead.');
  }

  // New teachers / accountants / parents inherit role defaults when none provided.
  if (
    (roleName === 'teacher' || roleName === 'accountant' || roleName === 'parent') &&
    (!userModulePerms || userModulePerms.size === 0)
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
                exam: ['view'],
                timetable: ['view'],
                chat: ['view', 'create', 'participate'],
                announcement: ['view'],
              })
            );
    }
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
    salary: typeof salary === 'number' && !Number.isNaN(salary) ? Math.max(0, salary) : 0,
    ...(profileImage ? { profileImage } : {}),
    createdBy: req.user._id,
  });

  await user.populate('role');
  await user.populate('permissions');
  notifyStaff(req);
  res.status(201).json({ success: true, data: serializeUser(user) });
});

const updateUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
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
    modulePermissions,
  } = req.body;

  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (phone !== undefined) user.phone = phone;
  if (role !== undefined) user.role = role;
  if (typeof isActive === 'boolean') user.isActive = isActive;
  if (fcmToken !== undefined) user.fcmToken = fcmToken;
  if (profileImage !== undefined) user.profileImage = profileImage;
  if (typeof salary === 'number' && !Number.isNaN(salary)) user.salary = Math.max(0, salary);
  if (password) {
    user.password = await bcrypt.hash(password, 12);
  }
  if (modulePermissions !== undefined && typeof modulePermissions === 'object') {
    user.modulePermissions = modulePermissionsToMap(modulePermissions);
  }

  await user.save();
  const populatedUser = await User.findById(user._id).populate('role').populate('permissions');
  notifyStaff(req);
  res.json({ success: true, data: serializeUser(populatedUser) });
});

const uploadProfilePhoto = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Image file required');
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');

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

  const validActions = actions.filter((a) => MODULES[moduleName].actions.includes(a));

  const modulePerms = user.modulePermissions || new Map();
  if (validActions.length > 0) {
    modulePerms.set(moduleName, validActions);
  } else {
    modulePerms.delete(moduleName);
  }

  user.modulePermissions = modulePerms;
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

  const modulePerms = user.modulePermissions || new Map();
  modulePerms.delete(moduleName);
  user.modulePermissions = modulePerms;
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

  const roleName = String(user.role?.name || '').toLowerCase();
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

module.exports = {
  listUsers,
  listModuleRegistry,
  createUser,
  updateUser,
  deleteUser,
  uploadProfilePhoto,
  patchPermissions,
  patchModulePermissions,
  revokeModulePermissions,
  getParentStudents,
  patchParentStudents,
};
