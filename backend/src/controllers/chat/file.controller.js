/**
 * controllers/file.controller.js
 * Handles chat file uploads (local storage; swap storageProvider for S3/MinIO).
 */

const path    = require("path");
const fs      = require("fs");
const FileDoc = require("../../models/chat/file.chat.model");


// ── Upload handler ────────────────────────────────────────────────────────────
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No file" });
    }

    const userId = req.user._id;
    const { conversationId } = req.body;

    // Server-decided type (from the allow-list), not the client's Content-Type.
    const mime = req.file.safeType?.mime || "application/octet-stream";
const isImage = mime.startsWith("image/");
    const isVideo = mime.startsWith("video/");
    const isAudio = mime.startsWith("audio/");
    
    const url = `/uploads/chat/${req.file.filename}`;

    const fileDoc = await FileDoc.create({
      uploadedBy: userId,
      url,
      name: req.file.originalname,
      size: req.file.size,
      mimeType: mime,
      storageKey: req.file.filename,
      storageProvider: "local",
      conversationId: conversationId || undefined,
    });

    res.json({
      ok: true,
      file: {
        _id:      fileDoc._id,
        url:      fileDoc.url,
        name:     fileDoc.name,
        size:     fileDoc.size,
        mimeType: fileDoc.mimeType,
        type:     isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : "file",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Upload failed" });
  }
};