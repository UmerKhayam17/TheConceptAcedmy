const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const login = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().required(),
});

const refresh = Joi.object({
  refreshToken: Joi.string().optional(),
});

const otpSend = Joi.object({
  phone: Joi.string().required(),
});

const otpVerify = Joi.object({
  phone: Joi.string().required(),
  code: Joi.string().length(6).required(),
});

const createUser = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(8).required(),
  phone: Joi.string().required(),
  role: Joi.string().hex().length(24).required(),
  permissionIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
  modulePermissions: Joi.object().pattern(Joi.string(), Joi.array().items(Joi.string())).optional(),
  isActive: Joi.boolean().optional(),
  profileImage: Joi.string().max(2048).allow('').optional(),
  salary: Joi.number().min(0).optional(),
});

const updateUser = Joi.object({
  name: Joi.string(),
  email: Joi.string().email({ tlds: { allow: false } }),
  phone: Joi.string(),
  role: Joi.string().hex().length(24),
  isActive: Joi.boolean(),
  fcmToken: Joi.string().allow('', null),
  password: Joi.string().min(8),
  profileImage: Joi.string().max(2048).allow(''),
  salary: Joi.number().min(0),
  modulePermissions: Joi.object().pattern(Joi.string(), Joi.array().items(Joi.string())),
}).min(1);

const parentStudentAccess = Joi.object({
  studentIds: Joi.array().items(objectId).required(),
});

const userPermissions = Joi.object({
  permissionIds: Joi.array().items(Joi.string().hex().length(24)).required(),
});

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const SESSION_STATUSES = ['active', 'completed', 'archived'];

const sessionBody = Joi.object({
  name: Joi.string().required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  isActive: Joi.boolean(),
  status: Joi.string().valid(...SESSION_STATUSES),
  workingDays: Joi.array().items(Joi.string().valid(...WEEKDAYS)).min(1),
  timezone: Joi.string().trim(),
  notes: Joi.string().allow('').trim(),
});

const sessionCloneBody = Joi.object({
  name: Joi.string().required().trim(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  activate: Joi.boolean(),
  workingDays: Joi.array().items(Joi.string().valid(...WEEKDAYS)).min(1),
  timezone: Joi.string().trim(),
  notes: Joi.string().allow('').trim(),
});

const classBody = Joi.object({
  name: Joi.string().required(),
  session: Joi.string().hex().length(24).required(),
  classTeacher: Joi.string().hex().length(24).allow(null),
  order: Joi.number(),
});

const sectionBody = Joi.object({
  name: Joi.string().required(),
  class: Joi.string().hex().length(24).required(),
  teacher: Joi.string().hex().length(24).allow(null, ''),
  maxStudents: Joi.number().integer().min(1),
});

const sectionPatch = Joi.object({
  name: Joi.string().trim(),
  teacher: Joi.string().hex().length(24).allow(null, ''),
  maxStudents: Joi.number().integer().min(1),
}).min(1);

const subjectBody = Joi.object({
  name: Joi.string().required(),
  code: Joi.string().required(),
  class: Joi.string().hex().length(24).required(),
  teacher: Joi.string().hex().length(24).allow(null),
  totalMarks: Joi.number(),
  passingMarks: Joi.number(),
});

const subjectPatch = Joi.object({
  name: Joi.string(),
  code: Joi.string(),
  class: Joi.string().hex().length(24),
  teacher: Joi.string().hex().length(24).allow(null),
  totalMarks: Joi.number(),
  passingMarks: Joi.number(),
}).min(1);


const markAttendance = Joi.object({
  classId: Joi.string().hex().length(24).required(),
  sectionId: Joi.string().hex().length(24).required(),
  date: Joi.date().required(),
  entries: Joi.array()
    .items(
      Joi.object({
        studentId: Joi.string().hex().length(24).required(),
        status: Joi.string().valid('present', 'absent', 'leave', 'late').required(),
        reason: Joi.string().allow(''),
      })
    )
    .min(1)
    .required(),
});

const attendanceCorrect = Joi.object({
  status: Joi.string().valid('present', 'absent', 'leave', 'late').required(),
  reason: Joi.string().allow(''),
});

const feeStructureBody = Joi.object({
  name: Joi.string().required(),
  class: Joi.string().hex().length(24).required(),
  session: Joi.string().hex().length(24).required(),
  type: Joi.string().valid('monthly', 'one_time', 'annual').required(),
  amount: Joi.number().required(),
  dueDay: Joi.number().min(1).max(28),
  finePerDay: Joi.number().min(0),
  isActive: Joi.boolean(),
});

const feeVoucherGenerate = Joi.object({
  month: Joi.number().min(1).max(12),
  year: Joi.number(),
  sessionId: Joi.string().hex().length(24).optional(),
  sync: Joi.boolean(),
});

const feePay = Joi.object({
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'online').required(),
});

