/**
 * socket/handlers/message.handler.js
 *
 * Mention format (position-based, IDs never stored in text):
 *   text     : "Hey Alice how are you"          ← clean text, no @id tokens
 *   mentions : [{ userId: ObjectId, position: 4 }]
 *
 * On send the client sends:
 *   { text: "Hey Alice how are you", mentions: [{ userId: "...", position: 4 }] }
 *
 * The handler validates each entry, then populates userId → { _id, name, profile_image }
 * before broadcasting so receivers can render chips immediately.
 */

const Message        = require("../../../models/chat/message.chat.model");
const Conversation   = require("../../../models/chat/conversation.chat.model");
const MessageReceipt = require("../../../models/chat/messageReceipt.chat.model");
const User           = require("../../../models/User");
const FileDoc        = require("../../../models/chat/file.chat.model");
const { emitToConversation } = require("../utils/roomEmitter");
const { isParticipant, canSeeMessage, isObjectId } = require("../utils/chatAccess");
const parentNotify   = require("../../parentNotifyService");

/**
 * A file attached to a message must be one this sender uploaded (via /chat/upload).
 * Returns the stored file info, or null when the client sent someone else's / a made-up file.
 */
async function resolveOwnFile(file, senderId) {
  const url = typeof file?.url === "string" ? file.url : "";
  if (!url.startsWith("/uploads/chat/")) return null;
  const doc = await FileDoc.findOne({ url, uploadedBy: senderId }).lean();
  if (!doc) return null;
  return {
    ...file,
    _id: doc._id,
    url: doc.url,
    name: doc.name,
    size: doc.size,
    mimeType: doc.mimeType,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate & normalise the mentions array sent from the client.
 * Accepts: [{ userId, position }]
 * Returns a de-duplicated array sorted by position.
 * Drops any entry with a missing/invalid userId or non-numeric position.
 */
function normaliseMentions(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const seen = new Set();
  return raw
    .filter((m) => {
      const uid = String(m?.userId || "").trim();
      const pos = Number(m?.position);
      return uid.length === 24 && /^[a-f0-9]{24}$/i.test(uid) && Number.isInteger(pos) && pos >= 0;
    })
    .map((m) => ({ userId: String(m.userId).trim(), position: Number(m.position) }))
    .filter((m) => {
      // deduplicate by userId+position pair
      const key = `${m.userId}:${m.position}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.position - b.position);
}

/**
 * Given a saved message doc (lean), populate mentions[].userId
 * with { _id, name, profile_image } objects so the frontend can
 * render @Name chips without a second round-trip.
 */
async function populateMentions(message) {
  if (!message.mentions?.length) return message;

  const userIds = [...new Set(message.mentions.map((m) => m.userId?.toString()).filter(Boolean))];
  const users   = await User.find({ _id: { $in: userIds } })
    .select("_id name profile_image")
    .lean();

  const userMap = {};
  users.forEach((u) => { userMap[String(u._id)] = u; });

  return {
    ...message,
    mentions: message.mentions.map((m) => ({
      userId:   userMap[String(m.userId)] || { _id: m.userId },
      position: m.position,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveInitialStatus — unchanged from original
// ─────────────────────────────────────────────────────────────────────────────
async function resolveInitialStatus(nsp, conversationId, senderId, participants, messageId) {
  const sockets = await nsp.fetchSockets();

  const socketByUser = {};
  for (const s of sockets) {
    const uid = s.user?._id?.toString();
    if (uid) socketByUser[uid] = s;
  }

  let overallStatus = "sent";
  const receiptsToCreate = [];

  for (const p of participants) {
    const uid = (p.userId?._id || p.userId)?.toString();
    if (!uid || uid === senderId?.toString()) continue;

    const sock = socketByUser[uid];
    if (!sock) continue;

    const activeConvId = sock.activeConversationId?.toString();
    const isReading    = activeConvId === conversationId?.toString();

    const status = isReading ? "read" : "delivered";
    const now    = new Date();

    receiptsToCreate.push({
      messageId,
      conversationId,
      userId:      uid,
      status,
      deliveredAt: now,
      readAt:      isReading ? now : undefined,
    });

    if (status === "read") {
      overallStatus = "read";
    } else if (status === "delivered" && overallStatus !== "read") {
      overallStatus = "delivered";
    }
  }

  if (receiptsToCreate.length) {
    await Promise.all(
      receiptsToCreate.map((r) =>
        MessageReceipt.findOneAndUpdate(
          { messageId: r.messageId, userId: r.userId },
          r,
          { upsert: true, new: true }
        )
      )
    );
  }

  return overallStatus;
}

/**
 * Parent participants who are not looking at this chat right now get an in-app alert
 * (parentNotify ignores recipients who are not parents).
 */
async function alertParentRecipients(nsp, conversation, senderId, senderName, text, type) {
  try {
    const sockets = await nsp.fetchSockets();
    const viewing = new Set(
      sockets
        .filter((s) => s.activeConversationId?.toString() === String(conversation._id))
        .map((s) => s.user?._id?.toString())
        .filter(Boolean)
    );
    const recipientIds = (conversation.participants || [])
      .map((p) => (p.userId?._id || p.userId)?.toString())
      .filter((uid) => uid && uid !== String(senderId) && !viewing.has(uid));
    parentNotify.chatMessage({
      conversationId: conversation._id,
      senderName,
      text,
      type,
      recipientIds,
    });
  } catch (err) {
    console.error("chat parent alert failed", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// register handlers
// ─────────────────────────────────────────────────────────────────────────────
function registerMessageHandlers(socket, nsp) {

  // ── SEND MESSAGE ──────────────────────────────────────────
  socket.on("message:send", async (data, ack) => {
    try {
      const {
        conversationId,
        type = "text",
        text,
        file,
        replyToMessageId,
        mentions: rawMentions,
      } = data;
      const senderId = socket.user._id;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        "participants.userId": senderId,
        isDeleted: false,
      });
      if (!conversation) {
        return ack?.({ ok: false, error: "Conversation not found or access denied" });
      }

      // Normalise & validate position-based mentions
      const mentions = normaliseMentions(rawMentions);

      // An attached file must be the sender's own upload.
      let safeFile;
      if (file) {
        safeFile = await resolveOwnFile(file, senderId);
        if (!safeFile) return ack?.({ ok: false, error: "Attachment not found" });
      }

      // Build replyToPreview — only from a message in THIS conversation that the sender can see,
      // otherwise a reply could copy text out of a chat the sender is not part of.
      let replyToPreview;
      let replyId;
      if (replyToMessageId && isObjectId(replyToMessageId)) {
        const original = await Message.findOne({
          _id: replyToMessageId,
          conversationId,
          deletedForEveryone: false,
          deletedForUsers: { $ne: senderId },
        })
          .select("text type senderId")
          .lean();
        if (original) {
          replyId = original._id;
          replyToPreview = {
            senderId: original.senderId,
            text:     original.text || `[${original.type}]`,
            type:     original.type,
          };
        }
      }

      // Persist — text is always the clean string; mentions carry positions
      const message = await Message.create({
        conversationId,
        senderId,
        type,
        text:             text || "",
        file:             safeFile || undefined,
        replyToMessageId: replyId || undefined,
        replyToPreview:   replyToPreview   || undefined,
        mentions,                                          // [{ userId, position }]
        status:           "sent",
      });

      const resolvedStatus = await resolveInitialStatus(
        nsp,
        conversationId,
        senderId,
        conversation.participants,
        message._id
      );

      if (resolvedStatus !== "sent") {
        await Message.findByIdAndUpdate(message._id, { status: resolvedStatus });
        message.status = resolvedStatus;
      }

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessageId:      message._id,
        lastMessageAt:      message.createdAt,
        lastMessagePreview: `${socket.user.name}: ${text || `[${type}]`}`.slice(0, 80),
      });

      await Conversation.updateOne(
        { _id: conversationId },
        { $inc: { "participants.$[elem].unreadCount": 1 } },
        { arrayFilters: [{ "elem.userId": { $ne: senderId } }] }
      );

      // Populate senderId + replyToPreview.senderId
      let populated = await Message.findById(message._id)
        .populate("senderId", "name profile_image")
        .populate("replyToPreview.senderId", "name")
        .lean();

      // Populate mentions.userId → { _id, name, profile_image }
      populated = await populateMentions(populated);

      emitToConversation(nsp, conversationId, "message:new", populated);

      void alertParentRecipients(nsp, conversation, senderId, socket.user.name, text, type);

      // Notify each mentioned user individually
      if (mentions.length) {
        const uniqueMentionedUserIds = [...new Set(mentions.map((m) => String(m.userId)))];
        uniqueMentionedUserIds.forEach((uid) => {
          nsp.to(`user:${uid}`).emit("message:mention", { conversationId, message: populated });
        });
      }

      ack?.({ ok: true, message: populated });
    } catch (err) {
      console.error("message:send error", err);
      ack?.({ ok: false, error: "Server error" });
    }
  });

  // ── EDIT MESSAGE ──────────────────────────────────────────
  // Note: editing does NOT re-parse mentions — the edit UI sends plain text only.
  // If you want mention editing, extend this handler similarly to send.
  socket.on("message:edit", async (data, ack) => {
    try {
      const { messageId, newText } = data;
      const { _id: senderId } = socket.user;

      const message = await Message.findOne({ _id: messageId, senderId, deletedForEveryone: false });
      if (!message) return ack?.({ ok: false, error: "Message not found" });

      const conversation = await Conversation.findById(message.conversationId)
        .select("settings").lean();

      if (conversation?.settings?.allowEditing === false) {
        return ack?.({ ok: false, error: "Editing is disabled in this conversation" });
      }

      const limitMinutes = conversation?.settings?.editTimeLimit ?? 0;
      if (limitMinutes > 0) {
        const ageMins = (Date.now() - new Date(message.createdAt).getTime()) / 60000;
        if (ageMins > limitMinutes) {
          return ack?.({ ok: false, error: "Edit time limit has passed" });
        }
      }

      message.editHistory.push({ text: message.text });
      message.text     = newText;
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();

      emitToConversation(nsp, message.conversationId, "message:edited", {
        messageId,
        newText,
        editedAt:       message.editedAt,
        conversationId: message.conversationId,
      });

      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: "Server error" });
    }
  });

  // ── DELETE MESSAGE ────────────────────────────────────────
  socket.on("message:delete", async (data, ack) => {
    try {
      const { messageId, deleteFor } = data;
      const { _id: senderId } = socket.user;

      const message = await Message.findOne({ _id: messageId, senderId });
      if (!message) return ack?.({ ok: false, error: "Message not found" });

      if (deleteFor === "everyone") {
        message.deletedForEveryone = true;
        message.text = "";
        message.file = undefined;
        await message.save();
        emitToConversation(nsp, message.conversationId, "message:deleted", {
          messageId,
          deleteFor:      "everyone",
          conversationId: message.conversationId,
        });
      } else {
        if (!message.deletedForUsers.includes(senderId)) {
          message.deletedForUsers.push(senderId);
          await message.save();
        }
        nsp.to(`user:${senderId}`).emit("message:deleted", {
          messageId,
          deleteFor:      "me",
          conversationId: message.conversationId,
        });
      }

      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: "Server error" });
    }
  });

  // ── FORWARD MESSAGE ───────────────────────────────────────
  // Forwarded messages do NOT carry mentions (mentions are per-context).
  socket.on("message:forward", async (data, ack) => {
    try {
      const { messageId, targetConversationIds } = data;
      const { _id: senderId, name } = socket.user;

      if (!isObjectId(messageId) || !Array.isArray(targetConversationIds)) {
        return ack?.({ ok: false, error: "Original message not found" });
      }
      const original = await Message.findById(messageId).lean();
      // Only a message the sender can actually see may be forwarded (same error either way,
      // so the response does not reveal whether a message id exists elsewhere).
      if (!original || !(await canSeeMessage(original, senderId))) {
        return ack?.({ ok: false, error: "Original message not found" });
      }

      const created = [];
      for (const convId of targetConversationIds.slice(0, 20)) {
        const targetConversation = await Conversation.findOne({
          _id:                  convId,
          "participants.userId": senderId,
          isDeleted:            false,
        }).select("_id participants");
        if (!targetConversation) continue;

        const msg = await Message.create({
          conversationId: convId,
          senderId,
          type:           original.type,
          text:           original.text,
          file:           original.file,
          isForwarded:    true,
          forwardedFrom: {
            messageId:      original._id,
            conversationId: original.conversationId,
            senderId:       original.senderId,
          },
          // Forwarded messages do NOT inherit mentions — context is different
          mentions: [],
          status: "sent",
        });

        const resolvedStatus = await resolveInitialStatus(
          nsp, convId, senderId, targetConversation.participants, msg._id
        );
        if (resolvedStatus !== "sent") {
          await Message.findByIdAndUpdate(msg._id, { status: resolvedStatus });
        }

        await Conversation.findByIdAndUpdate(convId, {
          lastMessageId:      msg._id,
          lastMessageAt:      msg.createdAt,
          lastMessagePreview: `${name}: ${original.text || `[${original.type}]`}`.slice(0, 80),
        });

        const populated = await Message.findById(msg._id)
          .populate("senderId", "name profile_image")
          .lean();

        emitToConversation(nsp, convId, "message:new", populated);
        created.push(populated);
      }

      ack?.({ ok: true, messages: created });
    } catch (err) {
      ack?.({ ok: false, error: "Server error" });
    }
  });

  // ── MARK READ ─────────────────────────────────────────────
  socket.on("message:read", async (data, ack) => {
    try {
      const { conversationId } = data;
      const userId = socket.user._id;

      if (!(await isParticipant(conversationId, userId))) {
        return ack?.({ ok: false, error: "Conversation not found or access denied" });
      }

      socket.activeConversationId = conversationId;

      const now = new Date();

      const unreadMessages = await Message.find({
        conversationId,
        senderId:           { $ne: userId },
        deletedForEveryone: false,
        status:             { $in: ["sent", "delivered"] },
      }).select("_id senderId").lean();

      if (unreadMessages.length === 0) {
        await Conversation.updateOne(
          { _id: conversationId, "participants.userId": userId },
          { $set: { "participants.$.unreadCount": 0, "participants.$.lastReadAt": now } }
        );
        ack?.({ ok: true });
        return;
      }

      const messageIds = unreadMessages.map((m) => m._id);

      await Promise.all(
        messageIds.map((mid) =>
          MessageReceipt.findOneAndUpdate(
            { messageId: mid, userId },
            {
              messageId:      mid,
              conversationId,
              userId,
              status:         "read",
              deliveredAt:    now,
              readAt:         now,
            },
            { upsert: true, new: true }
          )
        )
      );

      const conversation = await Conversation.findById(conversationId)
        .select("participants")
        .lean();

      const otherParticipantIds = conversation.participants
        .map((p) => (p.userId?._id || p.userId)?.toString())
        .filter((id) => id !== userId.toString());

      await Promise.all(
        messageIds.map(async (mid) => {
          const readCount = await MessageReceipt.countDocuments({
            messageId: mid,
            status:    "read",
            userId:    { $ne: (unreadMessages.find(m => m._id.equals(mid)))?.senderId },
          });

          const msgSenderId    = (unreadMessages.find(m => m._id.equals(mid)))?.senderId?.toString();
          const expectedReaders = otherParticipantIds.filter(id => id !== msgSenderId).length + 1;

          const newStatus = readCount >= expectedReaders ? "read" : "delivered";
          await Message.findByIdAndUpdate(mid, { status: newStatus });
        })
      );

      await Conversation.updateOne(
        { _id: conversationId, "participants.userId": userId },
        { $set: { "participants.$.unreadCount": 0, "participants.$.lastReadAt": now } }
      );

      const senderIds = [...new Set(unreadMessages.map((m) => m.senderId?.toString()).filter(Boolean))];
      senderIds.forEach((sid) => {
        nsp.to(`user:${sid}`).emit("message:seen", {
          conversationId,
          seenBy: userId,
          seenAt: now,
        });
      });

      ack?.({ ok: true });
    } catch (err) {
      console.error("message:read error", err);
      ack?.({ ok: false, error: "Server error" });
    }
  });

  // ── CONVERSATION BLUR ─────────────────────────────────────
  socket.on("conversation:blur", ({ conversationId }) => {
    if (socket.activeConversationId?.toString() === conversationId?.toString()) {
      socket.activeConversationId = null;
    }
  });
}

module.exports = registerMessageHandlers;