const ApiError = require('../../utils/ApiError');
const AcademyConcessionCategory = require('../../models/academy/AcademyConcessionCategory');
const AcademyStudent = require('../../models/academy/AcademyStudent');

/** Default concession discount categories. Created only by the seed button. */
const DEFAULT_CONCESSION_CATEGORIES = [
  { name: 'Sibling Concession', discountPercent: 10 },
  { name: 'Staff Child', discountPercent: 50 },
  { name: 'Merit / Scholarship', discountPercent: 25 },
  { name: 'Orphan', discountPercent: 50 },
  { name: 'Need Based', discountPercent: 20 },
  { name: 'Full Fee Waiver', discountPercent: 100 },
  { name: 'Special Case', discountPercent: 0 },
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

function normalizeDiscountPercent(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, 'Discount percentage is required');
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ApiError(400, 'Discount percentage must be between 0 and 100');
  }
  return Math.round(n * 100) / 100;
}

async function uniqueKey(name) {
  const base = slugify(name);
  let key = base;
  let n = 2;
  while (await AcademyConcessionCategory.exists({ key })) {
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
  const existing = await AcademyConcessionCategory.findOne(q).select('_id').lean();
  if (existing) throw new ApiError(400, 'A category with this name already exists');
}

async function listCategories() {
  const rows = await AcademyConcessionCategory.find().sort({ sortOrder: 1, name: 1 }).lean();
  const usage = await AcademyStudent.aggregate([
    { $match: { concessionCategory: { $nin: [null, ''] } } },
    { $group: { _id: '$concessionCategory', count: { $sum: 1 } } },
  ]);
  const usageByKey = Object.fromEntries(usage.map((u) => [u._id, u.count]));
  return rows.map((row) => ({
    ...row,
    discountPercent: Number(row.discountPercent) || 0,
    usageCount: usageByKey[row.key] || 0,
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

async function assertActiveCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  if (!key) throw new ApiError(400, 'Concession discount category is required');
  const row = await AcademyConcessionCategory.findOne({ key }).select('key isActive').lean();
  if (!row) {
    throw new ApiError(
      400,
      'Unknown concession discount category. Add it in Academic Setup → Concession Discount Categories.'
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

async function seedDefaultCategories() {
  const existing = await AcademyConcessionCategory.find().select('name sortOrder').lean();
  const names = new Set(existing.map((row) => String(row.name || '').trim().toLowerCase()));
  let sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder || 0), 0);
  let created = 0;

  for (const item of DEFAULT_CONCESSION_CATEGORIES) {
    if (names.has(item.name.toLowerCase())) continue;
    sortOrder += 10;
    await AcademyConcessionCategory.create({
      name: item.name,
      key: await uniqueKey(item.name),
      discountPercent: item.discountPercent,
      isActive: true,
      sortOrder,
    });
    names.add(item.name.toLowerCase());
    created += 1;
  }

  return {
    created,
    skipped: DEFAULT_CONCESSION_CATEGORIES.length - created,
    total: DEFAULT_CONCESSION_CATEGORIES.length,
  };
}

async function createCategory({ name, description, discountPercent, isActive }) {
  const label = String(name || '').trim();
  if (!label) throw new ApiError(400, 'Category name is required');
  await assertUniqueName(label);
  const percent = normalizeDiscountPercent(discountPercent, { required: true });
  const last = await AcademyConcessionCategory.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
  return AcademyConcessionCategory.create({
    name: label,
    description: String(description || '').trim() || undefined,
    discountPercent: percent,
    key: await uniqueKey(label),
    isActive: isActive !== false,
    sortOrder: (last?.sortOrder || 0) + 10,
  });
}

async function updateCategory(id, body) {
  const row = await AcademyConcessionCategory.findById(id);
  if (!row) throw new ApiError(404, 'Category not found');
  if (body.name !== undefined) {
    const label = String(body.name || '').trim();
    if (!label) throw new ApiError(400, 'Category name is required');
    await assertUniqueName(label, row._id);
    row.name = label;
  }
  if (body.description !== undefined) row.description = String(body.description || '').trim();
  if (body.discountPercent !== undefined) {
    row.discountPercent = normalizeDiscountPercent(body.discountPercent, { required: true });
  }
  if (body.isActive !== undefined) row.isActive = Boolean(body.isActive);
  await row.save();
  return row;
}

async function deleteCategory(id) {
  const row = await AcademyConcessionCategory.findById(id);
  if (!row) throw new ApiError(404, 'Category not found');
  await row.deleteOne();
  return { deleted: true };
}

module.exports = {
  listCategories,
  categoryNameMap,
  assertActiveCategory,
  createCategory,
  seedDefaultCategories,
  updateCategory,
  deleteCategory,
};
