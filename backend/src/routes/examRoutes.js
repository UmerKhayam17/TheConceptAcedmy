const { Router } = require('express');
const ctrl = require('../controllers/examController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { uploadImage } = require('../middleware/uploadImage');

const router = Router();
router.use(protect);

router.post('/exams', requirePermission('manage_exams'), validate(schemas.examBody), ctrl.createExam);
router.get('/exams', requirePermission('view_results'), ctrl.listExams);
router.get('/exams/:id', requirePermission('view_results'), ctrl.getExam);
router.patch('/exams/:id', requirePermission('manage_exams'), validate(schemas.examPatch), ctrl.updateExam);
router.get('/exams/:id/students', requirePermission('view_results'), ctrl.getExamStudents);
router.get(
  '/exams/:id/award-list.pdf',
  requirePermission('view_results'),
  ctrl.awardListPdf
);
router.get(
  '/exams/:id/marks-report.pdf',
  requirePermission('view_results'),
  ctrl.marksReportPdf
);
router.post('/exams/:id/results', requirePermission('enter_exam_marks'), validate(schemas.examMarks), ctrl.enterMarks);
router.post(
  '/exams/:id/students/:studentId/subjects/:subjectId/paper',
  requirePermission('enter_exam_marks'),
  uploadImage.single('testPaper'),
  ctrl.uploadExamPaper
);
router.get('/exams/:id/results', requirePermission('view_results'), ctrl.getExamResults);
router.post('/exams/:id/publish-all', requirePermission('publish_results'), ctrl.publishAll);
router.get('/results/student/:id', requirePermission('view_results'), ctrl.studentResults);
router.patch('/results/:id/publish', requirePermission('publish_results'), ctrl.publishResult);
router.get('/results/:id/pdf', requirePermission('view_results'), ctrl.resultPdf);

module.exports = router;
