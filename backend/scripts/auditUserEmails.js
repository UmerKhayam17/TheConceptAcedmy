/**
 * One-off audit for the admin-email takeover fix. Run it BEFORE deploying the new
 * User model (lowercase emails + isSystemAdmin flag).
 *
 * Usage (from backend/):
 *   npm run audit:user-emails                     → report only, changes nothing
 *   npm run audit:user-emails -- --apply          → lowercase/trim emails that are safe to fix
 *   npm run audit:user-emails -- --disable=<id>[,<id>]
 *        → disable accounts you have CONFIRMED are unauthorised holders of the admin email
 *          (only ids listed in the "suspicious" section are accepted) and sign them out.
 *
 * It never disables anything on its own, and never touches the legitimate admin.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { connectDatabase } = require('../src/config/database');
const { seedAdminEmail, normalizeEmail } = require('../src/utils/systemAdmin');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const disableArg = args.find((a) => a.startsWith('--disable='));
const DISABLE_IDS = disableArg
  ? disableArg
      .slice('--disable='.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

const line = (s = '') => console.log(s);

function describe(u, roleNames) {
  return `${u._id}  "${u.email}"  name="${u.name || ''}"  role=${roleNames.get(String(u.role)) || '?'}  active=${u.isActive !== false}  flag=${u.isSystemAdmin === true}`;
}

async function main() {
  await connectDatabase();
  // Raw collection: we must see emails exactly as stored, without Mongoose setters.
  const db = mongoose.connection.db;
  const users = await db
    .collection('users')
    .find({}, { projection: { email: 1, name: 1, role: 1, isActive: 1, isSystemAdmin: 1 } })
    .toArray();
  const roles = await db.collection('roles').find({}, { projection: { name: 1 } }).toArray();
  const roleNames = new Map(roles.map((r) => [String(r._id), r.name]));
  const adminEmail = seedAdminEmail();

  line(`Scanned ${users.length} user(s). Reserved admin email: ${adminEmail}`);
  line(APPLY ? 'Mode: APPLY (safe email normalisation)' : 'Mode: REPORT ONLY (nothing is changed)');
  line();

  // 1. Group by normalised email to find duplicates.
  const groups = new Map();
  for (const u of users) {
    const key = normalizeEmail(u.email);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }
  const duplicateKeys = new Set([...groups].filter(([, list]) => list.length > 1).map(([k]) => k));

  // 2. Legitimate admin = stored with the exact lowercase reserved email (how the seed creates it).
  const legit = users.find((u) => u.email === adminEmail) || null;
  const reservedHolders = groups.get(adminEmail) || [];
  const suspicious = reservedHolders.filter((u) => !legit || String(u._id) !== String(legit._id));
  const flagged = users.filter((u) => u.isSystemAdmin === true);

  line('== Legitimate system admin ==');
  if (legit) line(`  ${describe(legit, roleNames)}`);
  else line('  !! No account stored with the exact reserved email. Verify the real admin manually before deploying.');
  line();

  line('== Suspicious: other accounts using the admin email (any letter case / spaces) ==');
  if (!suspicious.length) line('  none');
  suspicious.forEach((u) => line(`  ${describe(u, roleNames)}`));
  if (suspicious.length) {
    line('  → These accounts had full admin access before the fix. Check who created/changed them');
    line('    (audit logs, createdBy, updatedAt) and, once confirmed, run with --disable=<id>.');
  }
  line();

  const otherFlagged = flagged.filter((u) => !legit || String(u._id) !== String(legit._id));
  if (otherFlagged.length) {
    line('== Other accounts carrying isSystemAdmin=true (the seed will clear these on startup) ==');
    otherFlagged.forEach((u) => line(`  ${describe(u, roleNames)}`));
    line();
  }

  line('== Duplicate emails after lowercasing (resolve manually: merge or rename) ==');
  if (!duplicateKeys.size) line('  none');
  for (const key of duplicateKeys) {
    line(`  ${key}`);
    groups.get(key).forEach((u) => line(`    ${describe(u, roleNames)}`));
  }
  line();

  // 3. Emails that only need lowercase/trim and are safe to fix.
  const fixable = users.filter((u) => {
    const key = normalizeEmail(u.email);
    return u.email !== key && !duplicateKeys.has(key) && key !== adminEmail;
  });
  line(`== Emails with capitals or spaces, safe to normalise: ${fixable.length} ==`);
  fixable.forEach((u) => line(`  "${u.email}" → "${normalizeEmail(u.email)}"  (${u._id})`));
  const blocked = users.filter((u) => u.email !== normalizeEmail(u.email)).length - fixable.length;
  if (blocked > 0) line(`  (${blocked} more skipped: duplicate or reserved — resolve above first)`);
  line();

  if (APPLY && fixable.length) {
    const ops = fixable.map((u) => ({
      updateOne: { filter: { _id: u._id, email: u.email }, update: { $set: { email: normalizeEmail(u.email) } } },
    }));
    const res = await db.collection('users').bulkWrite(ops, { ordered: false });
    line(`Normalised ${res.modifiedCount} email(s).`);
  }

  if (DISABLE_IDS.length) {
    const allowed = new Set(suspicious.map((u) => String(u._id)));
    const rejected = DISABLE_IDS.filter((id) => !allowed.has(id));
    if (rejected.length) {
      line(`Refusing to disable ${rejected.join(', ')}: not in the suspicious list above.`);
    }
    const ids = DISABLE_IDS.filter((id) => allowed.has(id)).map((id) => new mongoose.Types.ObjectId(id));
    if (ids.length) {
      const res = await db.collection('users').updateMany(
        { _id: { $in: ids } },
        {
          $set: { isActive: false, isSystemAdmin: false },
          $unset: { refreshToken: '', refreshTokenPrev: '', refreshTokenRotatedAt: '' },
        }
      );
      line(`Disabled and signed out ${res.modifiedCount} account(s).`);
    }
  }

  if (!APPLY && !DISABLE_IDS.length) line('Report only. Re-run with --apply to normalise the safe emails.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Audit failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
