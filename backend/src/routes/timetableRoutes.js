const { Router } = require('express');
const { protect } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/timetableSchemas');
const setup = require('../controllers/timetable/timetableSetupController');
const tt = require('../controllers/timetable/timetableController');

const router = Router();
router.use(protect);

const canView = requireAnyPermission('view_timetables', 'manage_timetables', 'manage_classes');
const canManage = requireAnyPermission('manage_timetables', 'manage_classes');
const canPublish = requireAnyPermission('manage_timetables');

// ─── Setup: Rooms ───────────────────────────────────────────────
router.get('/setup/rooms', canView, setup.listRooms);
router.get('/setup/rooms/:id', canView, setup.getRoom);
router.post('/setup/rooms', canManage, validate(schemas.roomBody), setup.createRoom);
router.patch('/setup/rooms/:id', canManage, validate(schemas.roomPatch), setup.updateRoom);
router.delete('/setup/rooms/:id', canManage, setup.deleteRoom);

// ─── Setup: Period templates ────────────────────────────────────
router.get('/setup/period-templates', canView, setup.listPeriodTemplates);
router.get('/setup/period-templates/:id', canView, setup.getPeriodTemplate);
router.post(
  '/setup/period-templates',
  canManage,
  validate(schemas.periodTemplateBody),
  setup.createPeriodTemplate
);
router.patch(
  '/setup/period-templates/:id',
  canManage,
  validate(schemas.periodTemplatePatch),
  setup.updatePeriodTemplate
);
router.delete('/setup/period-templates/:id', canManage, setup.deletePeriodTemplate);

// ─── Setup: Teacher profiles ────────────────────────────────────
router.get('/setup/teacher-profiles', canView, setup.listTeacherProfiles);
router.post(
  '/setup/teacher-profiles/sync-all',
  canManage,
  validate(schemas.teacherProfileSyncAllBody),
  setup.syncAllTeacherProfiles
);
router.get('/setup/teacher-profiles/:id', canView, setup.getTeacherProfile);
router.post(
  '/setup/teacher-profiles',
  canManage,
  validate(schemas.teacherProfileBody),
  setup.createTeacherProfile
);
router.patch(
  '/setup/teacher-profiles/:id',
  canManage,
  validate(schemas.teacherProfilePatch),
  setup.updateTeacherProfile
);
router.delete('/setup/teacher-profiles/:id', canManage, setup.deleteTeacherProfile);

// ─── Setup: Teacher assignments ─────────────────────────────────
router.get('/setup/teacher-assignments', canView, setup.listTeacherAssignments);
router.post(
  '/setup/teacher-assignments/bulk',
  canManage,
  validate(schemas.teacherAssignmentBulkBody),
  setup.bulkSyncTeacherAssignments
);
router.put(
  '/setup/teacher-assignments/subject-teacher',
  canManage,
  validate(schemas.subjectTeacherUpsertBody),
  setup.upsertSubjectTeacher
);
router.put(
  '/setup/teacher-assignments/section-subjects',
  canManage,
  validate(schemas.sectionSubjectTeachersBody),
  setup.syncSectionSubjectTeachers
);
router.post(
  '/setup/teacher-assignments',
  canManage,
  validate(schemas.teacherAssignmentBody),
  setup.createTeacherAssignment
);
router.patch(
  '/setup/teacher-assignments/:id',
  canManage,
  validate(schemas.teacherAssignmentPatch),
  setup.updateTeacherAssignment
);
router.delete('/setup/teacher-assignments/:id', canManage, setup.deleteTeacherAssignment);

// ─── Setup: Timetable settings (per session) ──────────────────────
router.get('/setup/settings/:sessionId', canView, setup.getSettings);
router.put(
  '/setup/settings/:sessionId',
  canManage,
  validate(schemas.timetableSettingsBody),
  setup.upsertSettings
);

// ─── Timetable versions ─────────────────────────────────────────
router.get('/versions', canView, tt.listVersions);
router.get('/versions/published', canView, tt.getPublishedForSection);
router.get('/versions/:id', canView, tt.getVersion);
router.get('/versions/:id/grid', canView, tt.getVersionGrid);
router.post('/versions', canManage, validate(schemas.timetableVersionBody), tt.createVersion);
router.post('/versions/:id/duplicate', canManage, tt.duplicateVersion);
router.post('/versions/:id/publish', canPublish, tt.publishVersion);
router.post('/versions/:id/archive', canManage, tt.archiveVersion);
router.post('/versions/:id/validate', canView, tt.validateVersionHandler);
router.delete('/versions/:id', canManage, tt.deleteVersion);

// ─── Schedule slots ───────────────────────────────────────────────
router.get('/versions/:versionId/slots', canView, tt.listSlots);
router.post(
  '/versions/:versionId/slots',
  canManage,
  validate(schemas.scheduleSlotBody),
  tt.upsertSlot
);
router.patch(
  '/slots/:slotId',
  canManage,
  validate(schemas.scheduleSlotMove),
  tt.moveSlot
);
router.delete('/slots/:slotId', canManage, tt.deleteSlot);

// ─── Auto Generate All Timetables (scheduler → draft slots) ─────
router.post(
  '/generate',
  canManage,
  validate(schemas.autoGenerateAllBody),
  tt.autoGenerateAll
);

// ─── Section Dashboard (all classes incl. 1st/2nd Year) ─────────
router.get(
  '/section-dashboard',
  canView,
  validate(schemas.sectionDashboardQuery, 'query'),
  tt.getSectionDashboard
);

// ─── Class board (sections × periods) ───────────────────────────
router.get('/class-board', canView, validate(schemas.classBoardQuery, 'query'), tt.getClassBoard);
router.post(
  '/class-board/shared-lesson',
  canManage,
  validate(schemas.sharedLessonBody),
  tt.upsertSharedLesson
);
router.delete('/class-board/combined/:combinedGroupId', canManage, tt.deleteCombinedGroup);
router.post(
  '/class-board/publish',
  canPublish,
  validate(schemas.publishClassDraftsBody),
  tt.publishClassDrafts
);
router.post(
  '/class-board/move',
  canManage,
  validate(schemas.classBoardMoveBody),
  tt.moveClassBoardLesson
);

// ─── Role-based views ───────────────────────────────────────────
router.get(
  '/me/teacher',
  requireAnyPermission('view_timetables', 'manage_timetables'),
  tt.myTeacherSchedule
);
router.get('/sections/schedule', requirePermission('view_timetables'), tt.sectionSchedule);
router.get('/rooms/:roomId/schedule', canView, tt.roomSchedule);

// ─── Substitutions ────────────────────────────────────────────────
router.post(
  '/substitutions',
  canManage,
  validate(schemas.substitutionBody),
  tt.createSubstitution
);

module.exports = router;
