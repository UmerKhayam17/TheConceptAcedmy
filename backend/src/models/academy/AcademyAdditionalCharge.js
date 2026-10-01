const mongoose = require('mongoose');

/**
 * Recurring or month-specific charges folded into the monthly fee.
 * Past fee records are never rewritten when a charge is edited or removed.
 */
const academyAdditionalChargeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    frequency: {
      type: String,
      enum: ['every_month', 'selected_months'],
      default: 'every_month',
    },
    /** 1–12. Used when frequency is selected_months. */
    months: [{ type: Number, min: 1, max: 12 }],
    applicability: {
      type: String,
      enum: ['all', 'class', 'students'],
      default: 'all',
    },
    classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass' }],
    sectionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademySection' }],
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademyStudent' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'additionalcharges' }
);

module.exports = mongoose.model('AcademyAdditionalCharge', academyAdditionalChargeSchema);
