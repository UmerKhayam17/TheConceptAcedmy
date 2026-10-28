const ApiError = require('../../utils/ApiError');
const AcademyExpense = require('../../models/academy/AcademyExpense');
const AcademyExpenseCategory = require('../../models/academy/AcademyExpenseCategory');

/** Column headings from the academy expense sheet. Created only by the seed button. */
const SHEET_EXPENSE_CATEGORIES = [
  'Equipments & Repair',
  'Donation & Charity',
  'Entertainment & Refreshment',
  'Academy Rent',
  'Electricity Bills',
  'U Fone Card',
  'Postpaid',
  'PTCL Bill',
  'Petrol,Oil & Lubricants',
  'Stationary',
  'Printing / Photocopies',
  'Wages and Salaries',
  'Repair and Maintenance',
  'Local Travelling',
  'Misc. Expense',
  'Advertisement',
  'Cash Paid to Sir Imran',
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'category';
}

async function uniqueKey(name) {
  const base = slugify(name);
  let key = base;
  let n = 2;
  while (await AcademyExpenseCategory.exists({ key })) {
    const suffix = `_${n}`;
    key = `${base.slice(0, 48 - suffix.length)}${suffix}`;
    n += 1;
  }
  return key;
}

async function assertUniqueName(name, exceptId) {
  const q = {
    name: new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i'),
  };
  if (exceptId) q._id = { $ne: exceptId };
  const existing = await AcademyExpenseCategory.findOne(q).select('_id').lean();
  if (existing) throw new ApiError(400, 'A category with this name already exists');
}

async function listCategories() {
  const [rows, usage] = await Promise.all([
    AcademyExpenseCategory.find().sort({ sortOrder: 1, name: 1 }).lean(),
    AcademyExpense.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(usage.map((row) => [row._id || '', row.count]));
  return rows.map((row) => ({
    ...row,
    usageCount: counts[row.key] || 0,
  }));
}

async function categoryNameMap() {
  const rows = await listCategories();
  const map = {};
  rows.forEach((row) => {
    map[row.key] = row.name;
  });
  return map;
}

function displayCategory(row, names = {}) {
  if (row?.category === 'other' && String(row.categoryOther || '').trim()) {
    return String(row.categoryOther).trim();
  }
  const key = row?.category || '';
  if (!key) return '—';
  return names[key] || key;
}

async function assertActiveCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  if (!key) throw new ApiError(400, 'Category is required');
  const row = await AcademyExpenseCategory.findOne({ key }).select('key isActive').lean();
  if (!row) {
    throw new ApiError(
      400,
      'Unknown expense category. Add it in Academic Setup → Expense Categories.'
    );
  }
  if (!row.isActive) {
    throw new ApiError(
      400,
      'This category is inactive. Choose an active category or turn it back on in Academic Setup.'
    );
  }
  return row.key;
}

async function seedSheetCategories() {
  const existing = await AcademyExpenseCategory.find().select('name sortOrder').lean();
  const names = new Set(existing.map((row) => String(row.name || '').trim().toLowerCase()));
  let sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder || 0), 0);
  let created = 0;

  for (const name of SHEET_EXPENSE_CATEGORIES) {
    if (names.has(name.toLowerCase())) continue;
    sortOrder += 10;
    await AcademyExpenseCategory.create({
      name,
      key: await uniqueKey(name),
      isActive: true,
      sortOrder,
    });
    names.add(name.toLowerCase());
    created += 1;
  }

  return {
    created,
    skipped: SHEET_EXPENSE_CATEGORIES.length - created,
    total: SHEET_EXPENSE_CATEGORIES.length,
  };
}

async function createCategory({ name, description, isActive }) {
  const label = String(name || '').trim();
  if (!label) throw new ApiError(400, 'Category name is required');
  await assertUniqueName(label);
  const last = await AcademyExpenseCategory.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
  return AcademyExpenseCategory.create({
    name: label,
    description: String(description || '').trim() || undefined,
    key: await uniqueKey(label),
    isActive: isActive !== false,
    sortOrder: (last?.sortOrder || 0) + 10,
  });
}

async function updateCategory(id, body) {
  const row = await AcademyExpenseCategory.findById(id);
  if (!row) throw new ApiError(404, 'Category not found');
  if (body.name !== undefined) {
    const label = String(body.name || '').trim();
    if (!label) throw new ApiError(400, 'Category name is required');
    await assertUniqueName(label, row._id);
    row.name = label;
  }
  if (body.description !== undefined) row.description = String(body.description || '').trim();
  if (body.isActive !== undefined) row.isActive = Boolean(body.isActive);
  await row.save();
  return row;
}

async function deleteCategory(id) {
  const row = await AcademyExpenseCategory.findById(id);
  if (!row) throw new ApiError(404, 'Category not found');
  const used = await AcademyExpense.exists({ category: row.key });
  if (used) {
    throw new ApiError(
      400,
      'This category is used by expenses. Turn it off instead of deleting it.'
    );
  }
  await row.deleteOne();
  return { deleted: true };
}

module.exports = {
  listCategories,
  categoryNameMap,
  displayCategory,
  assertActiveCategory,
  createCategory,
  seedSheetCategories,
  updateCategory,
  deleteCategory,
};
