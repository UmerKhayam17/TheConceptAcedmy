const { Router } = require('express');
const Joi = require('joi');
const ctrl = require('../controllers/holidayController');
const { protect } = require('../middleware/auth');
const { hasLegacyOrModulePermission } = require('../middleware/permissions');
const { validate } = require('../middleware/validate');
const { hasModulePermission } = require('../modules');
const { isSystemAdmin } = require('../utils/systemAdmin');
const ApiError = require('../utils/ApiError');

const ymd = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const category = Joi.string().valid('public', 'islamic', 'government', 'vacation');

const appliesTo = Joi.object({
  students: Joi.boolean(),
  teachers: Joi.boolean(),
  staff: Joi.boolean(),
});

const createBody = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  shortName: Joi.string().trim().max(40).allow(''),
  category: category.required(),
  source: Joi.string().valid('builtin', 'hijri', 'government', 'manual'),
  startDate: ymd.required(),
  endDate: ymd.required(),
  status: Joi.string().valid('pending', 'approved'),
  appliesTo,
  notes: Joi.string().trim().max(500).allow(''),
});

const updateBody = Joi.object({
  name: Joi.string().trim().min(2).max(80),
  shortName: Joi.string().trim().max(40).allow(''),
  category,
  startDate: ymd,
  endDate: ymd,
  status: Joi.string().valid('pending', 'approved'),
  appliesTo,
  notes: Joi.string().trim().max(500).allow(''),
}).min(1);

function requireHolidayAccess(...actions) {
  return (req, res, next) => {
    if (isSystemAdmin(req.user)) return next();
    const allowed = actions.some(
      (action) =>
        hasModulePermission(req.user, 'holidays', action) ||
        hasModulePermission(req.user, 'sessions', action) ||
        (action !== 'delete' && hasLegacyOrModulePermission(req.user, 'manage_sessions'))
    );
    if (!allowed) return next(new ApiError(403, 'You do not have permission for this action'));
    return next();
  };
}

const router = Router();
router.use(protect);

router.get('/sessions/:sessionId/holidays', requireHolidayAccess('view'), ctrl.list);
router.post(
  '/sessions/:sessionId/holidays',
  requireHolidayAccess('create', 'edit'),
  validate(createBody),
  ctrl.create
);
router.patch('/holidays/:id', requireHolidayAccess('edit'), validate(updateBody), ctrl.update);
router.post('/holidays/:id/approve', requireHolidayAccess('edit', 'create'), ctrl.approve);
router.delete('/holidays/:id', requireHolidayAccess('delete', 'edit'), ctrl.remove);

module.exports = router;
