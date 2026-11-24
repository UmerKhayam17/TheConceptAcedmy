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
    /**
     * Auto-calc snapshot for percentage teachers (tuition × subject share × teacher cut).
     * amount is the rounded total of lines when calculationSource is 'tuition_pool'.
     */
    calculationSource: {
      type: String,
      enum: ['fixed', 'tuition_pool', 'manual'],
      default: 'fixed',
    },
    calculationBreakdown: [
      {
        subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject' },
        subjectName: { type: String, trim: true },
        className: { type: String, trim: true },
        sectionName: { type: String, trim: true },
        studentCount: { type: Number, default: 0 },
        /** Sum of net monthly tuition in this pool (admission / totalFee excluded). */
        monthlyTuitionTotal: { type: Number, default: 0 },
        /** Subject share % used for full-package students (tuitionSharePercent). */
        tuitionSharePercent: { type: Number, default: 0 },
        pool: { type: Number, default: 0 },
        teacherCutPercent: { type: Number, default: 60 },
        salary: { type: Number, default: 0 },
        /** Per-student contribution lines (for expanded / detail views). */
        students: [
          {
            studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyStudent' },
            studentName: { type: String, trim: true },
            registrationNumber: { type: String, trim: true },
            tuition: { type: Number, default: 0 },
            isFullPackage: { type: Boolean, default: false },
            subjectCount: { type: Number, default: 0 },
            enrolment: { type: String, trim: true },
            howCounted: { type: String, trim: true },
            weight: { type: Number, default: 0 },
            contribution: { type: Number, default: 0 },
            mode: { type: String, trim: true },
          },
        ],
      },
    ],
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
    /** Advance / loan recovery taken from this voucher (applied to the loans when paid). */
    advanceDeductions: [
      {
        advanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyStaffAdvance' },
        type: { type: String, enum: ['advance', 'loan'] },
        amount: { type: Number, default: 0, min: 0 },
        _id: false,
      },
    ],
    advanceDeductionTotal: { type: Number, default: 0, min: 0 },
    /** true = admin set the deduction by hand; auto refresh leaves it alone. */
    advanceDeductionManual: { type: Boolean, default: false },
    /** amount − advanceDeductionTotal (what is actually handed over). */
    netAmount: { type: Number, default: 0, min: 0 },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'salaryrecords' }
);

academySalaryRecordSchema.index({ staffId: 1, month: 1, year: 1 }, { unique: true });

academySalaryRecordSchema.pre('save', function syncNet(next) {
  const total = Math.round(
    (this.advanceDeductions || []).reduce((n, d) => n + (Number(d.amount) || 0), 0) * 100
  ) / 100;
  this.advanceDeductionTotal = total;
  this.netAmount = Math.max(0, Math.round(((Number(this.amount) || 0) - total) * 100) / 100);
  next();
});

module.exports = mongoose.model('AcademySalaryRecord', academySalaryRecordSchema);
