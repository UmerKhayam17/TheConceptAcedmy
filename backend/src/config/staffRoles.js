/** Built-in role for guards, sweepers, drivers, … (record-only by default, no portal login). */
const NON_TEACHING_ROLE = 'non_teaching_staff';

/** Roles listed under Staff and paid through payroll. */
const STAFF_ROLE_NAMES = ['teacher', 'accountant', NON_TEACHING_ROLE];

/** Domain for placeholder emails on accounts with `canLogin: false`. */
const NO_LOGIN_EMAIL_DOMAIN = 'nologin.local';

function isStaffRoleName(roleName) {
  return STAFF_ROLE_NAMES.includes(String(roleName || '').toLowerCase());
}

function isNoLoginEmail(email) {
  return String(email || '').toLowerCase().endsWith(`@${NO_LOGIN_EMAIL_DOMAIN}`);
}

/** Email safe to show or print — blank for generated no-login placeholders. */
function publicEmail(email) {
  return isNoLoginEmail(email) ? '' : String(email || '');
}

module.exports = {
  publicEmail,
  NON_TEACHING_ROLE,
  STAFF_ROLE_NAMES,
  NO_LOGIN_EMAIL_DOMAIN,
  isStaffRoleName,
  isNoLoginEmail,
};
