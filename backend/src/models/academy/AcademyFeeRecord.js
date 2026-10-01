const mongoose = require('mongoose');

const academyFeeRecordSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyStudent', required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0 },
    feeType: {
      type: String,
      enum: ['admission', 'monthly', 'stationery'],
      default: 'monthly',
    },
    status: { type: String, enum: ['pending', 'paid', 'overdue', 'waived'], default: 'pending', index: true },
    dueDate: { type: Date },
    paidAt: { type: Date },
    receiptNumber: { type: String, trim: true },
    paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'online', 'other'], default: 'cash' },
    notes: { type: String, trim: true },
    /**
     * Optional breakdown of `amount` (tuition, admission, additional charges).
     * Older records omit this and keep their original amount unchanged.
     */
    components: [{
      name: { type: String, trim: true },
      amount: { type: Number, min: 0 },
      kind: { type: String, enum: ['tuition', 'admission', 'charge'] },
      chargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyAdditionalCharge' },
    }],
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Set once when staff are told this voucher is unpaid. */
    pendingNoticeAt: { type: Date, select: false },
    /** Set once when staff are told this voucher became overdue. */
    overdueNoticeAt: { type: Date, select: false },
  },
  { timestamps: true, collection: 'feerecords' }
);

academyFeeRecordSchema.index({ studentId: 1, month: 1, year: 1, feeType: 1 }, { unique: true });

module.exports = mongoose.model('AcademyFeeRecord', academyFeeRecordSchema);
