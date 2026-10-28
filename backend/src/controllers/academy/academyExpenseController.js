const catchAsync = require('../../utils/catchAsync');
const expenseService = require('../../services/academy/academyExpenseService');
const expenseExportService = require('../../services/academy/academyExpenseExportService');
const expenseCategoryService = require('../../services/academy/expenseCategoryService');

const list = catchAsync(async (req, res) => {
  const result = await expenseService.listExpenses({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    category: req.query.category,
    status: req.query.status,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    search: req.query.search,
  });
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

const summary = catchAsync(async (req, res) => {
  const data = await expenseService.getExpenseSummary({
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    category: req.query.category,
  });
  res.json({ success: true, data });
});

const create = catchAsync(async (req, res) => {
  const data = await expenseService.createExpense(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await expenseService.updateExpense(req.params.id, req.body);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  const data = await expenseService.deleteExpense(req.params.id);
  res.json({ success: true, data });
});

const exportReport = catchAsync(async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx';
  const buffer = await expenseExportService.exportExpenseReport({
    format,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    category: req.query.category || undefined,
    status: req.query.status || undefined,
    search: req.query.search || undefined,
  });
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthLabel = req.query.month
    ? monthNames[Number(req.query.month) - 1] || String(req.query.month)
    : 'All';
  const yearLabel = req.query.year || 'All';
  const fileName = `Academy-Expenses_${monthLabel}-${yearLabel}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  } else {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  }
  res.send(Buffer.from(buffer));
});

const listCategories = catchAsync(async (_req, res) => {
  const data = await expenseCategoryService.listCategories();
  res.json({ success: true, data });
});

const createCategory = catchAsync(async (req, res) => {
  const data = await expenseCategoryService.createCategory(req.body);
  res.status(201).json({ success: true, data });
});

const seedCategories = catchAsync(async (_req, res) => {
  const data = await expenseCategoryService.seedSheetCategories();
  res.status(201).json({ success: true, data });
});

const updateCategory = catchAsync(async (req, res) => {
  const data = await expenseCategoryService.updateCategory(req.params.id, req.body);
  res.json({ success: true, data });
});

const removeCategory = catchAsync(async (req, res) => {
  const data = await expenseCategoryService.deleteCategory(req.params.id);
  res.json({ success: true, data });
});

module.exports = {
  list,
  summary,
  create,
  update,
  remove,
  exportReport,
  listCategories,
  createCategory,
  seedCategories,
  updateCategory,
  removeCategory,
};
