const { Router } = require('express');
const ctrl = require('../controllers/roleController');
const { protect } = require('../middleware/auth');
const { requireAnyAccountModule } = require('../middleware/permissions');

const router = Router();
router.use(protect);

router.get('/roles', requireAnyAccountModule('view'), ctrl.listRoles);
router.get(
  '/permissions',
  requireAnyAccountModule('view'),
  ctrl.listPermissions
);

module.exports = router;
