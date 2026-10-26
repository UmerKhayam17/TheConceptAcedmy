const mongoose = require('mongoose');

/**
 * One mark per teacher, school day, and timetable period.
 * Time and class are not stored as the source of truth — they are read from
 * the published timetable. This row only records the status the user chose.
 */
const staffPeriodAttendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      index: true,
    },
    /** School day YYYY-MM-DD in the academy timezone. */
    day: { type: String, required: true, trim: true },
    /** startTime|endTime from the period template, e.g. 08:00|08:40 */
    periodKey: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['present', 'late', 'absent', 'leave'],
      required: true,
    },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'staff_period_attendances' }
);

staffPeriodAttendanceSchema.index(
  { userId: 1, sessionId: 1, day: 1, periodKey: 1 },
  { unique: true }
);

module.exports = mongoose.model('StaffPeriodAttendance', staffPeriodAttendanceSchema);
