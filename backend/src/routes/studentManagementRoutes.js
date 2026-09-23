const { Router } = require('express');
const { protect } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/academySchemas');

const classCtrl = require('../controllers/academy/academyClassController');
const subjectCtrl = require('../controllers/academy/academySubjectController');
const sectionCtrl = require('../controllers/academy/academySectionController');
const feeStructureCtrl = require('../controllers/academy/academyFeeStructureController');
const studentCtrl = require('../controllers/academy/academyStudentController');
const feeCtrl = require('../controllers/academy/academyFeeController');
const salaryCtrl = require('../controllers/academy/academySalaryController');
const expenseCtrl = require('../controllers/academy/academyExpenseController');
const attendanceCtrl = require('../controllers/academy/academyAttendanceController');
const assessmentCtrl = require('../controllers/academy/academyAssessmentController');
const classTestCtrl = require('../controllers/academy/academyClassTestController');
const dashboardCtrl = require('../controllers/academy/academyDashboardController');
const { uploadImage } = require('../middleware/uploadImage');

const router = Router();
router.use(protect);

router.get(
  '/dashboard/overview',
  requireAnyPermission(
    'view_academy_fee_reports',
    'manage_academy_fees',
    'view_attendance',
    'manage_users'
  ),
  dashboardCtrl.overview
);

// Classes
router.get(
  '/classes',
  requireAnyPermission(
    'view_academy_students',
    'manage_academy_classes',
    'enter_exam_marks',
    'view_results'
  ),
  classCtrl.list
);
router.post('/classes', requirePermission('manage_academy_classes'), validate(schemas.academyClassBody), classCtrl.create);
router.patch(
  '/classes/:id',
  requirePermission('manage_academy_classes'),
  validate(schemas.academyClassPatch),
  classCtrl.update
);
router.delete('/classes/:id', requirePermission('manage_academy_classes'), classCtrl.remove);
router.get(
  '/classes/:id',
  requireAnyPermission('view_academy_students', 'manage_academy_classes'),
  classCtrl.getOne
);
router.get(
  '/classes/:id/record',
  requireAnyPermission('view_academy_students', 'manage_academy_classes'),
  classCtrl.getRecord
);

// Sections
router.get(
  '/sections',
  requireAnyPermission(
    'view_academy_students',
    'manage_academy_classes',
    'manage_academy_students',
    'enter_exam_marks',
    'view_results'
  ),
  sectionCtrl.listBySession
);
router.get(
  '/classes/:classId/sections',
  requireAnyPermission(
    'view_academy_students',
    'manage_academy_classes',
    'manage_academy_students',
    'enter_exam_marks',
    'view_results'
  ),
  sectionCtrl.listByClass
);
router.post(
  '/sections',
  requirePermission('manage_academy_classes'),
  validate(schemas.academySectionBody),
  sectionCtrl.create
);
router.patch(
  '/sections/:id',
  requirePermission('manage_academy_classes'),
  validate(schemas.academySectionPatch),
  sectionCtrl.update
);
router.delete('/sections/:id', requirePermission('manage_academy_classes'), sectionCtrl.remove);

// Subjects
router.get(
  '/classes/:classId/subjects',
  requireAnyPermission(
    'view_academy_students',
    'manage_academy_subjects',
    'enter_exam_marks',
    'view_results'
  ),
  subjectCtrl.listByClass
);
router.post(
  '/subjects',
  requirePermission('manage_academy_subjects'),
  validate(schemas.academySubjectBody),
  subjectCtrl.create
);
router.post(
  '/classes/:classId/subjects/bulk-choice',
  requirePermission('manage_academy_subjects'),
  validate(schemas.academySubjectBulkChoiceBody),
  subjectCtrl.createBulkChoice
);
router.get(
  '/classes/:classId/enrollment-subjects',
  requireAnyPermission('view_academy_students', 'manage_academy_students', 'manage_academy_subjects'),
  subjectCtrl.enrollmentLayout
);
router.get(
  '/classes/:classId/choice-groups',
  requireAnyPermission('view_academy_students', 'manage_academy_subjects', 'manage_academy_students'),
  subjectCtrl.listChoiceGroups
);
router.patch(
  '/subjects/:id',
  requirePermission('manage_academy_subjects'),
  validate(schemas.academySubjectPatch),
  subjectCtrl.update
);
router.delete('/subjects/:id', requirePermission('manage_academy_subjects'), subjectCtrl.remove);

