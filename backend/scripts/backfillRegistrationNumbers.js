/**
 * One-off / manual: assign REG-YYYY-#### to students with missing or legacy
 * short registration numbers (e.g. "2", "350").
 *
 * Usage (from backend/):
 *   npm run backfill:reg-numbers
 *
 * Also runs automatically on API startup via ensureAcademyStudentIndexes.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { connectDatabase } = require('../src/config/database');
const { backfillLegacyRegistrationNumbers } = require('../src/utils/academyRegistrationNumber');

async function main() {
  await connectDatabase();
  const result = await backfillLegacyRegistrationNumbers();
  // eslint-disable-next-line no-console
  console.log(
    result.updated
      ? `Done. Updated ${result.updated} of ${result.scanned} student(s).`
      : 'Done. No legacy registration numbers found.'
  );
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Backfill failed:', err);
  process.exit(1);
});
