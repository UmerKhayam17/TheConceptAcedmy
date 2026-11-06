const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { CHAT_FILE_TYPES, classifyUpload } = require('../utils/uploadSafety');
const { Router } = require('express');
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const conversationCtrl = require('../controllers/chat/conversation.controller');
const messageCtrl = require('../controllers/chat/message.controller');
const fileCtrl = require('../controllers/chat/file.controller');
const userChatCtrl = require('../controllers/chat/user.chat.controller');

const chatUploadDir = path.join(__dirname, '../../uploads/chat');
fs.mkdirSync(chatUploadDir, { recursive: true });

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: chatUploadDir,
    // Random, unguessable name + the server-approved extension (never the client's name).
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${file.safeType.ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const safeType = classifyUpload(file, CHAT_FILE_TYPES);
    if (!safeType) {
      return cb(new ApiError(400, 'This file type is not allowed in chat.'));
    }
    // eslint-disable-next-line no-param-reassign
    file.safeType = safeType;
    return cb(null, true);
  },
});

const router = Router();
router.use(protect);
router.use(requirePermission('use_chat'));

router.get('/users/search', userChatCtrl.searchUsers);

router.get('/conversations', conversationCtrl.getMyConversations);
router.post('/conversations/group', conversationCtrl.createGroup);
router.get('/conversations/direct/:targetUserId', conversationCtrl.getOrCreateDirect);
router.get('/conversations/:id', conversationCtrl.getConversation);
router.patch('/conversations/:id', conversationCtrl.updateGroup);
router.patch('/conversations/:id/settings', conversationCtrl.updateGroupSettings);
router.post('/conversations/:id/participants', conversationCtrl.addParticipants);
router.delete('/conversations/:id/participants/:userId', conversationCtrl.removeParticipant);
router.patch(
  '/conversations/:id/participants/:targetUserId/role',
  conversationCtrl.changeParticipantRole
);
router.delete('/conversations/:id/leave', conversationCtrl.leaveGroup);
router.delete('/conversations/:id', conversationCtrl.deleteGroup);

router.get('/conversations/:conversationId/messages', messageCtrl.getMessages);
router.get('/conversations/:conversationId/messages/search', messageCtrl.searchMessages);
router.get('/conversations/:conversationId/media', messageCtrl.getConversationMedia);
router.post(
  '/conversations/:conversationId/messages/:messageId/pin',
  messageCtrl.pinMessage
);

router.post('/upload', chatUpload.single('chat_file'), fileCtrl.uploadFile);

module.exports = router;
