const mongoose = require('mongoose');

const staffAttendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    status: {
      type: String,
      enum: ['present', 'late', 'absent', 'half_day', 'leave'],
      default: 'present',
    },
    source: {
      type: String,
      enum: ['ai', 'manual'],
      default: 'ai',
    },
    confidence: { type: Number },
    notes: { type: String, trim: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'staff_attendances' }
);

staffAttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('StaffAttendance', staffAttendanceSchema);
