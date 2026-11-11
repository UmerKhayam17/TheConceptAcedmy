const mongoose = require('mongoose');

const CATEGORIES = ['public', 'islamic', 'government', 'vacation'];
const SOURCES = ['builtin', 'hijri', 'government', 'manual'];
const STATUSES = ['pending', 'approved'];

const holidaySchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      index: true,
    },
    /** Stable key so seeding a session does not duplicate a holiday the admin already edited. */
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    shortName: { type: String, trim: true, default: '' },
    category: { type: String, enum: CATEGORIES, required: true },
    source: { type: String, enum: SOURCES, required: true },
    /** Inclusive school dates, YYYY-MM-DD in the session timezone. */
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    appliesTo: {
      students: { type: Boolean, default: true },
      teachers: { type: Boolean, default: true },
      staff: { type: Boolean, default: true },
    },
    /** Hijri-based dates stay estimates until an admin confirms them. */
    estimated: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

holidaySchema.index({ sessionId: 1, code: 1 }, { unique: true });
holidaySchema.index({ sessionId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);
module.exports.HOLIDAY_CATEGORIES = CATEGORIES;
module.exports.HOLIDAY_SOURCES = SOURCES;
module.exports.HOLIDAY_STATUSES = STATUSES;
