const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = [
  'rent',
  'utilities',
  'supplies',
  'maintenance',
  'marketing',
  'transport',
  'staff_other',
  'other',
];

const academyExpenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: 'other', index: true },
    /** Free-text category name when category is `other`. */
    categoryOther: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    expenseDate: { type: Date, required: true, index: true },
    vendor: { type: String, trim: true },
    description: { type: String, trim: true },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'online', 'cheque', 'other'],
      default: 'cash',
    },
    referenceNumber: { type: String, trim: true },
    status: { type: String, enum: ['paid', 'planned'], default: 'paid', index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'expenses' }
);

module.exports = mongoose.model('AcademyExpense', academyExpenseSchema);
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
