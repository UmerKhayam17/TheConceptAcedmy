const { Router } = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const examRoutes = require('./examRoutes');
const announcementRoutes = require('./announcementRoutes');
const configRoutes = require('./configRoutes');
const timetableRoutes = require('./timetableRoutes');
const studentManagementRoutes = require('./studentManagementRoutes');
const roleRoutes = require('./roleRoutes');
const chatRoutes = require('./chatRoutes');
const datasheetRoutes = require('./datasheetRoutes');
const notificationRoutes = require('./notificationRoutes');
const holidayRoutes = require('./holidayRoutes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
// Before roleRoutes/examRoutes: those are mounted without a prefix and require login for
// every path, which would block the open /backup/status progress check during a restore.
router.use('/backup', require('./backupRoutes'));
router.use(roleRoutes);
router.use(examRoutes);
router.use('/announcements', announcementRoutes);
router.use('/config', configRoutes);
router.use('/config', holidayRoutes);
router.use('/timetable', timetableRoutes);
router.use('/student-management', studentManagementRoutes);
router.use('/chat', chatRoutes);
router.use('/datasheets', datasheetRoutes);
router.use('/notifications', notificationRoutes);
router.use('/ai-attendance', require('./aiAttendanceRoutes'));
router.use('/academic-calendar', require('./academicCalendarRoutes'));

module.exports = router;
