const mongoose = require('mongoose');

const academyExpenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    /** Key from Academic Setup → Expense Categories. */
    category: { type: String, required: true, trim: true, lowercase: true, index: true },
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
