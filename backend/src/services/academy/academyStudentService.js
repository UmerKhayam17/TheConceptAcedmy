const fs = require('fs');
const path = require('path');
const ApiError = require('../../utils/ApiError');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyFeeRecord = require('../../models/academy/AcademyFeeRecord');
const AcademySection = require('../../models/academy/AcademySection');
const User = require('../../models/User');
const Role = require('../../models/Role');
const bcrypt = require('bcryptjs');
const {
  getByClass,
  calculateFeesWithDiscount,
} = require('./academyFeeStructureService');
const { createEnrollmentFeeVouchers } = require('./academyFeeService');
const { validateEnrollmentSubjects } = require('./academyEnrollmentSubjectService');
const { resolveEnrollmentDiscipline } = require('./academyDisciplineService');
const { generateAcademyRollNumber, generateTemporaryRollNumber } = require('../../utils/academyRollNumber');
const { generateRegistrationNumber } = require('../../utils/academyRegistrationNumber');

const STUDENT_PHOTO_DIR = path.join(__dirname, '../../../uploads/students');

/** Default parent portal password for all auto-created parent logins. */
const DEFAULT_PARENT_PASSWORD = 'Concept@1234';
const PARENT_EMAIL_DOMAIN = 'concept.edu.pk';

/** Matches frontend PARENT_DEFAULT_MODULE_PERMISSIONS / seeded parent role. */
const PARENT_DEFAULT_MODULE_PERMISSIONS = {
  student: ['view'],
  attendance: ['view'],
  exam: ['view'],
  timetable: ['view'],
  chat: ['view', 'create', 'participate'],
  announcement: ['view'],
};

function parentModulePermissionsMap() {
  return new Map(Object.entries(PARENT_DEFAULT_MODULE_PERMISSIONS));
}

function sanitizeEmailLocalPart(value) {
  return (
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 48) || 'student'
  );
}

/** e.g. sohaib.tces2026000002@concept.edu.pk — unique even when names match. */
function buildParentPortalEmail(studentName, studentId) {
  const namePart = sanitizeEmailLocalPart(studentName);
  const idPart = sanitizeEmailLocalPart(studentId);
  return `${namePart}.${idPart}@${PARENT_EMAIL_DOMAIN}`;
}

/**
 * Create (or reuse) a parent User for portal login. No student User is created.
 * Links via guardianEmail === parent email (parentScope).
 */
async function ensureParentPortalUser({
  studentName,
  fatherName,
  guardianName,
  phone,
  studentId,
  resetPassword = false,
}) {
  const parentRole = await Role.findOne({ name: 'parent' });
  if (!parentRole) throw new ApiError(500, 'Roles not initialized');

  const parentEmail = buildParentPortalEmail(studentName, studentId);
  const parentPassword = DEFAULT_PARENT_PASSWORD;
  const parentName =
    (guardianName && String(guardianName).trim()) ||
    (fatherName && String(fatherName).trim()) ||
    `${String(studentName || '').trim()} Parent`;

  let parentUser = await User.findOne({ email: parentEmail });
  let created = false;
  if (!parentUser) {
    parentUser = await User.create({
      name: parentName,
      email: parentEmail,
      phone: phone || '',
      password: await bcrypt.hash(parentPassword, 12),
      role: parentRole._id,
      isActive: true,
      modulePermissions: parentModulePermissionsMap(),
    });
    created = true;
  } else {
    let dirty = false;
    if (resetPassword) {
      parentUser.password = await bcrypt.hash(parentPassword, 12);
      dirty = true;
    }
    // Drop fee from parent accounts; ensure exam (test results) view remains.
    const perms = parentUser.modulePermissions;
    const asMap =
      perms instanceof Map
        ? new Map(perms)
        : new Map(Object.entries(perms && typeof perms === 'object' ? perms : {}));
    let changed = false;
    if (asMap.has('fee')) {
      asMap.delete('fee');
      changed = true;
    }
    if (!asMap.has('exam')) {
      asMap.set('exam', ['view']);
      changed = true;
    }
    if (asMap.size === 0) {
      parentUser.modulePermissions = parentModulePermissionsMap();
      dirty = true;
    } else if (changed) {
      parentUser.modulePermissions = asMap;
      dirty = true;
    }
    if (phone && !parentUser.phone) {
      parentUser.phone = phone;
      dirty = true;
    }
    if (dirty) await parentUser.save();
  }

  return { parentUser, parentEmail, parentPassword, created };
}

function saveStudentPhotoFile(studentMongoId, file) {
  if (!file?.buffer?.length) throw new ApiError(400, 'Image file required');
  fs.mkdirSync(STUDENT_PHOTO_DIR, { recursive: true });
  const ext = path.extname(file.originalname || '') || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase()) ? ext : '.jpg';
  const filename = `${studentMongoId}-${Date.now()}${safeExt}`;
  const dest = path.join(STUDENT_PHOTO_DIR, filename);
  fs.writeFileSync(dest, file.buffer);
  return `/uploads/students/${filename}`;
}

