const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const Announcement = require('../models/Announcement');
const rt = require('../services/realtime/academyRealtime');
const parentNotify = require('../services/parentNotifyService');

const create = catchAsync(async (req, res) => {
  const ann = await Announcement.create({ ...req.body, createdBy: req.user._id });
  rt.announcementCrud('created', ann._id);
  parentNotify.announcementPosted(ann);
  res.status(201).json({ success: true, data: ann });
});
//  latest Code
const list = catchAsync(async (req, res) => {
  const { audience, classId, sectionId } = req.query;
  const q = {};
  if (audience) q.targetAudience = audience;
  if (classId) q.targetClass = classId;
  if (sectionId) q.targetSection = sectionId;
  const rows = await Announcement.find(q)
    .populate('targetClass')
    .populate('targetSection')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: rows });
});

const remove = catchAsync(async (req, res) => {
  const ann = await Announcement.findByIdAndDelete(req.params.id);
  if (!ann) throw new ApiError(404, 'Announcement not found');
  rt.announcementCrud('deleted', req.params.id);
  res.json({ success: true, data: { deleted: true } });
});

module.exports = { create, list, remove };
