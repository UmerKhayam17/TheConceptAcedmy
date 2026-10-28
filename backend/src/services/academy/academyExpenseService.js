const ApiError = require('../../utils/ApiError');
const AcademyExpense = require('../../models/academy/AcademyExpense');
const { populateCreatedBy } = require('../../utils/createdBy');
const { assertActiveCategory } = require('./expenseCategoryService');

async function buildExpenseQuery({ category, status, month, year, search }) {
  const q = {};
  if (category) q.category = category;
  if (status) q.status = status;
  if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    q.expenseDate = { $gte: start, $lte: end };
  } else if (year) {
    q.expenseDate = {
      $gte: new Date(year, 0, 1),
      $lte: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }
  if (search?.trim()) {
    const s = search.trim();
    q.$or = [
      { title: { $regex: s, $options: 'i' } },
      { vendor: { $regex: s, $options: 'i' } },
      { description: { $regex: s, $options: 'i' } },
      { referenceNumber: { $regex: s, $options: 'i' } },
      { categoryOther: { $regex: s, $options: 'i' } },
    ];
  }
  return q;
}

async function listExpenses({
  page = 1,
  limit = 20,
  category,
  status,
  month,
  year,
  search,
}) {
  const q = await buildExpenseQuery({ category, status, month, year, search });
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const perPage = Math.min(100, Math.max(1, limit));

  const [items, total] = await Promise.all([
    populateCreatedBy(
      AcademyExpense.find(q).sort({ expenseDate: -1, createdAt: -1 }).skip(skip).limit(perPage)
    ),
    AcademyExpense.countDocuments(q),
  ]);

  return {
    items,
    pagination: {
      page: Math.max(1, page),
      limit: perPage,
      total,
      pages: Math.ceil(total / perPage) || 1,
    },
  };
}

function resolveCategoryOther(category, categoryOther) {
  if (category !== 'other') return undefined;
  const label = String(categoryOther || '').trim();
  return label || undefined;
}

async function createExpense(body, userId) {
  const category = await assertActiveCategory(body.category || 'other');
  return AcademyExpense.create({
    ...body,
    category,
    categoryOther: resolveCategoryOther(category, body.categoryOther),
    expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(),
    createdBy: userId,
    recordedBy: userId,
  });
}

async function updateExpense(id, body) {
  const row = await AcademyExpense.findById(id);
  if (!row) throw new ApiError(404, 'Expense not found');
  if (body.title !== undefined) row.title = body.title;
  if (body.category !== undefined) {
    const next = String(body.category).trim().toLowerCase();
    row.category = next === row.category ? row.category : await assertActiveCategory(next);
  }
  if (body.categoryOther !== undefined || body.category !== undefined) {
    const nextCategory = body.category !== undefined ? body.category : row.category;
    const nextOther =
      body.categoryOther !== undefined ? body.categoryOther : row.categoryOther;
    row.categoryOther = resolveCategoryOther(nextCategory, nextOther);
  }
  if (body.amount !== undefined) row.amount = body.amount;
  if (body.expenseDate !== undefined) row.expenseDate = new Date(body.expenseDate);
  if (body.vendor !== undefined) row.vendor = body.vendor;
  if (body.description !== undefined) row.description = body.description;
  if (body.paymentMethod !== undefined) row.paymentMethod = body.paymentMethod;
  if (body.referenceNumber !== undefined) row.referenceNumber = body.referenceNumber;
  if (body.status !== undefined) row.status = body.status;
  await row.save();
  return row;
}

async function deleteExpense(id) {
  const row = await AcademyExpense.findByIdAndDelete(id);
  if (!row) throw new ApiError(404, 'Expense not found');
  return { deleted: true };
}

async function getExpenseSummary({ month, year, category }) {
  const q = await buildExpenseQuery({ month, year, category });
  const records = await AcademyExpense.find(q).lean();

  let totalAmount = 0;
  let paidAmount = 0;
  let plannedAmount = 0;
  const byCategory = {};

  records.forEach((r) => {
    totalAmount += r.amount;
    if (r.status === 'paid') paidAmount += r.amount;
    if (r.status === 'planned') plannedAmount += r.amount;
    byCategory[r.category] = (byCategory[r.category] || 0) + r.amount;
  });

  return {
    recordsCount: records.length,
    totalAmount,
    paidAmount,
    plannedAmount,
    byCategory,
  };
}

module.exports = {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
};
