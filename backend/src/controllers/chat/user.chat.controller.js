/**
 * controllers/user.chat.controller.js
 * Search company users to start conversations with.
 */

const User = require("../../models/User");
const Role = require("../../models/Role");
const UserPresence = require("../../models/chat/userPresence.chat.model");
const { roleNameOfUser } = require("../../utils/systemAdmin");
const { escapeRegex, clampLimit } = require("../../services/socket/utils/chatAccess");

/**
 * Who can be found in chat search:
 *  - Staff (admin, teacher, accountant, …) can find everyone, by name or email, and see emails.
 *  - Parents can find staff only, by name only, and never see email addresses.
 *    So a parent cannot list other parents (or harvest their login emails, which double as
 *    portal usernames).
 * Record-only staff (canLogin: false) are never listed — they cannot read chat.
 */
// The parent role id never changes at runtime: look it up once, not on every keystroke.
let parentRoleIdCache = null;
async function getParentRoleId() {
  if (!parentRoleIdCache) {
    const role = await Role.findOne({ name: "parent" }).select("_id").lean();
    parentRoleIdCache = role?._id || null;
  }
  return parentRoleIdCache;
}

exports.searchUsers = async (req, res) => {
  try {
    const myId = req.user._id;
    const q = String(req.query.q || "").trim().slice(0, 60);
    const limit = clampLimit(req.query.limit, 20, 30);
    const isParentViewer = roleNameOfUser(req.user) === "parent";
    const pattern = { $regex: escapeRegex(q), $options: "i" };

    const filter = {
      _id: { $ne: myId },
      isActive: true,
      canLogin: { $ne: false },
      $or: isParentViewer ? [{ name: pattern }] : [{ name: pattern }, { email: pattern }],
    };
    if (isParentViewer) {
      const parentRoleId = await getParentRoleId();
      if (parentRoleId) filter.role = { $ne: parentRoleId };
    }

    const users = await User.find(filter)
      .select(isParentViewer ? "name profileImage designation" : "name email profileImage designation")
      .limit(limit)
      .lean();

    // Attach presence
    const presences = await UserPresence.find({
      userId: { $in: users.map((u) => u._id) },
    }).lean();

    const presenceMap = {};
    presences.forEach((p) => { presenceMap[p.userId.toString()] = p.status; });

    const result = users.map((u) => ({
      ...u,
      profile_image: u.profileImage,
      onlineStatus: presenceMap[u._id.toString()] || "offline",
    }));

    res.json({ ok: true, users: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error" });
  }
};