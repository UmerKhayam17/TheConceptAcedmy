const mongoose = require('mongoose');

const academySalaryRecordSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0 },
    /** Snapshot of staff pay type when voucher was generated. */
    payType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed',
    },
    /** Snapshot of percentage rate (for percentage payType). */
    salaryPercentage: { type: Number, min: 0, max: 100, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'paid', 'cancelled'],
      default: 'pending',
      index: true,
    },
    dueDate: { type: Date },
    paidAt: { type: Date },
    voucherNumber: { type: String, trim: true },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'online', 'other'],
      default: 'bank_transfer',
    },
    notes: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'salaryrecords' }
);

academySalaryRecordSchema.index({ staffId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('AcademySalaryRecord', academySalaryRecordSchema);
