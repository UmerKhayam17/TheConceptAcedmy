const { Router } = require('express');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { protect } = require('../middleware/auth');
const { hasModulePermission } = require('../modules');
const { isSystemAdmin } = require('../utils/systemAdmin');
const { getAcademicCalendar } = require('../services/academicCalendarService');

const MONGO_ID = /^[a-f0-9]{24}$/i;

function requireCalendarView(req, res, next) {
  if (isSystemAdmin(req.user) || hasModulePermission(req.user, 'academicCalendar', 'view')) {
    return next();
  }
  return next(new ApiError(403, 'You do not have permission to view the academic calendar'));
}

function optionalId(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  if (!MONGO_ID.test(String(value))) throw new ApiError(400, `Invalid ${name}`);
  return String(value);
}

const router = Router();
router.use(protect);

router.get(
  '/',
  requireCalendarView,
  catchAsync(async (req, res) => {
    const data = await getAcademicCalendar(req, {
      sessionId: optionalId(req.query.sessionId, 'sessionId'),
      classId: optionalId(req.query.classId, 'classId'),
      sectionId: optionalId(req.query.sectionId, 'sectionId'),
    });
    res.json({ success: true, data });
  })
);

module.exports = router;
