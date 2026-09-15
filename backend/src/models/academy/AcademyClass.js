const mongoose = require('mongoose');

const academyClassSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', index: true },
    className: { type: String, required: true, trim: true },
    /** Optional streams for this class only, e.g. Class 11: Medical, ICS, Pre-Engineering. */
    disciplines: { type: [String], default: [] },
    totalSubjects: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'classes' }
);

academyClassSchema.index({ sessionId: 1, className: 1 }, { unique: true, sparse: true });

/** Timetable / legacy config API compatibility */
academyClassSchema.virtual('name').get(function getName() {
  return this.className;
});
academyClassSchema.virtual('session').get(function getSession() {
  return this.sessionId;
});
academyClassSchema.set('toJSON', { virtuals: true });
academyClassSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AcademyClass', academyClassSchema);
