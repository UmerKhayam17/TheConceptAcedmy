/**
 * Default module permissions for the Accountant (Staff) role.
 * Finance-focused access — fees, salaries, expenses, student activation.
 */

const ACCOUNTANT_DEFAULT_MODULE_PERMISSIONS = {
  student: ['view', 'activate'],
  studentManagement: ['view', 'create', 'edit', 'record', 'generate'],
  fee: ['view', 'create', 'edit', 'generate', 'record'],
  salary: ['view', 'process', 'generate', 'record'],
  academyExpense: ['view', 'create', 'edit', 'delete', 'record'],
  attendance: ['view'],
  exam: ['view'],
  chat: ['view', 'create', 'participate'],
  datasheets: ['view', 'create', 'edit', 'delete'],
  reports: ['view'],
  notifications: ['view'],
  profile: ['view', 'edit'],
  schoolCalendar: ['view'],
  leave: ['view', 'create'],
  staffAttendance: ['view', 'create'],
};

const ACCOUNTANT_PERMISSION_NAMES = [
  'activate_student',
  'view_students',
  'generate_vouchers',
  'record_fee_payment',
  'view_fee_reports',
  'view_academy_students',
  'manage_academy_fees',
  'view_academy_fee_reports',
  'manage_academy_salaries',
  'view_academy_salaries',
  'manage_academy_expenses',
  'view_academy_expenses',
  'use_chat',
  'view_attendance',
  'view_results',
  'view_datasheets',
  'manage_datasheets',
];

function accountantModulePermissionsMap() {
  return new Map(Object.entries(ACCOUNTANT_DEFAULT_MODULE_PERMISSIONS));
}

module.exports = {
  ACCOUNTANT_DEFAULT_MODULE_PERMISSIONS,
  ACCOUNTANT_PERMISSION_NAMES,
  accountantModulePermissionsMap,
};
