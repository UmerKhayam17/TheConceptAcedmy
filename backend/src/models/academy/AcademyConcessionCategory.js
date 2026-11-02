const mongoose = require('mongoose');

const academyConcessionCategorySchema = new mongoose.Schema(
  {
    /** Stable key for fee discounts / reports. Renames do not change this. */
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 160 },
    /** Default concession discount as a percentage of the fee (0–100). */
    discountPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'concession_categories' }
);

module.exports = mongoose.model('AcademyConcessionCategory', academyConcessionCategorySchema);
