const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const academyClassBody = Joi.object({
  sessionId: objectId.required(),
  className: Joi.string().trim().required(),
  totalSubjects: Joi.number().integer().min(0).optional(),
  status: Joi.string().valid('active', 'inactive').optional(),
});

const academyClassPatch = academyClassBody.min(1);

const academySubjectBody = Joi.object({
  subjectName: Joi.string().trim().required(),
  classId: objectId.required(),
  subjectCode: Joi.string().trim().required(),
  status: Joi.string().valid('active', 'inactive').optional(),
  enrollmentType: Joi.string().valid('required', 'choice').default('required'),
  choiceGroupName: Joi.string().trim().optional().allow(''),
  pickCount: Joi.number().integer().min(1).default(1),
});

const academySubjectPatch = Joi.object({
  subjectName: Joi.string().trim(),
  subjectCode: Joi.string().trim(),
  status: Joi.string().valid('active', 'inactive'),
  enrollmentType: Joi.string().valid('required', 'choice'),
  choiceGroupName: Joi.string().trim().allow(''),
  pickCount: Joi.number().integer().min(1),
}).min(1);

const academySubjectBulkChoiceBody = Joi.object({
  groupName: Joi.string().trim().required(),
  pickCount: Joi.number().integer().min(1).default(1),
  subjects: Joi.array()
    .items(
      Joi.object({
        subjectName: Joi.string().trim().required(),
        subjectCode: Joi.string().trim().required(),
      })
    )
    .min(2)
    .max(10)
    .required(),
});

const academySectionBody = Joi.object({
  sectionName: Joi.string().trim().required(),
  classId: objectId.required(),
  useClassSubjects: Joi.boolean().default(true),
  subjectIds: Joi.array().items(objectId).default([]),
  status: Joi.string().valid('active', 'inactive').optional(),
});

const academySectionPatch = Joi.object({
  sectionName: Joi.string().trim(),
  useClassSubjects: Joi.boolean(),
  subjectIds: Joi.array().items(objectId),
  status: Joi.string().valid('active', 'inactive'),
}).min(1);

const academyFeeStructureBody = Joi.object({
  classId: objectId.required(),
  perSubjectFee: Joi.number().min(0).required(),
  fullPackageFee: Joi.number().min(0).required(),
  admissionFee: Joi.number().min(0).required(),
  status: Joi.string().valid('active', 'inactive').optional(),
  effectiveDate: Joi.date().optional(),
});

const academyFeeStructurePatch = Joi.object({
  perSubjectFee: Joi.number().min(0),
  fullPackageFee: Joi.number().min(0),
  admissionFee: Joi.number().min(0),
  status: Joi.string().valid('active', 'inactive'),
  effectiveDate: Joi.date(),
}).min(1);

const academicRecord = Joi.object({
  institutionName: Joi.string().allow('').trim(),
  className: Joi.string().allow('').trim(),
  totalMarks: Joi.number().min(0).allow(null, ''),
  obtainedMarks: Joi.number().min(0).allow(null, ''),
  percentage: Joi.number().min(0).max(100).allow(null, ''),
  year: Joi.string().allow('').trim(),
});

const studentProfileFields = {
  dateOfBirth: Joi.date().required(),
  nationality: Joi.string().trim().default('Pakistan'),
  guardianName: Joi.string().allow('').trim(),
  guardianRelation: Joi.string().allow('').trim(),
  fatherGuardianCnic: Joi.string().allow('').trim(),
  guardianOccupation: Joi.string().allow('').trim(),
  guardianWorkAddress: Joi.string().allow('').trim(),
  guardianEmail: Joi.string().trim().allow('').empty('').email({ tlds: { allow: false } }),
  studentEmail: Joi.string().trim().allow('').empty('').email({ tlds: { allow: false } }),
  postalAddress: Joi.string().allow('').trim(),
  contactPhoneRes: Joi.string().allow('').trim(),
  mobileNo: Joi.string().trim(),
  permanentAddress: Joi.string().allow('').trim(),
  currentSchoolCollege: Joi.string().allow('').trim(),
  academicHistory: Joi.array().items(academicRecord).default([]),
  address: Joi.string().allow('').trim(),
};

