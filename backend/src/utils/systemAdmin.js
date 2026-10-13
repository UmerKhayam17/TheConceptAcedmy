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

/** True only for the bootstrap admin account (by email), not every admin-role user. */
function isSystemAdmin(user) {
  const email = emailOf(user);
  return Boolean(email) && email === seedAdminEmail();
}

/** Role named admin (includes system admin and secondary admins). */
function isAdminRole(user) {
  return roleNameOfUser(user) === 'admin';
}

module.exports = {
  seedAdminEmail,
  isSystemAdmin,
  isAdminRole,
  roleNameOfUser,
};
