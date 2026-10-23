const AcademyStudent = require('../models/academy/AcademyStudent');

/** Official format: REG-2026-0001 */
const REG_PATTERN = /^REG-\d{4}-\d+$/;

function isModernRegistrationNumber(value) {
  return REG_PATTERN.test(String(value ?? '').trim());
}

/**
 * Value shown on Student List / Contact List "Reg No".
 * Prefers a modern REG-…; ignores short legacy digits when a better id exists.
 */
function resolveRegistrationDisplay(student = {}) {
  const reg = student.registrationNumber;
  if (isModernRegistrationNumber(reg)) return String(reg).trim();

  const studentId = String(student.studentId || '').trim();
  if (studentId) return studentId;

  const roll = String(student.rollNumber || '').trim();
  if (roll) return roll;

  // Last resort: show whatever legacy value is stored (pre-backfill).
  const legacy = String(reg ?? '').trim();
  return legacy;
}

async function nextRegistrationSeq(year = new Date().getFullYear()) {
  const prefix = `REG-${year}-`;
  const last = await AcademyStudent.findOne({ registrationNumber: new RegExp(`^${prefix}`) })
    .sort({ registrationNumber: -1 })
    .select('registrationNumber')
    .lean();
  let seq = 1;
  if (last?.registrationNumber) {
    const part = String(last.registrationNumber).split('-').pop();
    const n = parseInt(part, 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return { prefix, seq };
}

async function generateRegistrationNumber() {
  const { prefix, seq } = await nextRegistrationSeq();
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Assign REG-YYYY-#### to students missing a modern registration number
 * (empty, short digits like "2"/"350", or numeric BSON from bulk import).
 * Scans in JS so Mongo $not+regex cannot miss non-string values.
 */
async function backfillLegacyRegistrationNumbers({ sampleLimit = 8 } = {}) {
  const all = await AcademyStudent.find({})
    .sort({ createdAt: 1, _id: 1 })
    .select('_id registrationNumber studentName studentId')
    .lean();

  const sample = all.slice(0, sampleLimit).map((s) => ({
    name: s.studentName || String(s._id),
    registrationNumber: s.registrationNumber,
    type: s.registrationNumber == null ? 'null' : typeof s.registrationNumber,
  }));

  const legacy = all.filter((s) => !isModernRegistrationNumber(s.registrationNumber));
  if (!legacy.length) {
    return { scanned: all.length, updated: 0, sample };
  }

  let { prefix, seq } = await nextRegistrationSeq();
  let updated = 0;

  for (const s of legacy) {
    const previous = s.registrationNumber;
    const previousLabel =
      previous == null || previous === '' ? '(empty)' : String(previous).trim();

    let assigned = false;
    for (let attempt = 0; attempt < 3 && !assigned; attempt += 1) {
      const next = `${prefix}${String(seq).padStart(4, '0')}`;
      seq += 1;
      try {
        await AcademyStudent.updateOne(
          { _id: s._id },
          { $set: { registrationNumber: next } }
        );
        updated += 1;
        assigned = true;
        // eslint-disable-next-line no-console
        console.log(
          `[reg-backfill] ${s.studentName || s._id}: ${previousLabel} → ${next}`
        );
      } catch (err) {
        if (err?.code !== 11000) throw err;
        // Collision — refresh sequence from DB and retry.
        ({ prefix, seq } = await nextRegistrationSeq());
      }
    }
  }

  return { scanned: all.length, updated, sample };
}

module.exports = {
  REG_PATTERN,
  isModernRegistrationNumber,
  resolveRegistrationDisplay,
  generateRegistrationNumber,
  backfillLegacyRegistrationNumbers,
};