const academyStudentRegister = Joi.object({
  studentName: Joi.string().trim().required(),
  fatherName: Joi.string().trim().required(),
  phone: Joi.string().trim(),
  gender: Joi.string().valid('male', 'female', 'other').required(),
  classId: objectId.required(),
  sectionId: objectId.required(),
  selectedSubjects: Joi.array().items(objectId).default([]),
  isFullPackage: Joi.boolean().default(false),
  discountAmount: Joi.number().min(0).default(0),
  monthlyFeeDiscount: Joi.number().min(0).default(0),
  admissionFeeDiscount: Joi.number().min(0).default(0),
  status: Joi.string().valid('pending_fee', 'active', 'inactive', 'suspended').optional(),
  ...studentProfileFields,
  guardianEmail: Joi.string().trim().email({ tlds: { allow: false } }).required(),
  parentPassword: Joi.string().min(8).required(),
}).or('phone', 'mobileNo');

const academyStudentProvisional = Joi.object({
  studentName: Joi.string().trim().required(),
  fatherName: Joi.string().trim().required(),
  phone: Joi.string().trim().required(),
  dateOfBirth: Joi.date().required(),
  classId: objectId.required(),
  description: Joi.string().allow('').trim().max(2000),
});

const academyStudentActivate = Joi.object({
  studentName: Joi.string().trim(),
  fatherName: Joi.string().trim(),
  phone: Joi.string().trim(),
  gender: Joi.string().valid('male', 'female', 'other').required(),
  classId: objectId,
  sectionId: objectId.required(),
  selectedSubjects: Joi.array().items(objectId).default([]),
  isFullPackage: Joi.boolean().default(false),
  discountAmount: Joi.number().min(0).default(0),
  monthlyFeeDiscount: Joi.number().min(0).default(0),
  admissionFeeDiscount: Joi.number().min(0).default(0),
  guardianEmail: Joi.string().trim().allow('').empty('').email({ tlds: { allow: false } }),
  parentPassword: Joi.string().min(8).optional(),
  studentPassword: Joi.string().min(8).optional(),
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'online', 'other').default('cash'),
  receiptNumber: Joi.string().trim().allow('').optional(),
  paymentDate: Joi.date().optional(),
  dateOfBirth: Joi.date(),
  nationality: Joi.string().trim(),
  guardianName: Joi.string().allow('').trim(),
  guardianRelation: Joi.string().allow('').trim(),
  fatherGuardianCnic: Joi.string().allow('').trim(),
  guardianOccupation: Joi.string().allow('').trim(),
  guardianWorkAddress: Joi.string().allow('').trim(),
  studentEmail: Joi.string().trim().allow('').empty('').email({ tlds: { allow: false } }),
  postalAddress: Joi.string().allow('').trim(),
  contactPhoneRes: Joi.string().allow('').trim(),
  mobileNo: Joi.string().trim(),
  permanentAddress: Joi.string().allow('').trim(),
  currentSchoolCollege: Joi.string().allow('').trim(),
  academicHistory: Joi.array().items(academicRecord).default([]),
  address: Joi.string().allow('').trim(),
}).or('phone', 'mobileNo');

const academyStudentDirectRegister = Joi.object({
  studentName: Joi.string().trim().required(),
  fatherName: Joi.string().trim().required(),
  dateOfBirth: Joi.date().required(),
  phone: Joi.string().trim(),
  gender: Joi.string().valid('male', 'female', 'other').required(),
  classId: objectId.required(),
  sectionId: objectId.required(),
  selectedSubjects: Joi.array().items(objectId).default([]),
  isFullPackage: Joi.boolean().default(false),
  discountAmount: Joi.number().min(0).default(0),
  monthlyFeeDiscount: Joi.number().min(0).default(0),
  admissionFeeDiscount: Joi.number().min(0).default(0),
  guardianEmail: Joi.string().trim().allow('').empty('').email({ tlds: { allow: false } }),
  studentPassword: Joi.string().min(8).optional(),
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'online', 'other').default('cash'),
  receiptNumber: Joi.string().trim().allow('').optional(),
  paymentDate: Joi.date().optional(),
  nationality: Joi.string().trim(),
  guardianName: Joi.string().allow('').trim(),
  guardianRelation: Joi.string().allow('').trim(),
  fatherGuardianCnic: Joi.string().allow('').trim(),
  guardianOccupation: Joi.string().allow('').trim(),
  guardianWorkAddress: Joi.string().allow('').trim(),
  studentEmail: Joi.string().trim().allow('').empty('').email({ tlds: { allow: false } }),
  postalAddress: Joi.string().allow('').trim(),
  contactPhoneRes: Joi.string().allow('').trim(),
  mobileNo: Joi.string().trim(),
  permanentAddress: Joi.string().allow('').trim(),
  currentSchoolCollege: Joi.string().allow('').trim(),
  academicHistory: Joi.array().items(academicRecord).default([]),
  address: Joi.string().allow('').trim(),
}).or('phone', 'mobileNo');

