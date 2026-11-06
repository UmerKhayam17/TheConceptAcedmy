/**
 * socket/utils/chatAccess.js
 * Membership checks shared by chat socket handlers and chat REST controllers.
 * Every event that reads or writes a message/conversation must prove the caller belongs to it.
 */

const mongoose = require("mongoose");
const Conversation = require("../../../models/chat/conversation.chat.model");
const { escapeRegExp } = require("../../../utils/parentScope");

const isObjectId = (id) => mongoose.isValidObjectId(id) && /^[a-f0-9]{24}$/i.test(String(id));

/** True when `userId` is a participant of a non-deleted conversation. */
async function isParticipant(conversationId, userId) {
  if (!isObjectId(conversationId) || !userId) return false;
  const found = await Conversation.exists({
    _id: conversationId,
    "participants.userId": userId,
    isDeleted: false,
  });
  return Boolean(found);
}

/**
 * Cheap check for high-frequency events (typing): sockets only join `conv:<id>` after
 * conversation:join / join-all verified membership.
 */
function socketInConversation(socket, conversationId) {
  return isObjectId(conversationId) && socket.rooms.has(`conv:${conversationId}`);
}

/** Can this user see this message? (member of its conversation, not deleted for them) */
async function canSeeMessage(message, userId) {
  if (!message || message.deletedForEveryone) return false;
  if ((message.deletedForUsers || []).some((id) => String(id) === String(userId))) return false;
  return isParticipant(message.conversationId, userId);
}

/** Escape user text before using it inside a $regex (prevents ReDoS / regex injection). */
function escapeRegex(value) {
  return escapeRegExp(String(value || ""));
}

/** Clamp a client-supplied page size. */
function clampLimit(value, fallback = 20, max = 50) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

module.exports = { isObjectId, isParticipant, socketInConversation, canSeeMessage, escapeRegex, clampLimit };
