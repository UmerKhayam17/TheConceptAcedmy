const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const holidayService = require('../services/holidayService');

function rethrow(err) {
  if (err?.statusCode) throw new ApiError(err.statusCode, err.message);
  throw err;
}

const list = catchAsync(async (req, res) => {
  try {
    const data = await holidayService.listForSession(req.params.sessionId, req.user?._id);
    if (!data) throw new ApiError(404, 'Session not found');
    res.json({ success: true, data });
  } catch (err) {
    rethrow(err);
  }
});

const create = catchAsync(async (req, res) => {
  try {
    const data = await holidayService.createHoliday(req.params.sessionId, req.body, req.user?._id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    rethrow(err);
  }
});

const update = catchAsync(async (req, res) => {
  try {
    const data = await holidayService.updateHoliday(req.params.id, req.body, req.user?._id);
    res.json({ success: true, data });
  } catch (err) {
    rethrow(err);
  }
});

const approve = catchAsync(async (req, res) => {
  try {
    const data = await holidayService.approveHoliday(req.params.id, req.user?._id);
    res.json({ success: true, data });
  } catch (err) {
    rethrow(err);
  }
});

const remove = catchAsync(async (req, res) => {
  try {
    const data = await holidayService.deleteHoliday(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    rethrow(err);
  }
});

module.exports = { list, create, update, approve, remove };
