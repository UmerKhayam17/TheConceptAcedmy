const mongoose = require('mongoose');

/** Cash opening for one academic session. `key` is the session id. */
const academyOpeningBalanceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    amount: { type: Number, required: true, min: 0 },
    /** YYYY-MM-DD. Cash at the start of that session. */
    asOf: { type: String, required: true, trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'opening_balances' }
);

module.exports = mongoose.model('AcademyOpeningBalance', academyOpeningBalanceSchema);
