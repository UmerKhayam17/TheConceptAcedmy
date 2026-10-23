const AcademyStudent = require('../models/academy/AcademyStudent');

/** Official format: REG-2026-0001 */
const REG_PATTERN = /^REG-\d{4}-\d+$/;

function isModernRegistrationNumber(value) {
  return REG_PATTERN.test(String(value || '').trim());
}

async function generateRegistrationNumber() {
  const year = new Date().getFullYear();
  const prefix = `REG-${year}-`;
  const last = await AcademyStudent.findOne({ registrationNumber: new RegExp(`^${prefix}`) })
    .sort({ registrationNumber: -1 })
    .select('registrationNumber');
  let seq = 1;
  if (last?.registrationNumber) {
    const part = last.registrationNumber.split('-').pop();
    const n = parseInt(part, 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Assign REG-YYYY-#### to students missing a modern registration number
 * (empty, or legacy short digits like "2" / "350"). Idempotent — skips
 * students that already have REG-####-####.
 */
async function backfillLegacyRegistrationNumbers() {
  const legacy = await AcademyStudent.find({
    $or: [
      { registrationNumber: { $exists: false } },
      { registrationNumber: null },
      { registrationNumber: '' },
      { registrationNumber: { $not: REG_PATTERN } },
    ],
  })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id registrationNumber studentName');

  if (!legacy.length) {
    return { scanned: 0, updated: 0 };
  }

  let updated = 0;
  for (const s of legacy) {
    const previous = String(s.registrationNumber || '').trim();
    let next = await generateRegistrationNumber();
    // Rare race with concurrent registration — retry once on duplicate key.
    try {
      await AcademyStudent.updateOne({ _id: s._id }, { $set: { registrationNumber: next } });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      next = await generateRegistrationNumber();
      await AcademyStudent.updateOne({ _id: s._id }, { $set: { registrationNumber: next } });
    }
    updated += 1;
    // eslint-disable-next-line no-console
    console.log(
      `[reg-backfill] ${s.studentName || s._id}: ${previous || '(empty)'} → ${next}`
    );
  }

  return { scanned: legacy.length, updated };
}

module.exports = {
  REG_PATTERN,
  isModernRegistrationNumber,
  generateRegistrationNumber,
  backfillLegacyRegistrationNumbers,
};
