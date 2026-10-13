const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, minlength: 8, select: false },
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
     * Staff payroll type:
     * - fixed → monthly PKR in `salary`
     * - percentage → share of fees; rate in `salaryPercentage` (amount set each month)
     */
    payType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed',
    },
    /** Monthly / contractual salary for fixed-pay staff (PKR). */
    salary: { type: Number, default: 0, min: 0 },
    /** Pay rate for percentage staff (0–100). */
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

userSchema.virtual('profile_image').get(function profileImageAlias() {
  return this.profileImage;
});
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
