const { Router } = require('express');
const { protect } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permissions');
const ctrl = require('../controllers/aiAttendanceController');

const router = Router();

/** Inbound from AIAttendance — no JWT; shared secret checked in controller. */
router.post('/webhook', ctrl.webhook);

router.use(protect);

router.get(
  '/status',
  requireAnyPermission('view_attendance', 'mark_attendance', 'manage_users'),
  ctrl.status
);
router.post(
  '/sync-roster',
  requireAnyPermission('manage_users', 'manage_academy_students'),
  ctrl.syncRoster
);
router.post(
  '/sync-attendance',
  requireAnyPermission('mark_attendance', 'manage_users'),
  ctrl.syncAttendance
);
router.get(
  '/people',
  requireAnyPermission('view_attendance', 'manage_users', 'manage_academy_students'),
  ctrl.people
);
router.get(
  '/enroll/:employeeId',
  requireAnyPermission('manage_users', 'manage_academy_students', 'mark_attendance'),
  ctrl.enrollmentStatus
);
router.post(
  '/enroll/:employeeId/capture',
  requireAnyPermission('manage_users', 'manage_academy_students', 'mark_attendance'),
  ctrl.captureFace
);
router.post(
  '/enroll/:employeeId/train',
  requireAnyPermission('manage_users', 'manage_academy_students', 'mark_attendance'),
  ctrl.trainFace
);
router.post(
  '/identify',
  requireAnyPermission('mark_attendance', 'manage_users'),
  ctrl.identify
);
router.get(
  '/cameras',
  requireAnyPermission('view_attendance', 'manage_users'),
  ctrl.cameras
);
router.get(
  '/cameras/:cameraId/snapshot',
  requireAnyPermission('view_attendance', 'manage_users'),
  ctrl.cameraSnapshot
);
router.post(
  '/cameras/action',
  requireAnyPermission('manage_users', 'mark_attendance'),
  ctrl.cctvAction
);

router.get(
  '/staff-attendance',
  requireAnyPermission('view_attendance', 'mark_attendance', 'manage_users'),
  ctrl.listStaffAttendance
);
router.get(
  '/staff-attendance/mine',
  requireAnyPermission('view_attendance', 'mark_attendance', 'manage_users'),
  ctrl.myStaffAttendance
);
router.post(
  '/staff-attendance/manual',
  requireAnyPermission('mark_attendance', 'manage_users'),
  ctrl.markStaffAttendance
);

module.exports = router;