const {
  EXAM_TYPE_LABELS,
  LEGACY_EXAM_TYPE_LABELS,
} = require('../config/assessmentTaxonomy');

const examTypeValues = [...EXAM_TYPE_LABELS, ...LEGACY_EXAM_TYPE_LABELS];

const examBody = Joi.object({
  title: Joi.string().required(),
  type: Joi.string()
    .valid(...examTypeValues)
    .required(),
  academyClass: Joi.string().hex().length(24).required(),
  sessionLabel: Joi.string().trim().allow('').optional(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  dateSheet: Joi.array().optional(),
  status: Joi.string().valid('scheduled', 'ongoing', 'completed', 'cancelled').optional(),
});

const examPatch = Joi.object({
  title: Joi.string().trim(),
  type: Joi.string().valid(...examTypeValues),
  sessionLabel: Joi.string().trim().allow(''),
  startDate: Joi.date(),
  endDate: Joi.date(),
  status: Joi.string().valid('scheduled', 'ongoing', 'completed', 'cancelled'),
}).min(1);

const examMarks = Joi.object({
  marks: Joi.array()
    .items(
      Joi.object({
        studentId: Joi.string().hex().length(24).required(),
        subjectMarks: Joi.array()
          .items(
            Joi.object({
              subject: Joi.string().hex().length(24).required(),
              obtained: Joi.number().required(),
              total: Joi.number().required(),
              grade: Joi.string().allow(''),
              remarks: Joi.string().allow(''),
            })
          )
          .required(),
        proofImages: Joi.array().items(Joi.string()).optional(),
      })
    )
    .required(),
});

const datasheetBody = Joi.object({
  name: Joi.string().trim().required(),
  columns: Joi.array().items(Joi.string().trim()).min(1).required(),
  rows: Joi.array().items(Joi.array().items(Joi.string().allow(''))).optional(),
  initialRows: Joi.number().integer().min(0).max(500).optional(),
});

const datasheetPatch = Joi.object({
  name: Joi.string().trim(),
  columns: Joi.array().items(Joi.string().trim()).min(1),
  rows: Joi.array().items(Joi.array().items(Joi.string().allow(''))),
}).min(1);

const announcementBody = Joi.object({
  title: Joi.string().required(),
  body: Joi.string().required(),
  type: Joi.string().valid('holiday', 'fee_reminder', 'test_schedule', 'event', 'urgent', 'general'),
  targetAudience: Joi.string().valid('all', 'class', 'section', 'teachers', 'parents'),
  targetClass: Joi.string().hex().length(24).allow(null),
  targetSection: Joi.string().hex().length(24).allow(null),
  isPinned: Joi.boolean(),
  publishedAt: Joi.date().allow(null),
  expiresAt: Joi.date().allow(null),
});

const conversationBody = Joi.object({
  type: Joi.string().valid('direct', 'class_group', 'subject_group', 'teacher_group', 'staff_group').required(),
  participantIds: Joi.array().items(Joi.string().hex().length(24)).min(2).required(),
  name: Joi.string().when('type', {
    is: Joi.string().valid('class_group', 'subject_group', 'teacher_group', 'staff_group'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  classId: Joi.string().hex().length(24).allow(null),
  subjectId: Joi.string().hex().length(24).allow(null),
});

const messageBody = Joi.object({
  type: Joi.string().valid('text', 'image', 'file', 'voice_note', 'system').default('text'),
  content: Joi.string().allow(''),
  fileUrl: Joi.string().uri().allow('', null),
  fileName: Joi.string().allow('', null),
});

const readMessages = Joi.object({
  messageIds: Joi.array().items(Joi.string().hex().length(24)).min(1).required(),
});

module.exports = {
  login,
  refresh,
  otpSend,
  otpVerify,
  createUser,
  updateUser,
  parentStudentAccess,
  userPermissions,
  sessionBody,
  sessionCloneBody,
  classBody,
  sectionBody,
  sectionPatch,
  subjectBody,
  subjectPatch,
  markAttendance,
  attendanceCorrect,
  feeStructureBody,
  feeVoucherGenerate,
  feePay,
  examBody,
  examPatch,
  examMarks,
  datasheetBody,
  datasheetPatch,
  announcementBody,
  conversationBody,
  messageBody,
  readMessages,
};
