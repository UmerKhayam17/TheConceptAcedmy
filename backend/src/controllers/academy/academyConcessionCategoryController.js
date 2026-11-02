const catchAsync = require('../../utils/catchAsync');
const concessionCategoryService = require('../../services/academy/concessionCategoryService');

const listCategories = catchAsync(async (_req, res) => {
  const data = await concessionCategoryService.listCategories();
  res.json({ success: true, data });
});

const createCategory = catchAsync(async (req, res) => {
  const data = await concessionCategoryService.createCategory(req.body);
  res.status(201).json({ success: true, data });
});

const seedCategories = catchAsync(async (_req, res) => {
  const data = await concessionCategoryService.seedDefaultCategories();
  res.status(201).json({ success: true, data });
});

const updateCategory = catchAsync(async (req, res) => {
  const data = await concessionCategoryService.updateCategory(req.params.id, req.body);
  res.json({ success: true, data });
});

const removeCategory = catchAsync(async (req, res) => {
  const data = await concessionCategoryService.deleteCategory(req.params.id);
  res.json({ success: true, data });
});

module.exports = {
  listCategories,
  createCategory,
  seedCategories,
  updateCategory,
  removeCategory,
};
