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
const { getEnrollmentLayout, validateEnrollmentSubjects } = require('./academyEnrollmentSubjectService');
const { generateAcademyRollNumber, generateTemporaryRollNumber } = require('../../utils/academyRollNumber');
const { generateRegistrationNumber } = require('../../utils/academyRegistrationNumber');
const { normalizeDisciplineList, assertDiscipline } = require('../../utils/academyDiscipline');

const STUDENT_PHOTO_DIR = path.join(__dirname, '../../../uploads/students');

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

async function validateSubjects(classId, sectionId, subjectIds, isFullPackage) {
  return validateEnrollmentSubjects(classId, sectionId, subjectIds, isFullPackage);
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

  const subjectIds = await validateSubjects(payload.classId, payload.sectionId, payload.selectedSubjects, isFullPackage);
  const discipline = assertDiscipline(cls, payload.discipline);

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
    discipline,
    selectedSubjects: subjectIds,
    isFullPackage,
    ...fees,
    feeStructureId: feeStructure._id,
    status: payload.status || 'active',
    createdBy: userId,
  });

  const now = new Date();
  const receiptNumber = `RCP-${studentId}-ADM`;
  await AcademyFeeRecord.create({
    studentId: student._id,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    amount: fees.totalFee,
    feeType: 'admission',
    status: 'pending',
    dueDate: now,
    receiptNumber,
    createdBy: userId,
    recordedBy: userId,
  });

  return student.populate([
    { path: 'classId', select: 'className' },
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
    if (payload.discipline !== undefined || payload.classId) {
      const cls = await AcademyClass.findById(student.classId);
      student.discipline = assertDiscipline(cls, payload.discipline !== undefined ? payload.discipline : student.discipline);
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
  if (payload.discipline !== undefined || payload.classId) {
    const clsForDisc = await AcademyClass.findById(classId);
    student.discipline = assertDiscipline(
      clsForDisc,
      payload.discipline !== undefined ? payload.discipline : student.discipline
    );
  }

  if (needsFeeRecalc) {
    const feeStructure = await getByClass(classId);
    if (!feeStructure) throw new ApiError(400, 'No active fee structure for class');
    const subjectIds = await validateSubjects(
      classId,
      sectionId,
      payload.selectedSubjects || student.selectedSubjects,
      isFullPackage
    );
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
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);
}

async function getStudent(id) {
  const student = await AcademyStudent.findById(id)
    .populate('classId', 'className totalSubjects')
    .populate('sectionId', 'sectionName useClassSubjects')
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
  fee,
  discipline,
  guardianEmail,
  sessionId,
  sort = '-createdAt',
  forExport = false,
}) {
  const q = {};
  if (status) q.status = status;
  if (fee === 'pending') q.status = 'pending_fee';
  else if (fee === 'charged') {
    if (status === 'pending_fee') q._id = { $exists: false };
    else if (!status) q.status = { $ne: 'pending_fee' };
  }
  if (sectionId) q.sectionId = sectionId;
  if (discipline) q.discipline = discipline;
  if (guardianEmail) {
    const escaped = String(guardianEmail).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    q.guardianEmail = { $regex: `^${escaped}$`, $options: 'i' };
  }
  if (search?.trim()) {
    const s = search.trim();
    q.$or = [
      { studentName: { $regex: s, $options: 'i' } },
      { fatherName: { $regex: s, $options: 'i' } },
      { phone: { $regex: s, $options: 'i' } },
      { studentId: { $regex: s, $options: 'i' } },
      { registrationNumber: { $regex: s, $options: 'i' } },
      { rollNumber: { $regex: s, $options: 'i' } },
    ];
  }

  if (classId) {
    q.classId = classId;
  } else if (sessionId) {
    const classes = await AcademyClass.find({ sessionId }).select('_id');
    q.classId = { $in: classes.map((c) => c._id) };
  }

  const cap = forExport ? 10000 : 100;
  const perPage = Math.min(cap, Math.max(1, limit));
  const skip = (Math.max(1, page) - 1) * perPage;
  const countMatch = { ...q };
  delete countMatch.status;
  delete countMatch._id;

  const [items, total, totalAll, active, pendingFee, inactive, suspended] = await Promise.all([
    AcademyStudent.find(q)
      .populate({
        path: 'classId',
        select: 'className sessionId disciplines',
        populate: { path: 'sessionId', select: 'name status' },
      })
      .populate('sectionId', 'sectionName')
      .populate('selectedSubjects', 'subjectName')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(perPage),
    AcademyStudent.countDocuments(q),
    AcademyStudent.countDocuments(countMatch),
    AcademyStudent.countDocuments({ ...countMatch, status: 'active' }),
    AcademyStudent.countDocuments({ ...countMatch, status: 'pending_fee' }),
    AcademyStudent.countDocuments({ ...countMatch, status: 'inactive' }),
    AcademyStudent.countDocuments({ ...countMatch, status: 'suspended' }),
  ]);

  return {
    items,
    pagination: {
      page: Math.max(1, page),
      limit: perPage,
      total,
      pages: Math.ceil(total / perPage) || 1,
    },
    counts: {
      total: totalAll,
      active,
      pending_fee: pendingFee,
      inactive,
      suspended,
    },
  };
}

function studentsToCsv(rows) {
  const header = [
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

  let registrationNumber = (payload.registrationNumber || '').trim();
  if (registrationNumber) {
    const taken = await AcademyStudent.findOne({ registrationNumber }).select('_id');
    if (taken) throw new ApiError(400, `Reg No ${registrationNumber} already exists`);
  } else {
    registrationNumber = await generateRegistrationNumber();
  }
  const rollNumber = await generateTemporaryRollNumber(payload.classId);
  const phone = (payload.phone || '').trim();
  if (!phone) throw new ApiError(400, 'Phone number is required');

  let sectionId;
  if (payload.sectionId) {
    const section = await AcademySection.findById(payload.sectionId);
    if (!section) throw new ApiError(404, 'Section not found');
    if (String(section.classId) !== String(payload.classId)) {
      throw new ApiError(400, 'Section does not belong to this class');
    }
    sectionId = section._id;
  }

  const intakeNotes = (payload.description || payload.intakeNotes || '').trim();
  const discipline = assertDiscipline(cls, payload.discipline);

  const student = await AcademyStudent.create({
    registrationNumber,
    rollNumber,
    studentName: payload.studentName.trim(),
    fatherName: payload.fatherName.trim(),
    phone,
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined,
    intakeNotes,
    classId: payload.classId,
    sectionId,
    discipline,
    status: 'pending_fee',
    createdBy: userId,
  });

  return student.populate([
    { path: 'classId', select: 'className sessionId' },
    { path: 'createdBy', select: 'name email' },
  ]);
}

/** Bulk register import — already-enrolled (active) students, no Activate step. */
async function registerImportedActiveStudent(payload, userId) {
  const cls = await AcademyClass.findById(payload.classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (cls.status !== 'active') throw new ApiError(400, 'Class is not active');
  if (!cls.sessionId) {
    throw new ApiError(400, 'Class must belong to an academic session');
  }
  if (!payload.sectionId) throw new ApiError(400, 'SECTION is required');

  const section = await AcademySection.findById(payload.sectionId);
  if (!section) throw new ApiError(404, 'Section not found');
  if (String(section.classId) !== String(payload.classId)) {
    throw new ApiError(400, 'Section does not belong to this class');
  }

  let registrationNumber = (payload.registrationNumber || '').trim();
  if (registrationNumber) {
    const taken = await AcademyStudent.findOne({ registrationNumber }).select('_id');
    if (taken) throw new ApiError(400, `Reg No ${registrationNumber} already exists`);
  } else {
    registrationNumber = await generateRegistrationNumber();
  }

  const phone = (payload.phone || '').trim();
  if (!phone) throw new ApiError(400, 'Phone number is required');
  if (!payload.studentName?.trim()) throw new ApiError(400, 'Student name is required');
  if (!payload.fatherName?.trim()) throw new ApiError(400, 'Father name is required');

  const layout = await getEnrollmentLayout(payload.classId, payload.sectionId);
  const subjectIds = Array.isArray(payload.selectedSubjects)
    ? payload.selectedSubjects
    : layout.coreSubjects.map((s) => s._id);
  const isFullPackage = false;

  const feeStructure = await getByClass(payload.classId);
  const fees = feeStructure
    ? calculateFeesWithDiscount(feeStructure, {
        selectedSubjectIds: subjectIds,
        isFullPackage: false,
      })
    : { monthlyFee: 0, admissionFee: 0, totalFee: 0, monthlyFeeDiscount: 0, admissionFeeDiscount: 0, discountAmount: 0 };

  const discipline = assertDiscipline(cls, payload.discipline);
  const intakeNotes = (payload.description || payload.intakeNotes || '').trim();
  const studentId = await generateStudentId();
  const rollNumber = await generateAcademyRollNumber(payload.classId);
  const now = new Date();

  const student = await AcademyStudent.create({
    studentId,
    registrationNumber,
    rollNumber,
    studentName: payload.studentName.trim(),
    fatherName: payload.fatherName.trim(),
    phone,
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined,
    intakeNotes,
    classId: payload.classId,
    sectionId: section._id,
    discipline,
    selectedSubjects: subjectIds,
    isFullPackage,
    ...fees,
    feeStructureId: feeStructure?._id,
    status: 'active',
    enrolledAt: now,
    activatedAt: now,
    activatedBy: userId,
    createdBy: userId,
  });

  return student.populate([
    { path: 'classId', select: 'className sessionId' },
    { path: 'sectionId', select: 'sectionName' },
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

  const subjectIds = await validateSubjects(
    classId,
    payload.sectionId,
    payload.selectedSubjects || [],
    isFullPackage
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

  const profile = pickStudentProfile(payload);
  const studentRole = await Role.findOne({ name: 'student' });
  if (!studentRole) throw new ApiError(500, 'Roles not initialized');

  const parentEmail = (payload.guardianEmail || '').trim().toLowerCase();
  const officialStudentId = await generateStudentId();
  const rollNumber = await generateAcademyRollNumber(classId);
  const portalEmail = `${rollNumber.replace(/[^a-zA-Z0-9]/g, '')}@student.academy.local`.toLowerCase();
  const studPwd = payload.studentPassword || 'Student@123456';

  const studentUser = await User.create({
    name: (payload.studentName || student.studentName).trim(),
    email: portalEmail,
    phone,
    password: await bcrypt.hash(studPwd, 12),
    role: studentRole._id,
  });

  student.studentId = officialStudentId;
  student.rollNumber = rollNumber;
  student.userId = studentUser._id;
  student.studentName = (payload.studentName || student.studentName).trim();
  student.fatherName = (payload.fatherName || student.fatherName).trim();
  student.phone = phone;
  student.gender = payload.gender;
  applyProfileToStudent(student, payload);
  student.classId = classId;
  student.sectionId = payload.sectionId;
  student.discipline = assertDiscipline(cls, payload.discipline !== undefined ? payload.discipline : student.discipline);
  student.selectedSubjects = subjectIds;
  student.isFullPackage = isFullPackage;
  Object.assign(student, fees);
  student.feeStructureId = feeStructure._id;
  student.status = 'active';
  student.activatedAt = new Date();
  student.activatedBy = userId;
  student.enrolledAt = new Date();

  await student.save();

  const paidAt = payload.paymentDate ? new Date(payload.paymentDate) : new Date();
  const receiptNumber =
    payload.receiptNumber?.trim() || `RCP-${officialStudentId}-ADM`;

  await AcademyFeeRecord.create({
    studentId: student._id,
    month: paidAt.getMonth() + 1,
    year: paidAt.getFullYear(),
    amount: fees.totalFee,
    feeType: 'admission',
    status: 'paid',
    dueDate: paidAt,
    paidAt,
    receiptNumber,
    paymentMethod: payload.paymentMethod || 'cash',
    createdBy: userId,
    recordedBy: userId,
  });

  const populated = await student.populate([
    { path: 'classId', select: 'className' },
    { path: 'sectionId', select: 'sectionName' },
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);

  return {
    student: populated,
    credentials: {
      studentId: officialStudentId,
      rollNumber,
      studentEmail: portalEmail,
      studentPassword: studPwd,
      ...(parentEmail ? { parentEmail } : {}),
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

  const subjectIds = await validateSubjects(
    classId,
    payload.sectionId,
    payload.selectedSubjects || [],
    isFullPackage
  );
  const discipline = assertDiscipline(cls, payload.discipline);

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
  const studentRole = await Role.findOne({ name: 'student' });
  if (!studentRole) throw new ApiError(500, 'Roles not initialized');

  const parentEmail = (payload.guardianEmail || '').trim().toLowerCase();
  const registrationNumber = await generateRegistrationNumber();
  const officialStudentId = await generateStudentId();
  const rollNumber = await generateAcademyRollNumber(classId);
  const portalEmail = `${rollNumber.replace(/[^a-zA-Z0-9]/g, '')}@student.academy.local`.toLowerCase();
  const studPwd = payload.studentPassword || 'Student@123456';

  const studentUser = await User.create({
    name: payload.studentName.trim(),
    email: portalEmail,
    phone,
    password: await bcrypt.hash(studPwd, 12),
    role: studentRole._id,
  });

  const student = await AcademyStudent.create({
    registrationNumber,
    studentId: officialStudentId,
    rollNumber,
    userId: studentUser._id,
    studentName: payload.studentName.trim(),
    fatherName: payload.fatherName.trim(),
    phone,
    gender: payload.gender,
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined,
    ...profile,
    classId,
    sectionId: payload.sectionId,
    discipline,
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

  const paidAt = payload.paymentDate ? new Date(payload.paymentDate) : new Date();
  const receiptNumber =
    payload.receiptNumber?.trim() || `RCP-${officialStudentId}-ADM`;

  await AcademyFeeRecord.create({
    studentId: student._id,
    month: paidAt.getMonth() + 1,
    year: paidAt.getFullYear(),
    amount: fees.totalFee,
    feeType: 'admission',
    status: 'paid',
    dueDate: paidAt,
    paidAt,
    receiptNumber,
    paymentMethod: payload.paymentMethod || 'cash',
    createdBy: userId,
    recordedBy: userId,
  });

  const populated = await student.populate([
    { path: 'classId', select: 'className' },
    { path: 'sectionId', select: 'sectionName' },
    { path: 'selectedSubjects', select: 'subjectName subjectCode' },
    { path: 'createdBy', select: 'name email' },
  ]);

  return {
    student: populated,
    credentials: {
      studentId: officialStudentId,
      rollNumber,
      studentEmail: portalEmail,
      studentPassword: studPwd,
      ...(parentEmail ? { parentEmail } : {}),
    },
  };
}

module.exports = {
  generateStudentId,
  registerStudent,
  registerProvisionalStudent,
  registerImportedActiveStudent,
  registerDirectStudent,
  activateStudent,
  updateStudent,
  getStudent,
  listStudents,
  studentsToCsv,
  deleteStudent,
  uploadStudentPhoto,
  getDiscountReport,
};
