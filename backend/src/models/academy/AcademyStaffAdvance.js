const mongoose = require('mongoose');

/**
 * Money given to a staff member ahead of salary.
 *  - advance → recovered in full from the next salary voucher(s)
 *  - loan    → recovered in monthly installments (installmentAmount)
 * Recovery happens when a salary voucher carrying a deduction is marked paid.
 */
const repaymentSchema = new mongoose.Schema(
  {
    salaryRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySalaryRecord' },
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
    amount: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const academyStaffAdvanceSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['advance', 'loan'], required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    givenDate: { type: Date, required: true },
    /** First salary month the deduction applies to. */
    startMonth: { type: Number, required: true, min: 1, max: 12 },
    startYear: { type: Number, required: true },
    /** Monthly deduction for loans. For advances it equals the full amount. */
    installmentAmount: { type: Number, required: true, min: 1 },
    recoveredAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['active', 'closed', 'cancelled'],
      default: 'active',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'online', 'other'],
      default: 'cash',
    },
    notes: { type: String, trim: true },
    repayments: [repaymentSchema],
    closedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'staffadvances' }
);

academyStaffAdvanceSchema.virtual('remainingAmount').get(function remaining() {
  return Math.max(0, Math.round(((this.amount || 0) - (this.recoveredAmount || 0)) * 100) / 100);
});

academyStaffAdvanceSchema.set('toJSON', { virtuals: true });
academyStaffAdvanceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AcademyStaffAdvance', academyStaffAdvanceSchema);
