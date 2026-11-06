/**
 * controllers/message.controller.js
 *
 * Mention population:
 *   mentions[] is stored as [{ userId: ObjectId, position: Number }].
 *   On every read we populate userId → { _id, name, profile_image } so the
 *   frontend can render @Name chips at the correct position without extra calls.
 */

const Message      = require("../../models/chat/message.chat.model");
const Conversation = require("../../models/chat/conversation.chat.model");
const Reaction     = require("../../models/chat/reaction.chat.model");
const { getIO }    = require("../../services/socket/index");
const { escapeRegex, clampLimit } = require("../../services/socket/utils/chatAccess");

// ─────────────────────────────────────────────────────────────────────────────
// GET paginated messages for a conversation
// ─────────────────────────────────────────────────────────────────────────────
exports.getMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;
    const { before } = req.query;
    const pageSize = clampLimit(req.query.limit, 40, 100);

    // Verify access
    const conv = await Conversation.findOne({
      _id: conversationId,
      "participants.userId": userId,
      isDeleted: false,
    }).lean();
    if (!conv) return res.status(403).json({ ok: false, error: "Access denied" });

    const query = {
      conversationId,
      deletedForUsers: { $ne: userId },
    };

    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .populate("senderId", "name profile_image")
      .populate("replyToPreview.senderId", "name")
      // Populate mentions.userId → { _id, name, profile_image }
      .populate("mentions.userId", "name profile_image")
      .lean();

    // Attach reactions
    const messageIds  = messages.map((m) => m._id);
    const reactions   = await Reaction.find({ messageId: { $in: messageIds } })
      .populate("userId", "name profile_image")
      .lean();

    const reactionsMap = {};
    reactions.forEach((r) => {
      const key = r.messageId?.toString();
      if (!key) return;
      if (!reactionsMap[key]) reactionsMap[key] = [];
      reactionsMap[key].push(r);
    });

    const enriched = messages.map((m) => ({
      ...m,
      reactions: reactionsMap[m._id?.toString()] || [],
    }));

    res.json({
      ok:       true,
      messages: enriched.reverse(),  // oldest-first
      hasMore:  messages.length === pageSize,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH messages
// ─────────────────────────────────────────────────────────────────────────────
exports.searchMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;
    const { q, limit = 20 } = req.query;

    if (!q) return res.status(400).json({ ok: false, error: "Query required" });

    const conv = await Conversation.findOne({
      _id: conversationId,
      "participants.userId": userId,
    }).lean();
    if (!conv) return res.status(403).json({ ok: false, error: "Access denied" });

    const messages = await Message.find({
      conversationId,
      deletedForEveryone: false,
      deletedForUsers: { $ne: userId },
      text: { $regex: escapeRegex(String(q).slice(0, 100)), $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(clampLimit(limit, 20, 50))
      .populate("senderId", "name profile_image")
      .populate("mentions.userId", "name profile_image")
      .lean();

    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PIN / UNPIN message
// ─────────────────────────────────────────────────────────────────────────────
exports.pinMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId, messageId } = req.params;

    const conv = await Conversation.findOne({
      _id: conversationId,
      isDeleted: false,
      $or: [
        { type: "direct", "participants.userId": userId },
        { type: "group", "participants": { $elemMatch: { userId, role: "admin" } } },
      ],
    });
    if (!conv) return res.status(403).json({ ok: false, error: "Not authorized" });

    const alreadyPinned = conv.pinnedMessages.some(
      (p) => p.messageId.toString() === messageId
    );

    if (alreadyPinned) {
      conv.pinnedMessages = conv.pinnedMessages.filter(
        (p) => p.messageId.toString() !== messageId
      );
    } else {
      conv.pinnedMessages.push({ messageId, pinnedBy: userId });
    }

    await conv.save();
    const updatedConversation = await Conversation.findById(conversationId)
      .populate("pinnedMessages.messageId", "text type file deletedForEveryone")
      .lean();

    const io = getIO();
    io.of("/chat").to(`conv:${conversationId}`).emit("conversation:updated", {
      conversationId,
      pinnedMessages: updatedConversation?.pinnedMessages || [],
    });

    res.json({
      ok: true,
      pinned: !alreadyPinned,
      pinnedMessages: updatedConversation?.pinnedMessages || [],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET media files shared in a conversation
// ─────────────────────────────────────────────────────────────────────────────
exports.getConversationMedia = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;
    const { type = "image" } = req.query;
    const limit = clampLimit(req.query.limit, 20, 100);
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);

    const conv = await Conversation.findOne({
      _id: conversationId,
      "participants.userId": userId,
      isDeleted: false,
    }).lean();
    if (!conv) return res.status(403).json({ ok: false, error: "Access denied" });

    const typeMap = {
      image: ["image"],
      file:  ["file", "document"],
      media: ["image", "video", "audio"],
    };
    const types = typeMap[type] || ["image"];

    const messages = await Message.find({
      conversationId,
      type: { $in: types },
      deletedForEveryone: false,
      "file.url": { $exists: true, $ne: "" },
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("senderId", "name")
      .lean();

    res.json({ ok: true, media: messages });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error" });
  }
};