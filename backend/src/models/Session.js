const mongoose = require('mongoose');

const { WEEKDAYS } = require('./timetable/constants');

const SESSION_STATUSES = ['active', 'completed', 'archived'];

const sessionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: SESSION_STATUSES, default: 'active', index: true },
    /** Indexed by the partial unique `one_active_session` index below. */
    isActive: { type: Boolean, default: false },
    workingDays: {
      type: [{ type: String, enum: WEEKDAYS }],
      default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    },
    timezone: { type: String, default: 'Asia/Karachi', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isClosed: { type: Boolean, default: false },
    completedAt: { type: Date },
    archivedAt: { type: Date },
    clonedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

sessionSchema.index({ name: 1 }, { unique: true });
// Database-level guarantee: at most one session with isActive = true.
// Built at startup by ensureSessionIndexes(), after ensureSingleActiveSession() repairs old data.
sessionSchema.index(
  { isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true }, name: 'one_active_session' }
);

module.exports = mongoose.model('Session', sessionSchema);
