const mongoose = require('mongoose');

/**
 * Items planned directly on the Academic Calendar:
 * - lesson_plan: per class/section/subject per day (staff only — hidden from parents)
 * - homework: given on startDate, due on endDate (parents of that class see it)
 * - event: PTM, sports day, function, trip… whole school or one class/section (parents see it)
 */
const ITEM_TYPES = ['lesson_plan', 'homework', 'event'];
const EVENT_CATEGORIES = ['ptm', 'sports', 'function', 'trip', 'meeting', 'competition', 'other'];

const calendarItemSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    type: { type: String, enum: ITEM_TYPES, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: '', maxlength: 4000 },
    /** Lesson plan extras */
    objectives: { type: String, trim: true, default: '', maxlength: 2000 },
    activities: { type: String, trim: true, default: '', maxlength: 2000 },
    /** Inclusive YYYY-MM-DD dates in the session timezone. Homework: endDate = due date. */
    startDate: { type: String, required: true, index: true },
    endDate: { type: String, required: true },
    startTime: { type: String, trim: true, default: '' },
    endTime: { type: String, trim: true, default: '' },
    eventCategory: { type: String, enum: EVENT_CATEGORIES, default: undefined },
    /** Empty classId on an event = whole school. */
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', default: null, index: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySection', default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

calendarItemSchema.index({ sessionId: 1, type: 1, classId: 1, sectionId: 1, subjectId: 1, startDate: 1 });

const CalendarItem = mongoose.model('CalendarItem', calendarItemSchema);

module.exports = CalendarItem;
module.exports.ITEM_TYPES = ITEM_TYPES;
module.exports.EVENT_CATEGORIES = EVENT_CATEGORIES;
