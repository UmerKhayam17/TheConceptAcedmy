const catchAsync = require('../../utils/catchAsync');
const dashboardService = require('../../services/academy/academyDashboardService');
const balanceSheetService = require('../../services/academy/academyBalanceSheetService');
const balanceSheetPdfService = require('../../services/academy/academyBalanceSheetPdfService');

const overview = catchAsync(async (req, res) => {
  const months = req.query.months ? Number(req.query.months) : 6;
  const data = await dashboardService.getDashboardOverview({
    months: Number.isFinite(months) ? Math.min(12, Math.max(3, months)) : 6,
  });
  res.json({ success: true, data });
});

const balanceSheet = catchAsync(async (req, res) => {
  const data = await balanceSheetService.getBalanceSheet({
    from: req.query.from,
    to: req.query.to,
    sessionId: req.query.sessionId,
  });
  res.json({ success: true, data });
});

const openingBalance = catchAsync(async (req, res) => {
  const data = await balanceSheetService.getOpeningBalance(req.query.sessionId);
  res.json({ success: true, data });
});

const saveOpeningBalance = catchAsync(async (req, res) => {
  const data = await balanceSheetService.saveOpeningBalance(req.body, req.user._id);
  res.json({ success: true, data });
});

const balanceSheetPdf = catchAsync(async (req, res) => {
  const { buffer, range } = await balanceSheetPdfService.getBalanceSheetPdf({
    from: req.query.from,
    to: req.query.to,
    sessionId: req.query.sessionId,
  });
  const filename = `Balance-Sheet_${range.from}_to_${range.to}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

module.exports = { overview, balanceSheet, balanceSheetPdf, openingBalance, saveOpeningBalance };
