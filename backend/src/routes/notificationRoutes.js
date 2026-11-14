const { Router } = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

const router = Router();

router.use(protect);
router.get('/', ctrl.list);
router.patch('/read-all', ctrl.markAllRead);
router.post('/device-token', ctrl.registerDevice);
router.delete('/device-token', ctrl.unregisterDevice);
router.patch('/:id/read', ctrl.markRead);

module.exports = router;
