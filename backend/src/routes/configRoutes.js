const { Router } = require('express');
const ctrl = require('../controllers/configController');
const sessionHistoryCtrl = require('../controllers/sessionHistoryController');
const academyImportCtrl = require('../controllers/academy/academySessionImportController');
const assessmentPlanCtrl = require('../controllers/academy/assessmentPlanController');
const academySchemas = require('../validators/academySchemas');
const { protect } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = Router();
router.use(protect);

router.get(
  '/system-modules',
  requireAnyPermission('manage_roles', 'manage_users'),
  ctrl.listSystemModules
);

router.get('/sessions', requireAnyPermission('manage_sessions', 'generate_vouchers', 'temporary_register_student', 'activate_student', 'view_results', 'view_students', 'enter_exam_marks', 'manage_exams'), ctrl.listSessions);
router.post('/sessions', requirePermission('manage_sessions'), validate(schemas.sessionBody), ctrl.createSession);
router.patch('/sessions/:id', requirePermission('manage_sessions'), ctrl.patchSession);
router.get('/sessions/:id/history', requireAnyPermission('manage_sessions', 'view_timetables'), sessionHistoryCtrl.getHistory);
router.post('/sessions/:id/complete', requirePermission('manage_sessions'), sessionHistoryCtrl.complete);
router.post('/sessions/:id/archive', requirePermission('manage_sessions'), sessionHistoryCtrl.archive);
router.post('/sessions/:id/activate', requirePermission('manage_sessions'), sessionHistoryCtrl.activate);
router.post(
  '/sessions/:id/clone-structure',
  requirePermission('manage_sessions'),
  validate(schemas.sessionCloneBody),
  sessionHistoryCtrl.cloneStructure
);
router.post(
  '/sessions/:sessionId/import-enrollment',
  requirePermission('manage_sessions'),
  validate(academySchemas.academySessionImportBody),
  academyImportCtrl.importEnrollment
);

router.post(
  '/sessions/:sessionId/shift-configuration',
  requirePermission('manage_sessions'),
  validate(academySchemas.academySessionImportBody),
  sessionHistoryCtrl.shiftConfiguration
);

const planSessionPerm = requireAnyPermission(
  'manage_sessions',
  'manage_exams',
  'enter_exam_marks',
  'view_results',
  'view_students'
);

router.get('/sessions/:sessionId/assessment-plan', planSessionPerm, assessmentPlanCtrl.getPlan);
router.post(
  '/sessions/:sessionId/assessment-plan/items',
  requireAnyPermission('manage_sessions', 'manage_exams'),
  assessmentPlanCtrl.addItem
);
router.delete(
  '/sessions/:sessionId/assessment-plan/items/:itemId',
  requireAnyPermission('manage_sessions', 'manage_exams'),
  assessmentPlanCtrl.deleteItem
);
router.post(
  '/sessions/:sessionId/assessment-plan/clear',
  requireAnyPermission('manage_sessions', 'manage_exams'),
  assessmentPlanCtrl.clear
);
router.patch(
  '/sessions/:sessionId/assessment-plan/items/:itemId',
  requireAnyPermission('manage_sessions', 'manage_exams'),
  assessmentPlanCtrl.updateItem
);

router.get(
  '/sessions/:sessionId/assessment-assignments',
  planSessionPerm,
  assessmentPlanCtrl.listAssignments
);
router.get(
  '/sessions/:sessionId/teacher-test-scope',
  requireAnyPermission('manage_sessions', 'manage_exams', 'enter_exam_marks', 'view_results'),
  assessmentPlanCtrl.teacherTestScope
);
router.post(
  '/sessions/:sessionId/assessment-assignments',
  requireAnyPermission('manage_sessions', 'manage_exams', 'enter_exam_marks'),
  assessmentPlanCtrl.createAssignment
);
router.patch(
  '/sessions/:sessionId/assessment-assignments/:assignmentId',
  requireAnyPermission('manage_sessions', 'manage_exams', 'enter_exam_marks'),
  assessmentPlanCtrl.updateAssignment
);
router.put(
  '/sessions/:sessionId/assessment-assignments/:assignmentId/papers',
  requireAnyPermission('manage_sessions', 'manage_exams', 'enter_exam_marks'),
  assessmentPlanCtrl.upsertPapers
);
router.delete(
  '/sessions/:sessionId/assessment-assignments/:assignmentId',
  requireAnyPermission('manage_sessions', 'manage_exams', 'enter_exam_marks'),
  assessmentPlanCtrl.deleteAssignment
);
router.post(
  '/sessions/:sessionId/assessment-assignments/:assignmentId/publish',
  requireAnyPermission('manage_sessions', 'manage_exams', 'publish_results', 'enter_exam_marks'),
  assessmentPlanCtrl.publishAssignment
);
router.get(
  '/sessions/:sessionId/assessment-plan/date-sheet',
  planSessionPerm,
  assessmentPlanCtrl.dateSheet
);

router.get('/classes', requireAnyPermission('manage_classes', 'view_timetables', 'view_students', 'mark_attendance'), ctrl.listClasses);
router.post('/classes', requirePermission('manage_classes'), validate(schemas.classBody), ctrl.createClass);
router.patch('/classes/:id', requirePermission('manage_classes'), ctrl.patchClass);

router.get('/sections', requireAnyPermission('manage_classes', 'view_timetables', 'view_students', 'mark_attendance'), ctrl.listSections);
router.post('/sections', requirePermission('manage_classes'), validate(schemas.sectionBody), ctrl.createSection);
router.patch('/sections/:id', requirePermission('manage_classes'), validate(schemas.sectionPatch), ctrl.patchSection);
router.delete('/sections/:id', requirePermission('manage_classes'), ctrl.deleteSection);

router.get('/subjects', requireAnyPermission('manage_classes', 'view_timetables', 'enter_exam_marks'), ctrl.listSubjects);
router.post('/subjects', requirePermission('manage_classes'), validate(schemas.subjectBody), ctrl.createSubject);
router.patch('/subjects/:id', requirePermission('manage_classes'), validate(schemas.subjectPatch), ctrl.patchSubject);

module.exports = router;
