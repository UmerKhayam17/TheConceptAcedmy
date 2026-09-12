const { Router } = require('express');
const ctrl = require('../controllers/userController');
const staffReportCtrl = require('../controllers/staffReportController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { uploadImage } = require('../middleware/uploadImage');

const router = Router();
router.use(protect);

router.get('/modules-registry', requirePermission('manage_users'), ctrl.listModuleRegistry);
router.post('/:id/profile-photo', requirePermission('manage_users'), uploadImage.single('photo'), ctrl.uploadProfilePhoto);
router.get('/', requirePermission('manage_users'), ctrl.listUsers);
router.post('/', requirePermission('manage_users'), validate(schemas.createUser), ctrl.createUser);
router.patch('/:id', requirePermission('manage_users'), validate(schemas.updateUser), ctrl.updateUser);
router.patch('/:id/permissions', requirePermission('manage_roles'), validate(schemas.userPermissions), ctrl.patchPermissions);
router.patch('/:id/module-permissions', requirePermission('manage_roles'), ctrl.patchModulePermissions);
router.delete('/:id/module-permissions', requirePermission('manage_roles'), ctrl.revokeModulePermissions);
router.get('/:id/parent-students', requirePermission('manage_users'), ctrl.getParentStudents);
router.get('/:id/report', requirePermission('manage_users'), staffReportCtrl.exportStaffReport);
router.patch('/:id/parent-students', requirePermission('manage_users'), validate(schemas.parentStudentAccess), ctrl.patchParentStudents);

module.exports = router;