const academyStudentPatch = Joi.object({
  studentName: Joi.string().trim(),
  fatherName: Joi.string().trim(),
  phone: Joi.string().trim(),
  gender: Joi.string().valid('male', 'female', 'other'),
  classId: objectId,
  sectionId: objectId,
  selectedSubjects: Joi.array().items(objectId),
  isFullPackage: Joi.boolean(),
  discountAmount: Joi.number().min(0),
  monthlyFeeDiscount: Joi.number().min(0),
  admissionFeeDiscount: Joi.number().min(0),
  status: Joi.string().valid('pending_fee', 'active', 'inactive', 'suspended'),
  dateOfBirth: Joi.date(),
  nationality: Joi.string().trim(),
  guardianName: Joi.string().allow('').trim(),
  guardianRelation: Joi.string().allow('').trim(),
  fatherGuardianCnic: Joi.string().allow('').trim(),
  guardianOccupation: Joi.string().allow('').trim(),
  guardianWorkAddress: Joi.string().allow('').trim(),
  guardianEmail: Joi.string().trim().allow('').empty('').email({ tlds: { allow: false } }),
  studentEmail: Joi.string().trim().allow('').empty('').email({ tlds: { allow: false } }),
  postalAddress: Joi.string().allow('').trim(),
  contactPhoneRes: Joi.string().allow('').trim(),
  mobileNo: Joi.string().trim(),
  permanentAddress: Joi.string().allow('').trim(),
  currentSchoolCollege: Joi.string().allow('').trim(),
  academicHistory: Joi.array().items(academicRecord),
  address: Joi.string().allow('').trim(),
}).min(1);

const academyFeePay = Joi.object({
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'online', 'other').default('cash'),
  notes: Joi.string().allow('').optional(),
});

const academyFeePayMany = Joi.object({
  feeRecordIds: Joi.array().items(objectId).min(1).max(24).required(),
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'online', 'other').default('cash'),
  notes: Joi.string().allow('').optional(),
});

const academyFeeGenerate = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
  classId: objectId.optional(),
});

const feeDefaultersQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  classId: objectId,
  month: Joi.number().integer().min(1).max(12),
  year: Joi.number().integer().min(2000).max(2100),
  search: Joi.string().trim().max(200).allow(''),
});

const academySalaryPay = Joi.object({
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'online', 'other').optional(),
  notes: Joi.string().allow('').trim(),
});

const academySalaryGenerate = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
  roleName: Joi.string().valid('teacher', 'accountant').optional(),
});

const expenseCategories = [
  'rent',
  'utilities',
  'supplies',
  'maintenance',
  'marketing',
  'transport',
  'staff_other',
  'other',
];

const academyExpenseBody = Joi.object({
  title: Joi.string().trim().required(),
  category: Joi.string().valid(...expenseCategories).default('other'),
  amount: Joi.number().min(0).required(),
  expenseDate: Joi.date().required(),
  vendor: Joi.string().allow('').trim(),
  description: Joi.string().allow('').trim(),
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'online', 'cheque', 'other').optional(),
  referenceNumber: Joi.string().allow('').trim(),
  status: Joi.string().valid('paid', 'planned').optional(),
});

const academyExpensePatch = Joi.object({
  title: Joi.string().trim(),
  category: Joi.string().valid(...expenseCategories),
  amount: Joi.number().min(0),
  expenseDate: Joi.date(),
  vendor: Joi.string().allow('').trim(),
  description: Joi.string().allow('').trim(),
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'online', 'cheque', 'other'),
  referenceNumber: Joi.string().allow('').trim(),
  status: Joi.string().valid('paid', 'planned'),
}).min(1);

const feePreview = Joi.object({
  classId: objectId.required(),
  selectedSubjects: Joi.array().items(objectId).default([]),
  isFullPackage: Joi.boolean().default(false),
  discountAmount: Joi.number().min(0).default(0),
  monthlyFeeDiscount: Joi.number().min(0).default(0),
  admissionFeeDiscount: Joi.number().min(0).default(0),
});

const discountReportQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  classId: objectId,
  search: Joi.string().trim().max(200).allow(''),
  from: Joi.date(),
  to: Joi.date(),
});

const assessmentTypes = ['quiz', 'weekly', 'monthly', 'midterm', 'final', 'assignment', 'practice', 'other'];

