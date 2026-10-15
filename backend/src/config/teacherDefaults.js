/**
 * Default module permissions for the Teacher role.
 * Applied on role seed sync and when creating a teacher with no explicit matrix.
 */
const TEACHER_DEFAULT_MODULE_PERMISSIONS = {
  student: ['view'],
  studentManagement: ['view'],
  myClasses: ['view'],
  mySubjects: ['view'],
  timetable: ['view'],
  homework: ['view', 'create', 'edit', 'delete'],
  studyMaterials: ['view', 'create', 'edit', 'delete'],
  lessonPlans: ['view', 'create', 'edit'],
  /** View-only by default — grant create/edit on the user/role matrix to manage tests & marks. */
  exam: ['view'],
  studentProgress: ['view'],
  chat: ['view', 'create', 'participate'],
  announcement: ['view', 'create', 'edit'],
  behaviour: ['view', 'create', 'edit'],
  parentMeetings: ['view', 'create', 'edit'],
  onlineClasses: ['view', 'create', 'edit', 'delete'],
  library: ['view'],
  schoolCalendar: ['view'],
  notifications: ['view'],
  profile: ['view', 'edit'],
  leave: ['view', 'create'],
  staffAttendance: ['view', 'create'],
  attendance: ['view', 'create', 'edit', 'correct'],
  reports: ['view'],
};

const TEACHER_PERMISSION_NAMES = [
  'mark_attendance',
  'correct_attendance',
  'view_attendance',
  'enter_exam_marks',
  'view_results',
  'manage_announcements',
  'use_chat',
  'view_students',
  'view_timetables',
  'view_datasheets',
  'manage_datasheets',
];

function teacherModulePermissionsMap() {
  return new Map(Object.entries(TEACHER_DEFAULT_MODULE_PERMISSIONS));
}

module.exports = {
  TEACHER_DEFAULT_MODULE_PERMISSIONS,
  TEACHER_PERMISSION_NAMES,
  teacherModulePermissionsMap,
};
