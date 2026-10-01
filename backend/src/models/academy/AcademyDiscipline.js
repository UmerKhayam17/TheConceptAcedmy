const mongoose = require('mongoose');

/**
 * Academic stream within a class (Medical / Engineering / ICS).
 * Only configure on college classes (1st Year / 2nd Year).
 * subjectIds = stream-specific subjects; shared subjects stay on the class only.
 */
const academyDisciplineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Stable key: medical | engineering | ics | custom */
    code: { type: String, required: true, trim: true, lowercase: true },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademyClass',
      required: true,
      index: true,
    },
    subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'disciplines' }
);

academyDisciplineSchema.index({ classId: 1, code: 1 }, { unique: true });
academyDisciplineSchema.index({ classId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('AcademyDiscipline', academyDisciplineSchema);
