const mongoose = require('mongoose');
const { TIMETABLE_STATUSES } = require('./constants');

const timetableVersionSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySection', required: true },
    periodTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'PeriodTemplate', required: true },
    status: { type: String, enum: TIMETABLE_STATUSES, default: 'draft', index: true },
    version: { type: Number, default: 1, min: 1 },
    effectiveFrom: { type: Date },
    publishedAt: { type: Date },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, default: '' },
    generationMeta: {
      engine: { type: String },
      jobId: { type: String },
      score: { type: Number },
      unplacedCount: { type: Number },
      ranAt: { type: Date },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/** At most one published timetable per section. */
timetableVersionSchema.index(
  { session: 1, section: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'published' },
  }
);
/** Draft uniqueness is enforced in createVersion + consolidateSectionDrafts (not a DB index,
 *  so existing multi-draft rows can be merged without blocking app startup). */

module.exports = mongoose.model('TimetableVersion', timetableVersionSchema);
