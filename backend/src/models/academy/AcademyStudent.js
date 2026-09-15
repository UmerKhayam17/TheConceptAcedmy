const mongoose = require('mongoose');

const academicRecordSchema = new mongoose.Schema(
  {
    institutionName: { type: String, trim: true },
    className: { type: String, trim: true },
    totalMarks: { type: Number, min: 0 },
    obtainedMarks: { type: Number, min: 0 },
    percentage: { type: Number, min: 0, max: 100 },
    year: { type: String, trim: true },
  },
  { _id: false }
);

const academyStudentSchema = new mongoose.Schema(
  {
    /** Official academy ID (TCES-YYYY-XXXXXX) — assigned when admission is completed. */
    studentId: { type: String, trim: true },
    /** Temporary reference while status is pending_fee (admission office intake). */
    registrationNumber: { type: String, trim: true },
    /** Class roll number — temporary (TMP-…) at intake, official on activation. */
    rollNumber: { type: String, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    studentName: { type: String, required: true, trim: true },
    photoImage: { type: String, trim: true },
    fatherName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date },
    nationality: { type: String, trim: true, default: 'Pakistan' },
    guardianName: { type: String, trim: true },
    guardianRelation: { type: String, trim: true },
    fatherGuardianCnic: { type: String, trim: true },
    guardianOccupation: { type: String, trim: true },
    guardianWorkAddress: { type: String, trim: true },
    guardianEmail: { type: String, trim: true },
    studentEmail: { type: String, trim: true },
    postalAddress: { type: String, trim: true },
    contactPhoneRes: { type: String, trim: true },
    phone: { type: String, trim: true, default: '' },
    /** Optional notes from admission office at provisional intake. */
    intakeNotes: { type: String, trim: true, default: '' },
    permanentAddress: { type: String, trim: true },
    currentSchoolCollege: { type: String, trim: true },
    academicHistory: [academicRecordSchema],
    gender: { type: String, enum: ['male', 'female', 'other'] },
    address: { type: String, trim: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', required: true, index: true },
    /** Stream/group for the class, e.g. Medical — only when the class defines disciplines. */
    discipline: { type: String, trim: true, default: '' },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySection', index: true },
    selectedSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject' }],
    isFullPackage: { type: Boolean, default: false },
    monthlyFee: { type: Number, default: 0, min: 0 },
    admissionFee: { type: Number, default: 0, min: 0 },
    monthlyFeeDiscount: { type: Number, default: 0, min: 0 },
    admissionFeeDiscount: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    totalFee: { type: Number, default: 0, min: 0 },
    feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyFeeStructure' },
    status: {
      type: String,
      enum: ['pending_fee', 'active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
    enrolledAt: { type: Date, default: Date.now },
    activatedAt: { type: Date },
    activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Linked face ID in AIAttendance (`STU-…`). */
    aiEmployeeId: { type: String, trim: true, index: true },
  },
  { timestamps: true, collection: 'students' }
);

academyStudentSchema.index({
  studentName: 'text',
  fatherName: 'text',
  phone: 'text',
  studentId: 'text',
  registrationNumber: 'text',
  rollNumber: 'text',
  guardianName: 'text',
});

/** Partial unique indexes — omit pending students without IDs (avoids duplicate null). */
academyStudentSchema.index(
  { studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { studentId: { $type: 'string', $gt: '' } },
  }
);
academyStudentSchema.index(
  { registrationNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { registrationNumber: { $type: 'string', $gt: '' } },
  }
);
academyStudentSchema.index(
  { rollNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { rollNumber: { $type: 'string', $gt: '' } },
  }
);

module.exports = mongoose.model('AcademyStudent', academyStudentSchema);
