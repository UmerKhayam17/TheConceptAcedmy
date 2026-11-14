const mongoose = require('mongoose');
const { isReservedAdminEmail } = require('../utils/systemAdmin');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Always stored lowercase + trimmed, so `Admin@X` and `admin@x` are the same account. */
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /**
     * Marks the one bootstrap admin. Set only by the startup seed (services/seed.js
     * ensureDefaultAdmin). No create/update API reads this field from a request.
     */
    isSystemAdmin: { type: Boolean, default: false },
    password: { type: String, required: true, minlength: 8, select: false },
    /**
     * Last password assigned to a parent portal, kept so staff can reprint login sheets.
     * Never selected on normal account lists.
     */
    issuedPassword: { type: String, select: false },
    /**
     * When staff sent parent login credentials once via WhatsApp.
     * Cleared when the portal password is reset so they can send again.
     */
    credentialsWhatsAppSentAt: { type: Date, default: null },
    phone: { type: String, required: true, trim: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
    // Module-based permissions: { exam: ['view', 'create', 'edit'], assignment: ['view'] }
    modulePermissions: {
      type: Map,
      of: [String],
      default: new Map(),
    },
    isActive: { type: Boolean, default: true },
    /**
     * false → record-only staff (guard, sweeper, …): no portal access. Such users get a
     * placeholder `@nologin.local` email and a random password so the unique email index holds.
     */
    canLogin: { type: Boolean, default: true },
    /** Job title for non-teaching staff (Guard, Sweeper, Driver, …). */
    designation: { type: String, trim: true, default: '' },
    /** Optional responsibilities, e.g. "Main gate security and visitor checking". */
    jobDescription: { type: String, trim: true, default: '' },
    /**
     * Staff payroll type:
     * - fixed → monthly PKR in `salary`
     * - percentage → tuition pools × `salaryPercentage` (set when creating the teacher)
     */
    payType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed',
    },
    /** Monthly / contractual salary for fixed-pay staff (PKR). */
    salary: { type: Number, default: 0, min: 0 },
    /**
     * Teacher cut of each subject tuition pool (0–100).
     * Used when payType is percentage: Salary = salaryPercentage% × Σ(tuition × subject share).
     */
    salaryPercentage: { type: Number, default: 0, min: 0, max: 100 },
    profileImage: { type: String },
    /** Linked face ID in AIAttendance (`STF-…`). */
    aiEmployeeId: { type: String, trim: true, index: true },
    fcmToken: { type: String },
    lastLogin: { type: Date },
    refreshToken: { type: String, select: false },
    /** Previous refresh hash kept briefly so concurrent / multi-tab refresh does not 401. */
    refreshTokenPrev: { type: String, select: false },
    refreshTokenRotatedAt: { type: Date, select: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

userSchema.index({ isActive: 1 });

// Last line of defence for every save path: the reserved admin email can only sit on the
// flagged system admin account.
userSchema.pre('validate', function reserveAdminEmail(next) {
  if (isReservedAdminEmail(this.email) && this.isSystemAdmin !== true) {
    this.invalidate('email', 'This email is reserved.');
  }
  next();
});

userSchema.virtual('profile_image').get(function profileImageAlias() {
  return this.profileImage;
});
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