async function generateStudentId() {
  const year = new Date().getFullYear();
  const prefix = `TCES-${year}-`;
  const last = await AcademyStudent.findOne({ studentId: new RegExp(`^${prefix}`) })
    .sort({ studentId: -1 })
    .select('studentId');
  let seq = 1;
  if (last?.studentId) {
    const part = last.studentId.split('-').pop();
    const n = parseInt(part, 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

function normalizeAcademicHistory(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && (r.institutionName || r.className || r.year))
    .map((r) => ({
      institutionName: (r.institutionName || '').trim(),
      className: (r.className || '').trim(),
      totalMarks: r.totalMarks != null && r.totalMarks !== '' ? Number(r.totalMarks) : undefined,
      obtainedMarks: r.obtainedMarks != null && r.obtainedMarks !== '' ? Number(r.obtainedMarks) : undefined,
      percentage: r.percentage != null && r.percentage !== '' ? Number(r.percentage) : undefined,
      year: (r.year || '').trim(),
    }));
}

function pickStudentProfile(payload) {
  const postal = payload.postalAddress?.trim() || payload.address?.trim() || '';
  return {
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined,
    nationality: (payload.nationality || 'Pakistan').trim(),
    guardianName: payload.guardianName?.trim() || '',
    guardianRelation: payload.guardianRelation?.trim() || '',
    fatherGuardianCnic: payload.fatherGuardianCnic?.trim() || '',
    guardianOccupation: payload.guardianOccupation?.trim() || '',
    guardianWorkAddress: payload.guardianWorkAddress?.trim() || '',
    guardianEmail: payload.guardianEmail?.trim()?.toLowerCase() || '',
    studentEmail: payload.studentEmail?.trim() || '',
    postalAddress: postal,
    address: postal,
    contactPhoneRes: payload.contactPhoneRes?.trim() || '',
    permanentAddress: payload.permanentAddress?.trim() || '',
    currentSchoolCollege: payload.currentSchoolCollege?.trim() || '',
    academicHistory: normalizeAcademicHistory(payload.academicHistory),
  };
}

function applyProfileToStudent(student, payload) {
  const profile = pickStudentProfile(payload);
  if (payload.dateOfBirth !== undefined) student.dateOfBirth = profile.dateOfBirth;
  if (payload.nationality !== undefined) student.nationality = profile.nationality;
  if (payload.guardianName !== undefined) student.guardianName = profile.guardianName;
  if (payload.guardianRelation !== undefined) student.guardianRelation = profile.guardianRelation;
  if (payload.fatherGuardianCnic !== undefined) student.fatherGuardianCnic = profile.fatherGuardianCnic;
  if (payload.guardianOccupation !== undefined) student.guardianOccupation = profile.guardianOccupation;
  if (payload.guardianWorkAddress !== undefined) student.guardianWorkAddress = profile.guardianWorkAddress;
  if (payload.guardianEmail !== undefined) student.guardianEmail = profile.guardianEmail;
  if (payload.studentEmail !== undefined) student.studentEmail = profile.studentEmail;
  if (payload.postalAddress !== undefined || payload.address !== undefined) {
    student.postalAddress = profile.postalAddress;
    student.address = profile.postalAddress;
  }
  if (payload.contactPhoneRes !== undefined) student.contactPhoneRes = profile.contactPhoneRes;
  if (payload.permanentAddress !== undefined) student.permanentAddress = profile.permanentAddress;
  if (payload.currentSchoolCollege !== undefined) student.currentSchoolCollege = profile.currentSchoolCollege;
  if (payload.academicHistory !== undefined) student.academicHistory = profile.academicHistory;
}

async function validateSubjects(classId, sectionId, subjectIds, isFullPackage, disciplineId) {
  return validateEnrollmentSubjects(classId, sectionId, subjectIds, isFullPackage, disciplineId);
}

async function registerStudent(payload, userId) {
  const cls = await AcademyClass.findById(payload.classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (cls.status !== 'active') throw new ApiError(400, 'Class is not active');

  const feeStructure = await getByClass(payload.classId);
  if (!feeStructure) throw new ApiError(400, 'Configure fee structure for this class first');

  const isFullPackage = Boolean(payload.isFullPackage);
  const section = await AcademySection.findById(payload.sectionId);
  if (!section) throw new ApiError(404, 'Section not found');
  if (section.status !== 'active') throw new ApiError(400, 'Section is not active');
  if (String(section.classId) !== String(payload.classId)) {
    throw new ApiError(400, 'Section does not belong to this class');
  }
  if (!cls.sessionId) {
    throw new ApiError(400, 'Class must belong to an academic session before enrolling students');
  }

  const disciplineId = await resolveEnrollmentDiscipline(payload.classId, payload.disciplineId);
  const subjectIds = await validateSubjects(
    payload.classId,
    payload.sectionId,
    payload.selectedSubjects,
    isFullPackage,
    disciplineId
  );

  const fees = calculateFeesWithDiscount(feeStructure, {
    selectedSubjectIds: subjectIds,
    isFullPackage,
    monthlyFeeDiscount: payload.monthlyFeeDiscount,
    admissionFeeDiscount: payload.admissionFeeDiscount,
    discountAmount: payload.discountAmount,
  });

  const studentId = await generateStudentId();
  const phone = (payload.phone || payload.mobileNo || '').trim();
  const profile = pickStudentProfile(payload);

  // Create (or update) the parent login account for the guardian email.
  // This enables parents to login and view their child's progress pages.
  const parentRole = await Role.findOne({ name: 'parent' });
  if (!parentRole) throw new ApiError(500, 'Roles not initialized');

  const parentEmail = (payload.guardianEmail || '').trim().toLowerCase();
  const parentPassword = payload.parentPassword;
  const parentName = payload.guardianName?.trim() || payload.fatherName?.trim() || 'Parent';

  let parentUser = await User.findOne({ email: parentEmail });
  if (!parentUser) {
    parentUser = await User.create({
      name: parentName,
      email: parentEmail,
      phone,
      password: await bcrypt.hash(parentPassword, 12),
      role: parentRole._id,
    });
  } else {
    parentUser.name = parentName || parentUser.name;
    parentUser.phone = phone || parentUser.phone;
    if (parentPassword) {
      parentUser.password = await bcrypt.hash(parentPassword, 12);
    }
    await parentUser.save();
  }

  const student = await AcademyStudent.create({
    studentId,
    studentName: payload.studentName.trim(),
    fatherName: payload.fatherName.trim(),
    phone,
    gender: payload.gender,
    ...profile,
    classId: payload.classId,
    sectionId: payload.sectionId,
    disciplineId: disciplineId || undefined,
    selectedSubjects: subjectIds,
    isFullPackage,
    ...fees,
    feeStructureId: feeStructure._id,
    status: payload.status || 'active',
    createdBy: userId,
  });

  const now = new Date();
  await createEnrollmentFeeVouchers(student, fees, userId, { asOf: now });

  return student.populate([
    { path: 'classId', select: 'className' },
    { path: 'disciplineId', select: 'name code' },
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);
}

async function updateStudent(id, payload) {
  const student = await AcademyStudent.findById(id);
  if (!student) throw new ApiError(404, 'Student not found');

  if (student.status === 'pending_fee') {
    if (payload.studentName) student.studentName = payload.studentName.trim();
    if (payload.fatherName) student.fatherName = payload.fatherName.trim();
    if (payload.phone) student.phone = payload.phone.trim();
    if (payload.mobileNo) student.phone = payload.mobileNo.trim();
    if (payload.dateOfBirth !== undefined) {
      student.dateOfBirth = payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined;
    }
    if (payload.classId) {
      const cls = await AcademyClass.findById(payload.classId);
      if (!cls) throw new ApiError(404, 'Class not found');
      if (cls.status !== 'active') throw new ApiError(400, 'Class is not active');
      student.classId = payload.classId;
      student.rollNumber = await generateTemporaryRollNumber(payload.classId);
    }
    await student.save();
    return student.populate([
      { path: 'classId', select: 'className' },
      { path: 'createdBy', select: 'name email' },
    ]);
  }

  const classId = payload.classId || student.classId;
  const sectionId = payload.sectionId || student.sectionId;
  const isFullPackage = payload.isFullPackage !== undefined ? payload.isFullPackage : student.isFullPackage;
  const needsFeeRecalc =
    payload.classId ||
    payload.sectionId ||
    payload.disciplineId !== undefined ||
    payload.selectedSubjects ||
    payload.isFullPackage !== undefined ||
    payload.discountAmount !== undefined ||
    payload.monthlyFeeDiscount !== undefined ||
    payload.admissionFeeDiscount !== undefined;

  if (payload.studentName) student.studentName = payload.studentName.trim();
  if (payload.fatherName) student.fatherName = payload.fatherName.trim();
  if (payload.phone) student.phone = payload.phone.trim();
  if (payload.mobileNo) student.phone = payload.mobileNo.trim();
  if (payload.gender) student.gender = payload.gender;
  applyProfileToStudent(student, payload);
  if (payload.status) student.status = payload.status;
  if (payload.classId) student.classId = payload.classId;
  if (payload.sectionId) student.sectionId = payload.sectionId;

  if (needsFeeRecalc) {
    const feeStructure = await getByClass(classId);
    if (!feeStructure) throw new ApiError(400, 'No active fee structure for class');
    const disciplineId = await resolveEnrollmentDiscipline(
      classId,
      payload.disciplineId !== undefined ? payload.disciplineId : student.disciplineId
    );
    const subjectIds = await validateSubjects(
      classId,
      sectionId,
      payload.selectedSubjects || student.selectedSubjects,
      isFullPackage,
      disciplineId
    );
    student.disciplineId = disciplineId || undefined;
    student.isFullPackage = isFullPackage;
    student.selectedSubjects = subjectIds;
    const hasSeparateDiscounts =
      (payload.monthlyFeeDiscount !== undefined && Number(payload.monthlyFeeDiscount) > 0) ||
      (payload.admissionFeeDiscount !== undefined && Number(payload.admissionFeeDiscount) > 0) ||
      (student.monthlyFeeDiscount > 0 || student.admissionFeeDiscount > 0);
    const discountOptions = hasSeparateDiscounts
      ? {
        monthlyFeeDiscount:
          payload.monthlyFeeDiscount !== undefined
            ? payload.monthlyFeeDiscount
            : student.monthlyFeeDiscount,
        admissionFeeDiscount:
          payload.admissionFeeDiscount !== undefined
            ? payload.admissionFeeDiscount
            : student.admissionFeeDiscount,
      }
      : {
        discountAmount:
          payload.discountAmount !== undefined ? payload.discountAmount : student.discountAmount,
      };
    const fees = calculateFeesWithDiscount(feeStructure, {
      selectedSubjectIds: subjectIds,
      isFullPackage,
      ...discountOptions,
    });
    Object.assign(student, fees);
    student.feeStructureId = feeStructure._id;
  }

  await student.save();
  return student.populate([
    { path: 'classId', select: 'className' },
    { path: 'disciplineId', select: 'name code' },
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);
}

async function getStudent(id) {
  const student = await AcademyStudent.findById(id)
    .populate('classId', 'className totalSubjects')
    .populate('sectionId', 'sectionName useClassSubjects')
    .populate('disciplineId', 'name code')
    .populate('selectedSubjects', 'subjectName subjectCode')
    .populate('feeStructureId');
  if (!student) throw new ApiError(404, 'Student not found');
  return student;
}

async function listStudents({
  page = 1,
  limit = 20,
  search,
  classId,
  sectionId,
  status,
  guardianEmail,
  sessionId,
  sort = '-createdAt',
  forExport = false,
  /** Extra Mongo filter (e.g. teacher class/section scope). */
  scopeFilter = null,
  /** When true, do not match search against phone. */
  hidePhoneSearch = false,
}) {
  const q = {};
  if (status) q.status = status;
  if (sectionId) q.sectionId = sectionId;
  if (guardianEmail) {
    const escaped = String(guardianEmail).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    q.guardianEmail = { $regex: `^${escaped}$`, $options: 'i' };
  }
  if (search?.trim()) {
    const s = search.trim();
    const searchOr = [
      { studentName: { $regex: s, $options: 'i' } },
      { fatherName: { $regex: s, $options: 'i' } },
      { studentId: { $regex: s, $options: 'i' } },
      { registrationNumber: { $regex: s, $options: 'i' } },
      { rollNumber: { $regex: s, $options: 'i' } },
    ];
    if (!hidePhoneSearch) {
      searchOr.splice(2, 0, { phone: { $regex: s, $options: 'i' } });
    }
    q.$or = searchOr;
  }

  if (classId) {
    q.classId = classId;
  } else if (sessionId) {
    const classes = await AcademyClass.find({ sessionId }).select('_id');
    q.classId = { $in: classes.map((c) => c._id) };
  }

  const filter =
    scopeFilter && Object.keys(scopeFilter).length
      ? { $and: [q, scopeFilter] }
      : q;

  const cap = forExport ? 10000 : 100;
  const perPage = Math.min(cap, Math.max(1, limit));
  const skip = (Math.max(1, page) - 1) * perPage;

  const [items, total] = await Promise.all([
    AcademyStudent.find(filter)
      .populate({
        path: 'classId',
        select: 'className sessionId',
        populate: { path: 'sessionId', select: 'name status' },
      })
      .populate('sectionId', 'sectionName')
      .populate('disciplineId', 'name code')
      .populate('selectedSubjects', 'subjectName')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(perPage),
    AcademyStudent.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: Math.max(1, page),
      limit: perPage,
      total,
      pages: Math.ceil(total / perPage) || 1,
    },
  };
}

function studentsToCsv(rows, { omitSensitive = false } = {}) {
  const header = omitSensitive
    ? ['Student ID', 'Name', 'Father', 'Class', 'Created', 'Status']
    : [
        'Student ID',
        'Name',
        'Father',
        'Phone',
        'Class',
        'Created',
        'Monthly Fee',
        'Admission Fee',
        'Total Fee',
        'Status',
      ];
  const lines = [header.join(',')];
  rows.forEach((s) => {
    const className = s.classId?.className || '';
    const idCol = s.studentId || s.rollNumber || s.registrationNumber || '';
    const created = s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : '';
    if (omitSensitive) {
      lines.push(
        [
          idCol,
          `"${(s.studentName || '').replace(/"/g, '""')}"`,
          `"${(s.fatherName || '').replace(/"/g, '""')}"`,
          `"${className.replace(/"/g, '""')}"`,
          created,
          s.status,
        ].join(',')
      );
      return;
    }
    lines.push(
      [
        idCol,
        `"${(s.studentName || '').replace(/"/g, '""')}"`,
        `"${(s.fatherName || '').replace(/"/g, '""')}"`,
        s.phone,
        `"${className.replace(/"/g, '""')}"`,
        created,
        s.monthlyFee,
        s.admissionFee,
        s.totalFee,
        s.status,
      ].join(',')
    );
  });
  return lines.join('\n');
}

async function uploadStudentPhoto(id, file) {
  const student = await AcademyStudent.findById(id);
  if (!student) throw new ApiError(404, 'Student not found');
  student.photoImage = saveStudentPhotoFile(id, file);
  await student.save();
  return student.populate([
    { path: 'classId', select: 'className' },
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);
}

async function deleteStudent(id) {
  const student = await AcademyStudent.findById(id);
  if (!student) throw new ApiError(404, 'Student not found');

  const paidCount = await AcademyFeeRecord.countDocuments({
    studentId: id,
    status: 'paid',
  });
  if (paidCount > 0) {
    throw new ApiError(400, 'Cannot delete student with paid fee records. Set status to inactive instead.');
  }

  const AcademyAttendance = require('../../models/academy/AcademyAttendance');
  const AcademyAssessment = require('../../models/academy/AcademyAssessment');
  const AiFaceEnrollment = require('../../models/AiFaceEnrollment');
  const { studentAiEmployeeId } = require('../aiAttendance/aiAttendanceIds');
  const personKey = student.aiEmployeeId || studentAiEmployeeId(student);

  await Promise.all([
    AcademyFeeRecord.deleteMany({ studentId: id }),
    AcademyAttendance.deleteMany({ studentId: id }),
    AcademyAssessment.deleteMany({ studentId: id }),
    personKey ? AiFaceEnrollment.deleteOne({ personKey }) : Promise.resolve(),
  ]);
  await student.deleteOne();
  return { deleted: true, studentId: student.studentId };
}

function classifyDiscountType(monthlyFeeDiscount, admissionFeeDiscount, discountAmount) {
  const monthly = Number(monthlyFeeDiscount) || 0;
  const admission = Number(admissionFeeDiscount) || 0;
  const legacy = Number(discountAmount) || 0;

  if (monthly > 0 && admission > 0) return 'both';
  if (monthly > 0) return 'monthly_only';
  if (admission > 0) return 'admission_only';
  if (legacy > 0) return 'legacy_combined';
  return 'none';
}

function buildDiscountReportQuery({ classId, search, from, to }) {
  const and = [
    {
      $or: [
        { monthlyFeeDiscount: { $gt: 0 } },
        { admissionFeeDiscount: { $gt: 0 } },
        { discountAmount: { $gt: 0 } },
      ],
    },
  ];
  if (classId) and.push({ classId });
  if (from || to) {
    const enrolledAt = {};
    if (from) enrolledAt.$gte = new Date(from);
    if (to) enrolledAt.$lte = new Date(to);
    and.push({ enrolledAt });
  }
  if (search?.trim()) {
    const s = search.trim();
    and.push({
      $or: [
        { studentName: { $regex: s, $options: 'i' } },
        { fatherName: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { studentId: { $regex: s, $options: 'i' } },
      ],
    });
  }
  return { $and: and };
}

async function getDiscountReport({ page = 1, limit = 20, classId, search, from, to } = {}) {
  const q = buildDiscountReportQuery({ classId, search, from, to });
  const perPage = Math.min(100, Math.max(1, limit));
  const skip = (Math.max(1, page) - 1) * perPage;

  const [rows, total, allDiscountStudents] = await Promise.all([
    AcademyStudent.find(q)
      .populate('classId', 'className')
      .populate('createdBy', 'name email')
      .sort({ enrolledAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .lean(),
    AcademyStudent.countDocuments(q),
    AcademyStudent.find(q)
      .select('monthlyFeeDiscount admissionFeeDiscount discountAmount createdBy')
      .lean(),
  ]);

  let totalMonthlyDiscount = 0;
  let totalAdmissionDiscount = 0;
  let totalLegacyDiscount = 0;
  let monthlyOnlyCount = 0;
  let admissionOnlyCount = 0;
  let bothCount = 0;
  let legacyCount = 0;
  const byStaffMap = new Map();

  allDiscountStudents.forEach((s) => {
    const monthly = Number(s.monthlyFeeDiscount) || 0;
    const admission = Number(s.admissionFeeDiscount) || 0;
    const legacy = Number(s.discountAmount) || 0;
    const type = classifyDiscountType(monthly, admission, legacy);

    totalMonthlyDiscount += monthly;
    totalAdmissionDiscount += admission;
    if (type === 'legacy_combined') {
      totalLegacyDiscount += legacy;
      legacyCount += 1;
    } else if (type === 'monthly_only') monthlyOnlyCount += 1;
    else if (type === 'admission_only') admissionOnlyCount += 1;
    else if (type === 'both') bothCount += 1;

    const staffId = s.createdBy ? String(s.createdBy) : 'unknown';
    const entry = byStaffMap.get(staffId) || {
      staffId,
      studentCount: 0,
      monthlyDiscount: 0,
      admissionDiscount: 0,
      legacyDiscount: 0,
    };
    entry.studentCount += 1;
    entry.monthlyDiscount += monthly;
    entry.admissionDiscount += admission;
    if (type === 'legacy_combined') entry.legacyDiscount += legacy;
    byStaffMap.set(staffId, entry);
  });

  const staffIds = [...byStaffMap.keys()].filter((id) => id !== 'unknown');
  const staffUsers = staffIds.length
    ? await User.find({ _id: { $in: staffIds } })
      .select('name email')
      .lean()
    : [];
  const staffNameById = new Map(staffUsers.map((u) => [String(u._id), u]));

  const byStaff = [...byStaffMap.values()]
    .map((entry) => {
      const user = entry.staffId === 'unknown' ? null : staffNameById.get(entry.staffId);
      return {
        staffId: entry.staffId === 'unknown' ? null : entry.staffId,
        staffName: user?.name || 'Unknown',
        staffEmail: user?.email || '',
        studentCount: entry.studentCount,
        monthlyDiscount: entry.monthlyDiscount,
        admissionDiscount: entry.admissionDiscount,
        legacyDiscount: entry.legacyDiscount,
        totalDiscount: entry.monthlyDiscount + entry.admissionDiscount + entry.legacyDiscount,
      };
    })
    .sort((a, b) => b.totalDiscount - a.totalDiscount);

  const items = rows.map((s) => {
    const monthlyFeeDiscount = Number(s.monthlyFeeDiscount) || 0;
    const admissionFeeDiscount = Number(s.admissionFeeDiscount) || 0;
    const discountAmount = Number(s.discountAmount) || 0;
    const discountType = classifyDiscountType(monthlyFeeDiscount, admissionFeeDiscount, discountAmount);
    const createdBy = s.createdBy;
    return {
      _id: s._id,
      studentId: s.studentId,
      studentName: s.studentName,
      fatherName: s.fatherName,
      className: s.classId?.className || '',
      classId: s.classId?._id || s.classId,
      monthlyFeeDiscount,
      admissionFeeDiscount,
      discountAmount,
      totalDiscount:
        discountType === 'legacy_combined'
          ? discountAmount
          : monthlyFeeDiscount + admissionFeeDiscount,
      discountType,
      enrolledAt: s.enrolledAt,
      grantedBy: createdBy
        ? { _id: createdBy._id, name: createdBy.name, email: createdBy.email }
        : null,
    };
  });

  return {
    summary: {
      studentCount: allDiscountStudents.length,
      totalMonthlyDiscount,
      totalAdmissionDiscount,
      totalLegacyDiscount,
      totalDiscount: totalMonthlyDiscount + totalAdmissionDiscount + totalLegacyDiscount,
      monthlyOnlyCount,
      admissionOnlyCount,
      bothCount,
      legacyCount,
      byStaff,
    },
    items,
    pagination: {
      page: Math.max(1, page),
      limit: perPage,
      total,
      pages: Math.ceil(total / perPage) || 1,
    },
  };
}

/** Phase 1 — admission office intake (minimal fields). */
async function registerProvisionalStudent(payload, userId) {
  const cls = await AcademyClass.findById(payload.classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (cls.status !== 'active') throw new ApiError(400, 'Class is not active');
  if (!cls.sessionId) {
    throw new ApiError(400, 'Class must belong to an academic session');
  }

  const registrationNumber = await generateRegistrationNumber();
  const rollNumber = await generateTemporaryRollNumber(payload.classId);
  const phone = (payload.phone || '').trim();
  if (!phone) throw new ApiError(400, 'Phone number is required');

  const intakeNotes = (payload.description || payload.intakeNotes || '').trim();

  const student = await AcademyStudent.create({
    registrationNumber,
    rollNumber,
    studentName: payload.studentName.trim(),
    fatherName: payload.fatherName.trim(),
    phone,
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined,
    intakeNotes,
    classId: payload.classId,
    status: 'pending_fee',
    createdBy: userId,
  });

  return student.populate([
    { path: 'classId', select: 'className sessionId' },
    { path: 'createdBy', select: 'name email' },
  ]);
}

/** Phase 2 — accountant completes admission, fee, allocation, and logins. */
async function activateStudent(id, payload, userId) {
  const student = await AcademyStudent.findById(id);
  if (!student) throw new ApiError(404, 'Student not found');
  if (student.status !== 'pending_fee') {
    throw new ApiError(400, 'Student is not awaiting fee confirmation');
  }

  const classId = payload.classId || student.classId;
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (cls.status !== 'active') throw new ApiError(400, 'Class is not active');

  const feeStructure = await getByClass(classId);
  if (!feeStructure) throw new ApiError(400, 'Configure fee structure for this class first');

  const isFullPackage = Boolean(payload.isFullPackage);
  const section = await AcademySection.findById(payload.sectionId);
  if (!section) throw new ApiError(404, 'Section not found');
  if (section.status !== 'active') throw new ApiError(400, 'Section is not active');
  if (String(section.classId) !== String(classId)) {
    throw new ApiError(400, 'Section does not belong to this class');
  }

  const disciplineId = await resolveEnrollmentDiscipline(
    classId,
    payload.disciplineId !== undefined ? payload.disciplineId : student.disciplineId
  );
  const subjectIds = await validateSubjects(
    classId,
    payload.sectionId,
    payload.selectedSubjects || [],
    isFullPackage,
    disciplineId
  );

  const fees = calculateFeesWithDiscount(feeStructure, {
    selectedSubjectIds: subjectIds,
    isFullPackage,
    monthlyFeeDiscount: payload.monthlyFeeDiscount,
    admissionFeeDiscount: payload.admissionFeeDiscount,
    discountAmount: payload.discountAmount,
  });

  const phone = (payload.phone || payload.mobileNo || '').trim();
  if (!phone) throw new ApiError(400, 'Phone number is required');
  if (!payload.gender) throw new ApiError(400, 'Gender is required');

  const officialStudentId = await generateStudentId();
  const rollNumber = await generateAcademyRollNumber(classId);
  const studentName = (payload.studentName || student.studentName).trim();
  const fatherName = (payload.fatherName || student.fatherName).trim();

  const { parentEmail, parentPassword } = await ensureParentPortalUser({
    studentName,
    fatherName,
    guardianName: payload.guardianName || student.guardianName,
    phone,
    studentId: officialStudentId,
  });

  student.studentId = officialStudentId;
  student.rollNumber = rollNumber;
  student.userId = undefined;
  student.studentName = studentName;
  student.fatherName = fatherName;
  student.phone = phone;
  student.gender = payload.gender;
  if (payload.guardianName !== undefined) {
    student.guardianName = String(payload.guardianName || '').trim();
  } else if (!student.guardianName) {
    student.guardianName = fatherName;
  }
  applyProfileToStudent(student, payload);
  student.guardianEmail = parentEmail;
  student.classId = classId;
  student.sectionId = payload.sectionId;
  student.disciplineId = disciplineId || undefined;
  student.selectedSubjects = subjectIds;
  student.isFullPackage = isFullPackage;
  Object.assign(student, fees);
  student.feeStructureId = feeStructure._id;
  student.status = 'active';
  student.activatedAt = new Date();
  student.activatedBy = userId;
  student.enrolledAt = new Date();

  await student.save();

  const asOf = payload.paymentDate ? new Date(payload.paymentDate) : new Date();
  await createEnrollmentFeeVouchers(student, fees, userId, { asOf });

  const populated = await student.populate([
    { path: 'classId', select: 'className' },
    { path: 'sectionId', select: 'sectionName' },
    { path: 'disciplineId', select: 'name code' },
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);

  return {
    student: populated,
    credentials: {
      studentId: officialStudentId,
      rollNumber,
      parentEmail,
      parentPassword,
    },
  };
}

/**
 * Pay-first enrollment — step 1: lock subjects + create unpaid admission voucher.
 * Student stays pending_fee with no section until payment + assignSectionAfterPayment.
 */
async function prepareEnrollmentVoucher(id, payload, userId) {
  const student = await AcademyStudent.findById(id);
  if (!student) throw new ApiError(404, 'Student not found');
  if (student.status !== 'pending_fee') {
    throw new ApiError(400, 'Student is not awaiting fee confirmation');
  }

  const classId = payload.classId || student.classId;
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (cls.status !== 'active') throw new ApiError(400, 'Class is not active');

  const feeStructure = await getByClass(classId);
  if (!feeStructure) throw new ApiError(400, 'Configure fee structure for this class first');

  const isFullPackage = Boolean(payload.isFullPackage);
  const disciplineId = await resolveEnrollmentDiscipline(
    classId,
    payload.disciplineId !== undefined ? payload.disciplineId : student.disciplineId
  );
  // Validate against class subjects (no section yet).
  const subjectIds = await validateSubjects(
    classId,
    null,
    payload.selectedSubjects || [],
    isFullPackage,
    disciplineId
  );
  if (!isFullPackage && (!subjectIds || !subjectIds.length)) {
    throw new ApiError(400, 'Select at least one subject or choose full package');
  }

  const fees = calculateFeesWithDiscount(feeStructure, {
    selectedSubjectIds: subjectIds,
    isFullPackage,
    monthlyFeeDiscount: payload.monthlyFeeDiscount,
    admissionFeeDiscount: payload.admissionFeeDiscount,
    discountAmount: payload.discountAmount,
  });

  const asOf = payload.paymentDate ? new Date(payload.paymentDate) : new Date();
  const month = asOf.getMonth() + 1;
  const year = asOf.getFullYear();
  const existingAdm = await AcademyFeeRecord.findOne({
    studentId: student._id,
    month,
    year,
    feeType: 'admission',
  });
  if (existingAdm && (existingAdm.status === 'paid' || existingAdm.status === 'waived')) {
    throw new ApiError(
      400,
      'Enrollment fee is already paid. Assign a section to activate the student.'
    );
  }

  if (payload.studentName?.trim()) student.studentName = payload.studentName.trim();
  if (payload.fatherName?.trim()) student.fatherName = payload.fatherName.trim();
  const phone = (payload.phone || payload.mobileNo || student.phone || '').trim();
  if (phone) student.phone = phone;
  if (payload.gender) student.gender = payload.gender;
  if (payload.guardianName !== undefined) {
    student.guardianName = String(payload.guardianName || '').trim();
  }
  applyProfileToStudent(student, payload);

  student.classId = classId;
  student.sectionId = undefined;
  student.disciplineId = disciplineId || undefined;
  student.selectedSubjects = subjectIds;
  student.isFullPackage = isFullPackage;
  Object.assign(student, fees);
  student.feeStructureId = feeStructure._id;
  student.status = 'pending_fee';
  await student.save();

  const vouchers = await createEnrollmentFeeVouchers(student, fees, userId, {
    asOf,
    replacePending: true,
  });
  const voucher = vouchers[0] || null;

  const populated = await student.populate([
    { path: 'classId', select: 'className' },
    { path: 'disciplineId', select: 'name code' },
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);

  return {
    student: populated,
    voucher,
    fees,
  };
}

/**
 * Pay-first enrollment — step 2: after admission voucher is paid, assign section and activate.
 */
async function assignSectionAfterPayment(id, payload, userId) {
  const student = await AcademyStudent.findById(id);
  if (!student) throw new ApiError(404, 'Student not found');
  if (student.status !== 'pending_fee') {
    throw new ApiError(400, 'Student is not awaiting fee confirmation');
  }
  if (!student.selectedSubjects?.length && !student.isFullPackage) {
    throw new ApiError(400, 'Generate an enrollment voucher with subjects first');
  }

  const paidAdmission = await AcademyFeeRecord.findOne({
    studentId: student._id,
    feeType: 'admission',
    status: { $in: ['paid', 'waived'] },
  }).sort({ year: -1, month: -1 });
  if (!paidAdmission) {
    throw new ApiError(400, 'Enrollment fee must be paid before assigning a section');
  }

  const classId = payload.classId || student.classId;
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (cls.status !== 'active') throw new ApiError(400, 'Class is not active');

  const section = await AcademySection.findById(payload.sectionId);
  if (!section) throw new ApiError(404, 'Section not found');
  if (section.status !== 'active') throw new ApiError(400, 'Section is not active');
  if (String(section.classId) !== String(classId)) {
    throw new ApiError(400, 'Section does not belong to this class');
  }

  // Re-validate stored subjects against the chosen section layout.
  const disciplineId = await resolveEnrollmentDiscipline(classId, student.disciplineId);
  const subjectIds = await validateSubjects(
    classId,
    payload.sectionId,
    (student.selectedSubjects || []).map(String),
    Boolean(student.isFullPackage),
    disciplineId
  );

  const phone = (payload.phone || payload.mobileNo || student.phone || '').trim();
  if (!phone) throw new ApiError(400, 'Phone number is required');
  const gender = payload.gender || student.gender;
  if (!gender) throw new ApiError(400, 'Gender is required');

  const officialStudentId = student.studentId || (await generateStudentId());
  const rollNumber =
    student.studentId && student.rollNumber && !String(student.rollNumber).startsWith('TMP')
      ? student.rollNumber
      : await generateAcademyRollNumber(classId);
  const studentName = (payload.studentName || student.studentName).trim();
  const fatherName = (payload.fatherName || student.fatherName).trim();

  const { parentEmail, parentPassword } = await ensureParentPortalUser({
    studentName,
    fatherName,
    guardianName: payload.guardianName || student.guardianName,
    phone,
    studentId: officialStudentId,
  });

  student.studentId = officialStudentId;
  student.rollNumber = rollNumber;
  student.userId = undefined;
  student.studentName = studentName;
  student.fatherName = fatherName;
  student.phone = phone;
  student.gender = gender;
  if (payload.guardianName !== undefined) {
    student.guardianName = String(payload.guardianName || '').trim();
  } else if (!student.guardianName) {
    student.guardianName = fatherName;
  }
  applyProfileToStudent(student, payload);
  student.guardianEmail = parentEmail;
  student.classId = classId;
  student.sectionId = payload.sectionId;
  student.disciplineId = disciplineId || undefined;
  student.selectedSubjects = subjectIds;
  student.status = 'active';
  student.activatedAt = new Date();
  student.activatedBy = userId;
  student.enrolledAt = student.enrolledAt || new Date();
  await student.save();

  const populated = await student.populate([
    { path: 'classId', select: 'className' },
    { path: 'sectionId', select: 'sectionName' },
    { path: 'disciplineId', select: 'name code' },
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);

  return {
    student: populated,
    credentials: {
      studentId: officialStudentId,
      rollNumber,
      parentEmail,
      parentPassword,
    },
  };
}

/** Walk-in at accounts — full registration in one step (no provisional intake). */
async function registerDirectStudent(payload, userId) {
  const classId = payload.classId;
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (cls.status !== 'active') throw new ApiError(400, 'Class is not active');

  const feeStructure = await getByClass(classId);
  if (!feeStructure) throw new ApiError(400, 'Configure fee structure for this class first');

  const isFullPackage = Boolean(payload.isFullPackage);
  const section = await AcademySection.findById(payload.sectionId);
  if (!section) throw new ApiError(404, 'Section not found');
  if (section.status !== 'active') throw new ApiError(400, 'Section is not active');
  if (String(section.classId) !== String(classId)) {
    throw new ApiError(400, 'Section does not belong to this class');
  }

  const disciplineId = await resolveEnrollmentDiscipline(classId, payload.disciplineId);
  const subjectIds = await validateSubjects(
    classId,
    payload.sectionId,
    payload.selectedSubjects || [],
    isFullPackage,
    disciplineId
  );

  const fees = calculateFeesWithDiscount(feeStructure, {
    selectedSubjectIds: subjectIds,
    isFullPackage,
    monthlyFeeDiscount: payload.monthlyFeeDiscount,
    admissionFeeDiscount: payload.admissionFeeDiscount,
    discountAmount: payload.discountAmount,
  });

  const phone = (payload.phone || payload.mobileNo || '').trim();
  if (!phone) throw new ApiError(400, 'Phone number is required');
  if (!payload.gender) throw new ApiError(400, 'Gender is required');
  if (!payload.studentName?.trim()) throw new ApiError(400, 'Student name is required');
  if (!payload.fatherName?.trim()) throw new ApiError(400, 'Father name is required');
  if (!payload.dateOfBirth) throw new ApiError(400, 'Date of birth is required');

  const profile = pickStudentProfile(payload);
  const registrationNumber = await generateRegistrationNumber();
  const officialStudentId = await generateStudentId();
  const rollNumber = await generateAcademyRollNumber(classId);
  const studentName = payload.studentName.trim();
  const fatherName = payload.fatherName.trim();

  const { parentEmail, parentPassword } = await ensureParentPortalUser({
    studentName,
    fatherName,
    guardianName: payload.guardianName,
    phone,
    studentId: officialStudentId,
  });

  const student = await AcademyStudent.create({
    registrationNumber,
    studentId: officialStudentId,
    rollNumber,
    studentName,
    fatherName,
    phone,
    gender: payload.gender,
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined,
    ...profile,
    guardianEmail: parentEmail,
    guardianName: (payload.guardianName || fatherName || '').trim(),
    classId,
    sectionId: payload.sectionId,
    disciplineId: disciplineId || undefined,
    selectedSubjects: subjectIds,
    isFullPackage,
    ...fees,
    feeStructureId: feeStructure._id,
    status: 'active',
    activatedAt: new Date(),
    activatedBy: userId,
    enrolledAt: new Date(),
    createdBy: userId,
  });

  const asOf = payload.paymentDate ? new Date(payload.paymentDate) : new Date();
  await createEnrollmentFeeVouchers(student, fees, userId, { asOf });

  const populated = await student.populate([
    { path: 'classId', select: 'className' },
    { path: 'sectionId', select: 'sectionName' },
    { path: 'disciplineId', select: 'name code' },
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);

  return {
    student: populated,
    credentials: {
      studentId: officialStudentId,
      rollNumber,
      parentEmail,
      parentPassword,
    },
  };
}

/**
 * Create/reset parent portal emails + passwords for all active students.
 * Password is always Concept@1234 so staff can print credentials.
 */
async function provisionParentPortalsForAllActiveStudents() {
  const students = await AcademyStudent.find({
    status: 'active',
    studentId: { $exists: true, $nin: [null, ''] },
  })
    .select('studentId studentName fatherName guardianName phone guardianEmail')
    .sort({ studentName: 1 });

  const rows = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const student of students) {
    const { parentEmail, parentPassword, created } = await ensureParentPortalUser({
      studentName: student.studentName,
      fatherName: student.fatherName,
      guardianName: student.guardianName,
      phone: student.phone,
      studentId: student.studentId,
      resetPassword: true,
    });

    if (String(student.guardianEmail || '').toLowerCase() !== parentEmail) {
      student.guardianEmail = parentEmail;
      // eslint-disable-next-line no-await-in-loop
      await student.save();
    }

    if (created) createdCount += 1;
    else updatedCount += 1;

    rows.push({
      studentMongoId: String(student._id),
      studentId: student.studentId,
      studentName: student.studentName,
      parentEmail,
      parentPassword,
      created,
    });
  }

  return {
    total: rows.length,
    createdCount,
    updatedCount,
    defaultPassword: DEFAULT_PARENT_PASSWORD,
    rows,
  };
}

module.exports = {
  generateStudentId,
  registerStudent,
  registerProvisionalStudent,
  registerDirectStudent,
  activateStudent,
  prepareEnrollmentVoucher,
  assignSectionAfterPayment,
  updateStudent,
  getStudent,
  listStudents,
  studentsToCsv,
  deleteStudent,
  uploadStudentPhoto,
  getDiscountReport,
  provisionParentPortalsForAllActiveStudents,
  buildParentPortalEmail,
  DEFAULT_PARENT_PASSWORD,
};
