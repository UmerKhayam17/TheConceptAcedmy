const mongoose = require('mongoose');
const { WEEKDAYS, SLOT_SOURCES } = require('./constants');

const parallelEntrySchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const scheduleSlotSchema = new mongoose.Schema(
  {
    timetableVersion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TimetableVersion',
      required: true,
      index: true,
    },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySection', required: true },
    day: { type: String, enum: WEEKDAYS, required: true },
    periodId: { type: mongoose.Schema.Types.ObjectId, required: true },
    /** Primary subject (first of a choice group, or the only subject). */
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /**
     * Extra concurrent subjects for a choice group (e.g. Biology runs alongside Computer Science).
     * Students in the section split across primary + these parallel classes at the same period.
     */
    parallelEntries: { type: [parallelEntrySchema], default: [] },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
    /**
     * Shared / combined lesson across multiple sections (same day + period + teachers).
     * Slots with the same combinedGroupId waive teacher/room conflicts with each other.
     */
    combinedGroupId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    isSubstitute: { type: Boolean, default: false },
    substituteForTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, enum: SLOT_SOURCES, default: 'manual' },
    locked: { type: Boolean, default: false },
    cancelled: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

scheduleSlotSchema.index({ timetableVersion: 1, day: 1, periodId: 1 }, { unique: true });
scheduleSlotSchema.index({ session: 1, day: 1, periodId: 1, teacher: 1 });
scheduleSlotSchema.index({ session: 1, day: 1, periodId: 1, 'parallelEntries.teacher': 1 });
scheduleSlotSchema.index({ session: 1, day: 1, periodId: 1, room: 1 });
scheduleSlotSchema.index({ combinedGroupId: 1, day: 1, periodId: 1 });

module.exports = mongoose.model('ScheduleSlot', scheduleSlotSchema);
