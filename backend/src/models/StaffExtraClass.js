const mongoose = require('mongoose');

const EXTRA_CLASS_REASONS = ['extra', 'makeup', 'cover'];

/**
 * A class a teacher takes on one specific date that is not on the published timetable
 * (extra class, make-up class, or covering for an absent teacher).
 * Time comes from the configured period template slot chosen when it was added.
 * Its attendance mark lives in StaffPeriodAttendance with periodKey `extra:<_id>`.
 */
const staffExtraClassSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    /** School day YYYY-MM-DD in the academy timezone. */
    day: { type: String, required: true, trim: true },
    periodTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PeriodTemplate' },
    periodSlotId: { type: mongoose.Schema.Types.ObjectId },
    label: { type: String, trim: true, default: '' },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySection', default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject', required: true },
    reason: { type: String, enum: EXTRA_CLASS_REASONS, default: 'extra' },
    coveringFor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'staff_extra_classes' }
);

/** One class per teacher per period on a day. */
staffExtraClassSchema.index(
  { userId: 1, sessionId: 1, day: 1, startTime: 1, endTime: 1 },
  { unique: true }
);

module.exports = mongoose.model('StaffExtraClass', staffExtraClassSchema);
module.exports.EXTRA_CLASS_REASONS = EXTRA_CLASS_REASONS;
