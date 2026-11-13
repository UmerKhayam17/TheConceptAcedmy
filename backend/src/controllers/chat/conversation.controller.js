/**
 * controllers/conversation.controller.js
 */

const Conversation = require("../../models/chat/conversation.chat.model");
const Message      = require("../../models/chat/message.chat.model");
const UserPresence = require("../../models/chat/userPresence.chat.model");
const User         = require("../../models/User");
const { getIO }    = require("../../services/socket/index");

function enrichUser(user) {
  if (!user || typeof user !== "object") return user;
  return {
    ...user,
    profile_image: user.profileImage || user.profile_image || null,
  };
}

function enrichConversation(conv) {
  if (!conv) return conv;
  return {
    ...conv,
    participants: (conv.participants || []).map((p) => ({
      ...p,
      userId: enrichUser(p.userId),
    })),
  };
}

/** Routes use `:id`; some handlers/docs use `:conversationId`. */
function conversationIdFromReq(req) {
  return req.params.conversationId || req.params.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET all conversations for logged-in user
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({
      "participants.userId": userId,
      isDeleted: false,
    })
      .sort({ lastMessageAt: -1 })
      .populate({
        path: "participants.userId",
        select: "name profileImage email designation",
        populate: { path: "role", select: "name" },
      })
      .populate("lastMessageId", "text type createdAt senderId status")
      .populate("pinnedMessages.messageId", "text type file deletedForEveryone")
      .lean();

    const userIds = conversations.flatMap((c) =>
      c.participants.map((p) => p.userId?._id?.toString())
    );
    const presences = await UserPresence.find({
      userId: { $in: [...new Set(userIds)] },
    }).lean();

    const presenceMap = {};
    presences.forEach((p) => { presenceMap[p.userId.toString()] = p.status; });

    const enriched = conversations.map((conv) => {
      const base = enrichConversation(conv);
      return {
        ...base,
        participants: base.participants.map((p) => ({
          ...p,
          userId: {
            ...p.userId,
            onlineStatus: presenceMap[p.userId?._id?.toString()] || "offline",
          },
        })),
        myUnreadCount:
          base.participants.find(
            (p) => p.userId?._id?.toString() === userId.toString()
          )?.unreadCount || 0,
      };
    });

    res.json({ ok: true, conversations: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET or CREATE direct conversation
// ─────────────────────────────────────────────────────────────────────────────
exports.getOrCreateDirect = async (req, res) => {
  try {
    const userId = req.user._id;
    const { targetUserId } = req.params;

    const targetUser = await User.findOne({ _id: targetUserId, isActive: true }).lean();
    if (!targetUser) return res.status(404).json({ ok: false, error: "User not found" });

    let conv = await Conversation.findOne({
      type:      "direct",
      isDeleted: false,
      $and: [
        { "participants.userId": userId },
        { "participants.userId": targetUserId },
      ],
    })
      .populate({
        path: "participants.userId",
        select: "name profileImage email designation",
        populate: { path: "role", select: "name" },
      })
      .populate("lastMessageId", "text type createdAt status")
      .populate("pinnedMessages.messageId", "text type file deletedForEveryone")
      .lean();

    if (!conv) {
      conv = await Conversation.create({
        type: "direct",
        participants: [
          { userId, role: "member" },
          { userId: targetUserId, role: "member" },
        ],
      });
      conv = await Conversation.findById(conv._id)
        .populate({
        path: "participants.userId",
        select: "name profileImage email designation",
        populate: { path: "role", select: "name" },
      })
        .populate("lastMessageId", "text type createdAt status")
        .populate("pinnedMessages.messageId", "text type file deletedForEveryone")
        .lean();
    }

    res.json({ ok: true, conversation: enrichConversation(conv) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE group conversation
// ─────────────────────────────────────────────────────────────────────────────
exports.createGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, description, participantIds, avatar } = req.body;

    if (!title) return res.status(400).json({ ok: false, error: "Group title required" });
    if (!participantIds?.length)
      return res.status(400).json({ ok: false, error: "At least one participant required" });

    const uniqueIds  = [...new Set([userId.toString(), ...participantIds])];
    const participants = uniqueIds.map((id) => ({
      userId: id,
      role:   id === userId.toString() ? "admin" : "member",
    }));

    const conv = await Conversation.create({
      type:        "group",
      title,
      description: description || "",
      avatar:      avatar      || "",
      createdBy:   userId,
      participants,
    });

    const populated = enrichConversation(
      await Conversation.findById(conv._id)
        .populate({
        path: "participants.userId",
        select: "name profileImage email designation",
        populate: { path: "role", select: "name" },
      })
        .lean()
    );

    const io = getIO();
    uniqueIds.forEach((pid) => {
      io.of("/chat").to(`user:${pid}`).emit("conversation:new", populated);
    });

    res.status(201).json({ ok: true, conversation: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE group (title, description, avatar, settings)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = conversationIdFromReq(req);
    const { title, description, avatar, settings } = req.body;

    const conv = await Conversation.findOne({
      _id:           conversationId,
      type:          "group",
      "participants": { $elemMatch: { userId, role: "admin" } },
    });
    if (!conv) return res.status(403).json({ ok: false, error: "Not authorized" });

    if (title       !== undefined) conv.title       = title;
    if (description !== undefined) conv.description = description;
    if (avatar      !== undefined) conv.avatar      = avatar;
    if (settings    !== undefined) conv.settings    = { ...conv.settings.toObject(), ...settings };

    await conv.save();

    const io = getIO();
    io.of("/chat").to(`conv:${conversationId}`).emit("conversation:updated", {
      conversationId,
      title:       conv.title,
      description: conv.description,
      avatar:      conv.avatar,
      settings:    conv.settings,
    });

    res.json({ ok: true, conversation: conv });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE group SETTINGS only
// PATCH /chat/conversations/:conversationId/settings
// ─────────────────────────────────────────────────────────────────────────────
exports.updateGroupSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = conversationIdFromReq(req);

    const allowedKeys = [
      "onlyAdminsCanSend",
      "allowFileSharing",
      "messageRetentionDays",
      "disappearingMessages",
      "allowReactions",
      "allowReplies",
      "allowForwarding",
      "onlyAdminsCanAddMembers", 
      "allowEditing",
      "editTimeLimit", 
    ];

    const updates = {};
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) updates[`settings.${key}`] = req.body[key];
    }

    if (!Object.keys(updates).length)
      return res.status(400).json({ ok: false, error: "No valid settings provided" });

    const conv = await Conversation.findOneAndUpdate(
      {
        _id:           conversationId,
        type:          "group",
        "participants": { $elemMatch: { userId, role: "admin" } },
      },
      { $set: updates },
      { new: true }
    );

    if (!conv) return res.status(403).json({ ok: false, error: "Not authorized or group not found" });

    const io = getIO();
    io.of("/chat").to(`conv:${conversationId}`).emit("conversation:updated", {
      conversationId,
      settings: conv.settings,
    });

    res.json({ ok: true, settings: conv.settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADD participants to group
// Only admin can add IF onlyAdminsCanAddMembers is true, otherwise any member
// ─────────────────────────────────────────────────────────────────────────────
exports.addParticipants = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = conversationIdFromReq(req);
    const { userIds } = req.body;

    const conv = await Conversation.findOne({
      _id:       conversationId,
      type:      "group",
      isDeleted: false,
      "participants.userId": userId,
    });
    if (!conv) return res.status(403).json({ ok: false, error: "Not a participant" });

    const requester = conv.participants.find((p) => p.userId.toString() === userId.toString());
    const isAdmin   = requester?.role === "admin";

    // Check permission: if onlyAdminsCanAddMembers is enabled, only admins can add
    if (conv.settings?.onlyAdminsCanAddMembers && !isAdmin) {
      return res.status(403).json({ ok: false, error: "Only admins can add members" });
    }

    const existing = conv.participants.map((p) => p.userId.toString());
    const toAdd    = userIds.filter((id) => !existing.includes(id));

    toAdd.forEach((id) => conv.participants.push({ userId: id, role: "member" }));
    await conv.save();

    const populated = await Conversation.findById(conv._id)
      .populate({
        path: "participants.userId",
        select: "name profileImage email designation",
        populate: { path: "role", select: "name" },
      })
      .lean();

    const io = getIO();
    toAdd.forEach((pid) => {
      io.of("/chat").to(`user:${pid}`).emit("conversation:new", populated);
    });
    io.of("/chat").to(`conv:${conversationId}`).emit("conversation:participants-added", {
      conversationId,
      addedBy:         userId,
      newParticipants: toAdd,
      participants:    populated.participants,
    });

    res.json({ ok: true, participants: populated.participants });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE participant / Leave group
// Admin can remove members but NOT other admins.
// ─────────────────────────────────────────────────────────────────────────────
exports.removeParticipant = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = conversationIdFromReq(req);
    const { targetUserId } = req.params;

    const conv = await Conversation.findOne({ _id: conversationId, type: "group", isDeleted: false });
    if (!conv) return res.status(404).json({ ok: false, error: "Group not found" });

    const requester  = conv.participants.find((p) => p.userId.toString() === userId.toString());
    const target     = conv.participants.find((p) => p.userId.toString() === targetUserId);
    const isSelf     = userId.toString() === targetUserId;
    const isAdmin    = requester?.role === "admin";
    const isCreator  = conv.createdBy?.toString() === userId.toString();

    if (!isSelf && !isAdmin)
      return res.status(403).json({ ok: false, error: "Not authorized" });

    // Admin cannot remove another admin (unless they are the creator removing a non-creator admin)
    if (!isSelf && target?.role === "admin" && !isCreator) {
      return res.status(403).json({ ok: false, error: "Cannot remove another admin" });
    }

    conv.participants = conv.participants.filter(
      (p) => p.userId.toString() !== targetUserId
    );
    await conv.save();

    const io = getIO();
    io.of("/chat").to(`conv:${conversationId}`).emit("conversation:participant-removed", {
      conversationId,
      removedUserId: targetUserId,
      removedBy:     userId,
    });
    // After telling them, pull the removed user's live connections out of the room so they
    // stop receiving this group's messages / typing (room = membership for socket events).
    io.of("/chat").in(`user:${targetUserId}`).socketsLeave(`conv:${conversationId}`);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE member role (admin only; cannot demote yourself if last admin)
// PATCH /chat/conversations/:conversationId/participants/:targetUserId/role
// Body: { role: "admin" | "member" }
// ─────────────────────────────────────────────────────────────────────────────
exports.changeParticipantRole = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = conversationIdFromReq(req);
    const { targetUserId } = req.params;
    const { role } = req.body;

    if (!["admin", "member"].includes(role))
      return res.status(400).json({ ok: false, error: "Invalid role" });

    const conv = await Conversation.findOne({
      _id:       conversationId,
      type:      "group",
      isDeleted: false,
    });
    if (!conv) return res.status(404).json({ ok: false, error: "Group not found" });

    const requester = conv.participants.find((p) => p.userId.toString() === userId.toString());
    if (requester?.role !== "admin")
      return res.status(403).json({ ok: false, error: "Only admins can change roles" });

    // Prevent demoting self if last admin
    if (targetUserId === userId.toString() && role === "member") {
      const adminCount = conv.participants.filter((p) => p.role === "admin").length;
      if (adminCount <= 1)
        return res.status(400).json({ ok: false, error: "Cannot demote yourself — you're the only admin" });
    }

    const target = conv.participants.find((p) => p.userId.toString() === targetUserId);
    if (!target) return res.status(404).json({ ok: false, error: "Participant not found" });

    target.role = role;
    await conv.save();

    const populated = await Conversation.findById(conv._id)
      .populate({
        path: "participants.userId",
        select: "name profileImage email designation",
        populate: { path: "role", select: "name" },
      })
      .lean();

    const io = getIO();
    io.of("/chat").to(`conv:${conversationId}`).emit("conversation:role-changed", {
      conversationId,
      targetUserId,
      role,
      changedBy:    userId,
      participants: populated.participants,
    });

    res.json({ ok: true, participants: populated.participants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN EXIT GROUP — must assign a new admin first if last admin
// DELETE /chat/conversations/:conversationId/leave
// Body (optional): { newAdminId: "<userId>" }  — required if last admin
// ─────────────────────────────────────────────────────────────────────────────
exports.leaveGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = conversationIdFromReq(req);
    const { newAdminId } = req.body || {};

    const conv = await Conversation.findOne({
      _id:       conversationId,
      type:      "group",
      isDeleted: false,
      "participants.userId": userId,
    });
    if (!conv) return res.status(404).json({ ok: false, error: "Not a participant" });

    const requester  = conv.participants.find((p) => p.userId.toString() === userId.toString());
    const isAdmin    = requester?.role === "admin";
    const adminCount = conv.participants.filter((p) => p.role === "admin").length;

    // If last admin, must hand off before leaving
    if (isAdmin && adminCount === 1) {
      if (!newAdminId)
        return res.status(400).json({
          ok: false,
          error: "You are the last admin. Assign a new admin before leaving.",
          requiresAdminAssignment: true,
        });

      const newAdmin = conv.participants.find(
        (p) => p.userId.toString() === newAdminId && p.userId.toString() !== userId.toString()
      );
      if (!newAdmin)
        return res.status(400).json({ ok: false, error: "Invalid new admin selection" });

      newAdmin.role = "admin";
    }

    // Remove the leaving user
    conv.participants = conv.participants.filter(
      (p) => p.userId.toString() !== userId.toString()
    );

    // If no participants left, soft-delete
    if (conv.participants.length === 0) {
      conv.isDeleted = true;
    }

    await conv.save();

    const io = getIO();
    io.of("/chat").to(`conv:${conversationId}`).emit("conversation:participant-removed", {
      conversationId,
      removedUserId: userId.toString(),
      removedBy:     userId.toString(),
    });
    // The leaver's open tabs leave the room too.
    io.of("/chat").in(`user:${userId}`).socketsLeave(`conv:${conversationId}`);

    if (newAdminId) {
      const populated = await Conversation.findById(conv._id)
        .populate({
        path: "participants.userId",
        select: "name profileImage email designation",
        populate: { path: "role", select: "name" },
      })
        .lean();
      io.of("/chat").to(`conv:${conversationId}`).emit("conversation:role-changed", {
        conversationId,
        targetUserId:  newAdminId,
        role:          "admin",
        changedBy:     userId.toString(),
        participants:  populated?.participants || [],
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE group (only the group creator)
// DELETE /chat/conversations/:conversationId
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = conversationIdFromReq(req);

    const conv = await Conversation.findOne({
      _id:       conversationId,
      type:      "group",
      isDeleted: false,
    });
    if (!conv) return res.status(404).json({ ok: false, error: "Group not found" });

    // Only the original creator can delete
    if (conv.createdBy?.toString() !== userId.toString())
      return res.status(403).json({ ok: false, error: "Only the group creator can delete this group" });

    conv.isDeleted = true;
    await conv.save();

    const io = getIO();
    io.of("/chat").to(`conv:${conversationId}`).emit("conversation:deleted", {
      conversationId,
      deletedBy: userId,
    });
    // Deleted group: empty its room so nobody keeps receiving events for it.
    io.of("/chat").in(`conv:${conversationId}`).socketsLeave(`conv:${conversationId}`);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET single conversation details
// ─────────────────────────────────────────────────────────────────────────────
exports.getConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversationId = conversationIdFromReq(req);

    const conv = await Conversation.findOne({
      _id:                   conversationId,
      "participants.userId": userId,
      isDeleted:             false,
    })
      .populate({
        path: "participants.userId",
        select: "name profileImage email designation",
        populate: { path: "role", select: "name" },
      })
      .populate("lastMessageId")
      .populate("pinnedMessages.messageId", "text type file deletedForEveryone")
      .lean();

    if (!conv) return res.status(404).json({ ok: false, error: "Not found" });

    res.json({ ok: true, conversation: conv });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error" });
  }
};