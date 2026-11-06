/**
 * The seeded / bootstrap admin (SEED_ADMIN_EMAIL) always has full access.
 * Other users with role "admin" follow dynamic modulePermissions like any staff role.
 */

function seedAdminEmail() {
  return String(process.env.SEED_ADMIN_EMAIL || 'admin@academy.local')
    .toLowerCase()
    .trim();
}

function emailOf(user) {
  if (!user) return '';
  return String(user.email || '')
    .toLowerCase()
    .trim();
}

function roleNameOfUser(user) {
  const role = user?.roleDoc || user?.role;
  if (typeof role === 'object' && role?.name) return String(role.name).toLowerCase();
  if (typeof role === 'string') return role.toLowerCase();
  return '';
}

/** Lowercase + trim, the one canonical form for every stored or compared email. */
function normalizeEmail(value) {
  return String(value || '')
    .toLowerCase()
    .trim();
}

/** The bootstrap admin email is reserved: no other account may use it, in any letter case. */
function isReservedAdminEmail(value) {
  const email = normalizeEmail(value);
  return Boolean(email) && email === seedAdminEmail();
}

/**
 * True only for the bootstrap admin account, not every admin-role user.
 * All three must hold, so taking over the email alone is never enough:
 *  - the `isSystemAdmin` flag, which only the startup seed sets (no API can set it),
 *  - the reserved SEED_ADMIN_EMAIL,
 *  - an active account.
 */
function isSystemAdmin(user) {
  if (!user || user.isSystemAdmin !== true) return false;
  if (user.isActive === false) return false;
  const email = emailOf(user);
  return Boolean(email) && email === seedAdminEmail();
}

/** Role named admin (includes system admin and secondary admins). */
function isAdminRole(user) {
  return roleNameOfUser(user) === 'admin';
}

module.exports = {
  seedAdminEmail,
  normalizeEmail,
  isReservedAdminEmail,
  isSystemAdmin,
  isAdminRole,
  roleNameOfUser,
};
