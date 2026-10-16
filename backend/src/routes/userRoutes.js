const { Router } = require('express');
const ctrl = require('../controllers/userController');
const staffReportCtrl = require('../controllers/staffReportController');
const { protect } = require('../middleware/auth');
const { requirePermission, requireAnyAccountModule } = require('../middleware/permissions');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { uploadImage } = require('../middleware/uploadImage');

const router = Router();
router.use(protect);

router.get('/modules-registry', requireAnyAccountModule('view'), ctrl.listModuleRegistry);
router.post('/bulk', requireAnyAccountModule('view'), validate(schemas.bulkUsers), ctrl.bulkUsers);
router.post('/:id/profile-photo', requireAnyAccountModule('edit'), uploadImage.single('photo'), ctrl.uploadProfilePhoto);
router.get('/', requireAnyAccountModule('view'), ctrl.listUsers);
router.post('/', requireAnyAccountModule('create'), validate(schemas.createUser), ctrl.createUser);
router.patch('/:id', requireAnyAccountModule('edit'), validate(schemas.updateUser), ctrl.updateUser);
router.delete('/:id', requireAnyAccountModule('delete'), ctrl.deleteUser);
router.patch('/:id/permissions', requirePermission('manage_roles'), validate(schemas.userPermissions), ctrl.patchPermissions);
router.patch('/:id/module-permissions', requirePermission('manage_roles'), ctrl.patchModulePermissions);
router.delete('/:id/module-permissions', requirePermission('manage_roles'), ctrl.revokeModulePermissions);
router.get('/:id/parent-students', requireAnyAccountModule('view'), ctrl.getParentStudents);
router.get('/:id/report', requireAnyAccountModule('view'), staffReportCtrl.exportStaffReport);
router.patch('/:id/parent-students', requireAnyAccountModule('edit'), validate(schemas.parentStudentAccess), ctrl.patchParentStudents);

module.exports = router;
