const mongoose = require('mongoose');

const academyFeeRecordSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyStudent', required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0 },
    feeType: {
      type: String,
      // `stationery` kept for legacy paid rows; new stationery is a monthly component line.
      enum: ['admission', 'monthly', 'stationery'],
      default: 'monthly',
    },
    status: { type: String, enum: ['pending', 'paid', 'overdue', 'waived'], default: 'pending', index: true },
    dueDate: { type: Date },
    paidAt: { type: Date },
    /**
     * Money received so far. Equals `amount` once paid; between 0 and `amount`
     * while a voucher is being paid in installments (status stays pending/overdue).
     */
    paidAmount: { type: Number, min: 0, default: 0 },
    /** Every payment (installment) received against this voucher. */
    payments: [{
      amount: { type: Number, min: 0, required: true },
      paidAt: { type: Date },
      paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'online', 'other'] },
      paymentSlip: { type: String, trim: true },
      paymentSlipNumber: { type: String, trim: true },
      receiptNumber: { type: String, trim: true },
      notes: { type: String, trim: true },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now },
    }],
    receiptNumber: { type: String, trim: true },
    paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'online', 'other'], default: 'cash' },
    /** Uploaded bank or cash slip, stored under /uploads/payment-slips. */
    paymentSlip: { type: String, trim: true },
    /** Bank / cash payment slip reference number entered when recording payment. */
    paymentSlipNumber: { type: String, trim: true },
    notes: { type: String, trim: true },
    /**
     * Voucher amount before a collection-time adjustment. `amount` holds the
     * final payable, so reports stay correct; this keeps the original for audit.
     */
    originalAmount: { type: Number, min: 0 },
    /** Set when staff waive a month by hand (not the automatic leave waiver). */
    waiver: {
      reason: { type: String, trim: true },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
    },
    /** Collection-time adjustment (discount, partial month, late fine…). */
    adjustment: {
      kind: { type: String, enum: ['discount', 'partial_month', 'late_fine', 'other'] },
      /** Signed change applied to originalAmount (negative reduces the fee). */
      amount: { type: Number },
      reason: { type: String, trim: true },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
    },
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
