const AcademyStudent = require('../../models/academy/AcademyStudent');
const { backfillLegacyRegistrationNumbers } = require('../../utils/academyRegistrationNumber');

/**
 * Fix legacy null unique-key values and align indexes after schema changes.
 * Also backfills short/legacy registration numbers to REG-YYYY-####.
 */
async function ensureAcademyStudentIndexes() {
  try {
    await AcademyStudent.updateMany(
      { $or: [{ studentId: null }, { studentId: '' }] },
      { $unset: { studentId: '' } }
    );
    await AcademyStudent.updateMany(
      { $or: [{ registrationNumber: null }, { registrationNumber: '' }] },
      { $unset: { registrationNumber: '' } }
    );
    await AcademyStudent.updateMany(
      { $or: [{ rollNumber: null }, { rollNumber: '' }] },
      { $unset: { rollNumber: '' } }
    );
    await AcademyStudent.syncIndexes();

    const result = await backfillLegacyRegistrationNumbers();
    if (result.updated > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[reg-backfill] Assigned REG numbers to ${result.updated} of ${result.scanned} legacy student(s)`
      );
    }
  } catch (err) {
    console.warn('AcademyStudent index sync skipped:', err.message);
  }
}

module.exports = { ensureAcademyStudentIndexes };
