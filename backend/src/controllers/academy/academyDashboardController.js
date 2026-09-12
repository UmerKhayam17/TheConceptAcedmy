const catchAsync = require('../../utils/catchAsync');
const dashboardService = require('../../services/academy/academyDashboardService');

const overview = catchAsync(async (req, res) => {
  const months = req.query.months ? Number(req.query.months) : 6;
  const data = await dashboardService.getDashboardOverview({
    months: Number.isFinite(months) ? Math.min(12, Math.max(3, months)) : 6,
  });
  res.json({ success: true, data });
});

module.exports = { overview };