// Fee structure
router.get(
  '/fee-structures',
  requireAnyPermission('view_academy_students', 'manage_academy_fee_structures'),
  feeStructureCtrl.list
);
router.get(
  '/fee-structures/class/:classId',
  requireAnyPermission('view_academy_students', 'manage_academy_fee_structures'),
  feeStructureCtrl.getByClass
);
router.post(
  '/fee-structures',
  requirePermission('manage_academy_fee_structures'),
  validate(schemas.academyFeeStructureBody),
  feeStructureCtrl.create
);
router.patch(
  '/fee-structures/:id',
  requirePermission('manage_academy_fee_structures'),
  validate(schemas.academyFeeStructurePatch),
  feeStructureCtrl.update
);
router.delete(
  '/fee-structures/:id',
  requirePermission('manage_academy_fee_structures'),
  feeStructureCtrl.remove
);
router.post(
  '/fee-structures/preview',
  requireAnyPermission('view_academy_students', 'manage_academy_students'),
  validate(schemas.feePreview),
  feeStructureCtrl.preview
);

// Students
router.post(
  '/students/preview-fees',
  requireAnyPermission('manage_academy_students', 'view_academy_students'),
  validate(schemas.feePreview),
  studentCtrl.previewFees
);
router.post(
  '/students/provisional',
  requireAnyPermission('temporary_register_student', 'manage_academy_students', 'activate_student'),
  validate(schemas.academyStudentProvisional),
  studentCtrl.registerProvisional
);
router.post(
  '/students',
  requirePermission('manage_academy_students'),
  validate(schemas.academyStudentRegister),
  studentCtrl.register
);
router.post(
  '/students/direct',
  requireAnyPermission('activate_student', 'manage_academy_students'),
  validate(schemas.academyStudentDirectRegister),
  studentCtrl.registerDirect
);
router.get(
  '/students/export',
  requirePermission('view_academy_students'),
  studentCtrl.exportStudents
);
router.get('/students', requirePermission('view_academy_students'), studentCtrl.list);
router.get(
  '/students/discount-report',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  validate(schemas.discountReportQuery, 'query'),
  studentCtrl.discountReport
);
router.get('/students/:id/record', requirePermission('view_academy_students'), studentCtrl.getRecord);
router.get(
  '/class-tests',
  requireAnyPermission('view_academy_students', 'enter_exam_marks', 'view_results'),
  classTestCtrl.list
);
router.post(
  '/class-tests',
  requireAnyPermission('enter_exam_marks', 'manage_academy_students'),
  validate(schemas.academyClassTestBody),
  classTestCtrl.create
);
router.get(
  '/class-tests/:id/entry',
  requireAnyPermission('view_academy_students', 'enter_exam_marks', 'view_results'),
  classTestCtrl.getEntry
);
router.post(
  '/class-tests/:id/students/:studentId/test-paper',
  requireAnyPermission('enter_exam_marks', 'manage_academy_students'),
  uploadImage.single('testPaper'),
  classTestCtrl.uploadTestPaper
);
router.post(
  '/class-tests/:id/marks',
  requireAnyPermission('enter_exam_marks', 'manage_academy_students'),
  validate(schemas.academyClassTestMarksBody),
  classTestCtrl.saveMarks
);
router.delete(
  '/class-tests/:id',
  requireAnyPermission('enter_exam_marks', 'manage_academy_students'),
  classTestCtrl.remove
);
router.get(
  '/assessments/class-entry',
  requireAnyPermission('view_academy_students', 'enter_exam_marks', 'view_results'),
  validate(schemas.academyAssessmentSessionQuery, 'query'),
  assessmentCtrl.classEntry
);
router.post(
  '/assessments/bulk',
  requireAnyPermission('enter_exam_marks', 'manage_academy_students'),
  validate(schemas.academyAssessmentBulkBody),
  assessmentCtrl.bulkSave
);
router.get(
  '/students/:studentId/assessments',
  requirePermission('view_academy_students'),
  assessmentCtrl.list
);
router.post(
  '/students/:studentId/assessments',
  requireAnyPermission('enter_exam_marks', 'manage_academy_students'),
  validate(schemas.academyAssessmentBody),
  assessmentCtrl.create
);
router.patch(
  '/assessments/:id',
  requireAnyPermission('enter_exam_marks', 'manage_academy_students'),
  validate(schemas.academyAssessmentPatch),
  assessmentCtrl.update
);
router.delete(
  '/assessments/:id',
  requireAnyPermission('enter_exam_marks', 'manage_academy_students'),
  assessmentCtrl.remove
);
router.get('/students/:id', requirePermission('view_academy_students'), studentCtrl.getById);
router.post(
  '/students/:id/activate',
  requireAnyPermission('activate_student', 'manage_academy_fees', 'manage_academy_students'),
  validate(schemas.academyStudentActivate),
  studentCtrl.activate
);
router.post(
  '/students/:id/photo',
  requirePermission('manage_academy_students'),
  uploadImage.single('photo'),
  studentCtrl.uploadPhoto
);
router.patch(
  '/students/:id',
  requirePermission('manage_academy_students'),
  validate(schemas.academyStudentPatch),
  studentCtrl.update
);
router.delete('/students/:id', requirePermission('manage_academy_students'), studentCtrl.remove);

