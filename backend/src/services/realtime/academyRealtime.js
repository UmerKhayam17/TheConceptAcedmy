/** One-liner realtime sync helpers for academy CRUD controllers. */
const { syncResource, syncStudentCrud, notifyStudentIntake } = require('./realtimeService');

const SM = 'studentManagement';

module.exports = {
  studentCreated: (student, actorId) => {
    if (student?.status === 'pending_fee') {
      void notifyStudentIntake(student, actorId).catch((err) => {
        console.error('notifyStudentIntake failed:', err.message);
      });
    } else {
      syncStudentCrud('created', student);
    }
  },
  studentUpdated: (student) => syncStudentCrud('updated', student),
  studentDeleted: (id) => syncStudentCrud('deleted', { _id: id }),
  studentActivated: (student) => syncStudentCrud('activated', student),

  classCrud: (action, id) => syncResource(SM, 'classes', action, id),
  sectionCrud: (action, id) => syncResource(SM, 'sections', action, id),
  subjectCrud: (action, id) => syncResource(SM, 'subjects', action, id),
  feeStructureCrud: (action, id) => syncResource(SM, 'feeStructures', action, id),
  feeCrud: (action, id, extra) => syncResource('fee', 'fees', action, id, extra),
  salaryCrud: (action, id) => syncResource('salary', 'salaries', action, id),
  staffAdvanceCrud: (action, id) => syncResource('staffAdvance', 'staffAdvances', action, id),
  expenseCrud: (action, id) => syncResource('academyExpense', 'expenses', action, id),
  attendanceCrud: (action, id) => syncResource('attendance', 'attendance', action, id),
  assessmentCrud: (action, id) => syncResource('exam', 'assessments', action, id),
  classTestCrud: (action, id) => syncResource('exam', 'classTests', action, id),
  timetableCrud: (action, id) => syncResource('timetable', 'timetable', action, id),
  announcementCrud: (action, id) => syncResource('announcement', 'announcements', action, id),
  userCrud: (action, id) => syncResource('user', 'users', action, id),
  configCrud: (action, resource, id) => syncResource('config', resource, action, id),
};
