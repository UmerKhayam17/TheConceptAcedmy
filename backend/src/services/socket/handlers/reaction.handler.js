/**
 * socket/handlers/reaction.handler.js
 */

const Reaction = require("../../../models/chat/reaction.chat.model");
const Message = require("../../../models/chat/message.chat.model");
const { emitToConversation } = require("../utils/roomEmitter");
const { canSeeMessage, isObjectId } = require("../utils/chatAccess");

function registerReactionHandlers(socket, nsp) {
  socket.on("reaction:toggle", async (data, ack) => {
    try {
      const { messageId, emoji } = data || {};
      const userId = socket.user._id;

      if (!isObjectId(messageId) || typeof emoji !== "string" || !emoji.trim() || emoji.length > 16) {
        return ack?.({ ok: false, error: "Invalid reaction" });
      }
      // The message must be visible to this user. Its real conversation is used (never the
      // client's conversationId), so reactions can't be added to, or broadcast into, other chats.
      const message = await Message.findById(messageId)
        .select("conversationId deletedForEveryone deletedForUsers")
        .lean();
      if (!message || !(await canSeeMessage(message, userId))) {
        return ack?.({ ok: false, error: "Message not found" });
      }
      const conversationId = message.conversationId;

      // Check if same emoji exists → remove it (toggle)
      const existing = await Reaction.findOne({ messageId, userId });

      let action;
      if (existing && existing.emoji === emoji) {
        await existing.deleteOne();
        action = "removed";
      } else if (existing) {
        existing.emoji = emoji;
        await existing.save();
        action = "updated";
      } else {
        await Reaction.create({ messageId, conversationId, userId, emoji });
        action = "added";
      }

      // Fetch all reactions for this message to send updated counts
      const reactions = await Reaction.find({ messageId })
        .populate("userId", "name profile_image")
        .lean();

      emitToConversation(nsp, conversationId, "reaction:updated", {
        conversationId,
        messageId,
        reactions,
        action,
        actorId: userId,
        emoji,
      });

      ack?.({ ok: true, action });
    } catch (err) {
      console.error("reaction:toggle error", err);
      ack?.({ ok: false, error: "Server error" });
    }
  });
}

module.exports = registerReactionHandlers;