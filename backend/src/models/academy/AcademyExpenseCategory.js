const mongoose = require('mongoose');

const academyExpenseCategorySchema = new mongoose.Schema(
  {
    /** Stable key stored on academy expenses. Renames do not change this. */
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 160 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'expense_categories' }
);

module.exports = mongoose.model('AcademyExpenseCategory', academyExpenseCategorySchema);