// Fee management
router.get(
  '/fees/summary',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  feeCtrl.summary
);
router.get(
  '/fees/defaulters/summary',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  feeCtrl.defaultersSummary
);
router.get(
  '/fees/defaulters/export',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  feeCtrl.exportDefaulters
);
router.get(
  '/fees/defaulters/export-month-wise',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  feeCtrl.exportDefaultersMonthWise
);
router.get(
  '/fees/defaulters',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  feeCtrl.defaulters
);
router.get(
  '/fees',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  feeCtrl.list
);
router.post(
  '/fees/generate',
  requirePermission('manage_academy_fees'),
  validate(schemas.academyFeeGenerate),
  feeCtrl.generate
);
router.get(
  '/fees/challan/:studentId',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  feeCtrl.challan
);
router.get(
  '/fees/:id/receipt',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  feeCtrl.receipt
);
router.post(
  '/fees/pay',
  requirePermission('manage_academy_fees'),
  validate(schemas.academyFeePayMany),
  feeCtrl.payMany
);
router.patch(
  '/fees/:id/pay',
  requirePermission('manage_academy_fees'),
  validate(schemas.academyFeePay),
  feeCtrl.pay
);
router.get(
  '/fees/student/:studentId',
  requireAnyPermission('view_academy_fee_reports', 'manage_academy_fees'),
  feeCtrl.studentHistory
);

// Teacher / staff salary
router.get(
  '/salaries/summary',
  requireAnyPermission('view_academy_salaries', 'manage_academy_salaries'),
  salaryCtrl.summary
);
router.get(
  '/salaries',
  requireAnyPermission('view_academy_salaries', 'manage_academy_salaries'),
  salaryCtrl.list
);
router.post(
  '/salaries/generate',
  requirePermission('manage_academy_salaries'),
  validate(schemas.academySalaryGenerate),
  salaryCtrl.generate
);
router.patch(
  '/salaries/:id/pay',
  requirePermission('manage_academy_salaries'),
  validate(schemas.academySalaryPay),
  salaryCtrl.pay
);

// Academy expenses
router.get(
  '/expenses/summary',
  requireAnyPermission('view_academy_expenses', 'manage_academy_expenses'),
  expenseCtrl.summary
);
router.get(
  '/expenses',
  requireAnyPermission('view_academy_expenses', 'manage_academy_expenses'),
  expenseCtrl.list
);
router.post(
  '/expenses',
  requirePermission('manage_academy_expenses'),
  validate(schemas.academyExpenseBody),
  expenseCtrl.create
);
router.patch(
  '/expenses/:id',
  requirePermission('manage_academy_expenses'),
  validate(schemas.academyExpensePatch),
  expenseCtrl.update
);
router.delete(
  '/expenses/:id',
  requirePermission('manage_academy_expenses'),
  expenseCtrl.remove
);

// Academy attendance (tuition students)
router.get(
  '/attendance/summary',
  requirePermission('view_attendance'),
  attendanceCtrl.summary
);
router.get(
  '/attendance/export',
  requireAnyPermission('view_attendance', 'mark_attendance'),
  attendanceCtrl.exportAttendance
);
router.get(
  '/attendance',
  requireAnyPermission('view_attendance', 'mark_attendance'),
  attendanceCtrl.list
);
router.post(
  '/attendance/mark',
  requirePermission('mark_attendance'),
  validate(schemas.academyAttendanceMark),
  attendanceCtrl.mark
);

module.exports = router;