const academyAssessmentBody = Joi.object({
  subjectId: objectId.allow(null, ''),
  title: Joi.string().trim().required(),
  assessmentType: Joi.string().valid(...assessmentTypes).default('monthly'),
  examDate: Joi.date().required(),
  totalMarks: Joi.number().min(1).required(),
  obtainedMarks: Joi.number().min(0).required(),
  remarks: Joi.string().allow('').trim(),
});

const academyAssessmentPatch = Joi.object({
  subjectId: objectId.allow(null, ''),
  title: Joi.string().trim(),
  assessmentType: Joi.string().valid(...assessmentTypes),
  examDate: Joi.date(),
  totalMarks: Joi.number().min(1),
  obtainedMarks: Joi.number().min(0),
  remarks: Joi.string().allow('').trim(),
}).min(1);

const academyAssessmentSessionQuery = Joi.object({
  classId: objectId.required(),
  subjectId: objectId.required(),
  title: Joi.string().trim().allow(''),
  assessmentType: Joi.string().valid(...assessmentTypes),
  examDate: Joi.date(),
});

const recurrenceTypes = ['once', 'daily', 'weekly', 'monthly'];

const academyClassTestBody = Joi.object({
  classId: objectId.required(),
  subjectId: objectId.required(),
  title: Joi.string().trim().min(1).required(),
  assessmentType: Joi.string().valid(...assessmentTypes).required(),
  examDate: Joi.date().required(),
  testTime: Joi.string()
    .trim()
    .pattern(/^([01]?\d|2[0-3]):[0-5]\d$/)
    .default('09:00'),
  totalMarks: Joi.number().min(1).required(),
  recurrence: Joi.string().valid(...recurrenceTypes).default('once'),
  seriesCount: Joi.when('recurrence', {
    is: 'once',
    then: Joi.forbidden(),
    otherwise: Joi.number().integer().min(2).max(52),
  }),
});

const academyClassTestMarksBody = Joi.object({
  entries: Joi.array()
    .items(
      Joi.object({
        studentId: objectId.required(),
        assessmentId: objectId.optional(),
        obtainedMarks: Joi.alternatives().try(Joi.number().min(0), Joi.string().allow('')),
        remarks: Joi.string().allow('').trim(),
        testPaperImage: Joi.string().max(2048).allow('').trim(),
      })
    )
    .min(1)
    .required(),
});

const academyAssessmentBulkBody = Joi.object({
  classId: objectId.required(),
  subjectId: objectId.required(),
  title: Joi.string().trim().required(),
  assessmentType: Joi.string().valid(...assessmentTypes).required(),
  examDate: Joi.date().required(),
  totalMarks: Joi.number().min(1).required(),
  entries: Joi.array()
    .items(
      Joi.object({
        studentId: objectId.required(),
        assessmentId: objectId.optional(),
        obtainedMarks: Joi.alternatives().try(Joi.number().min(0), Joi.string().allow('')),
        remarks: Joi.string().allow('').trim(),
      })
    )
    .min(1)
    .required(),
});

const academyAttendanceMark = Joi.object({
  // Keep the calendar day. isoDate() rewrites YYYY-MM-DD into a UTC timestamp,
  // which dayBounds then rejects.
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({ 'string.pattern.base': 'date must be YYYY-MM-DD' }),
  entries: Joi.array()
    .items(
      Joi.object({
        studentId: objectId.required(),
        status: Joi.string().valid('present', 'absent', 'late', 'leave').required(),
        notes: Joi.string().allow('').trim(),
      })
    )
    .min(1)
    .required(),
});

const academySessionImportBody = Joi.object({
  sourceSessionId: objectId.required(),
  classIds: Joi.array().items(objectId).optional(),
  includeFeeStructure: Joi.boolean().default(true),
});

module.exports = {
  academyClassBody,
  academyClassPatch,
  academySubjectBody,
  academySubjectPatch,
  academySubjectBulkChoiceBody,
  academySectionBody,
  academySectionPatch,
  academyFeeStructureBody,
  academyFeeStructurePatch,
  academyStudentRegister,
  academyStudentProvisional,
  academyStudentActivate,
  academyStudentDirectRegister,
  academyStudentPatch,
  academyFeePay,
  academyFeePayMany,
  academyFeeGenerate,
  feeDefaultersQuery,
  academySalaryPay,
  academySalaryGenerate,
  academyExpenseBody,
  academyExpensePatch,
  feePreview,
  discountReportQuery,
  academyAssessmentBody,
  academyAssessmentPatch,
  academyAssessmentSessionQuery,
  academyAssessmentBulkBody,
  academyClassTestBody,
  academyClassTestMarksBody,
  academyAttendanceMark,
  academySessionImportBody,
};
