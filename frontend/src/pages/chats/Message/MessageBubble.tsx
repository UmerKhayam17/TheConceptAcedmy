/**
 * components/Message/MessageBubble.jsx
 *
 * @mention rendering (position-based):
 *  - msg.text  : clean text, no @id tokens  e.g. "Hey  how are you"
 *  - msg.mentions : [{ userId: { _id, name, profile_image }, position: Number }]
 *    (backend populates userId on fetch/send)
 *  - renderMentionText() slices text at each position, inserts a blue clickable
 *    @Name chip, then continues with remaining text
 *  - Clicking a chip calls onMentionClick(userId) → opens DM
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatUi, updateMessageInCache, removeMessageFromCache } from "@/services/socket/chat.api";
import { format } from "date-fns";
import {
  Check, CheckCheck, ChevronDown,
  Reply, Forward, Pencil, Trash2, Pin, Copy, Smile,
} from "lucide-react";
import UserAvatar from "../Shared/UserAvatar";
import ReactionBar from "./ReactionBar";
import ReactionPicker from "./ReactionPicker";
import socketService from "@/services/socket/socket.service";
import FileMessageContent from "./FileMessageContent";
import api from "@/services/socket/chat.api";
import ContextMenu from "../context/ContextMenu";

/* ─────────────────────────────────────────────────────────────────────────────
   renderMentionText  (position-based)

   text     : "Hey Alice how are you Bob done"
   mentions : [
     { userId: { _id: "...", name: "Alice" }, position: 4  },
     { userId: { _id: "...", name: "Bob"   }, position: 20 },
   ]

   Produces: ["Hey ", <chip>@Alice</chip>, " how are you ", <chip>@Bob</chip>, " done"]
───────────────────────────────────────────────────────────────────────────── */
function renderMentionText(text, mentions, onMentionClick) {
  if (!text) return null;
  if (!mentions?.length) return text;

  // Sort by position ascending and filter valid entries
  const sorted = [...mentions]
    .filter((m) => m?.position >= 0 && (m.userId?._id || m.userId))
    .sort((a, b) => a.position - b.position);

  if (!sorted.length) return text;

  const parts = [];
  let cursor = 0;

  for (const mention of sorted) {
    const pos = mention.position;
    const user = mention.userId;               // populated object or bare id
    const userId = user?._id || String(user);
    const name = user?.name || String(userId).slice(-6);

    // Safety: skip if position is out of range
    if (pos > text.length) continue;

    // Text before this mention
    if (pos > cursor) {
      parts.push(text.slice(cursor, pos));
    }

    // The @Name chip
    parts.push(
      <button
        key={`${userId}-${pos}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMentionClick?.(userId);
        }}
        className="inline-flex items-center rounded px-[3px] py-[0px] font-semibold hover:underline transition-colors"
        style={{
          color: "#027eb5",
          background: "rgba(2, 126, 181, 0.08)",
          cursor: "pointer",
          fontSize: "inherit",
          lineHeight: "inherit",
          verticalAlign: "baseline",
        }}
      >
        @{name}
      </button>
    );

    cursor = pos;  // chip sits AT position — text continues from pos (not offset by name length)
  }

  // Remaining text after last mention
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

/* ─────────────────────────────────────────────────────────────────────────────
   buildCleanCopyText
   For clipboard: reconstructs "Hey @Alice how are you @Bob done"
───────────────────────────────────────────────────────────────────────────── */
function buildCleanCopyText(text, mentions) {
  if (!text) return "";
  if (!mentions?.length) return text;

  const sorted = [...mentions]
    .filter((m) => m?.position >= 0 && (m.userId?._id || m.userId))
    .sort((a, b) => a.position - b.position);

  let result = "";
  let cursor = 0;

  for (const mention of sorted) {
    const pos = mention.position;
    const name = mention.userId?.name || String(mention.userId?._id || mention.userId).slice(-6);
    if (pos > text.length) continue;
    result += text.slice(cursor, pos) + `@${name}`;
    cursor = pos;
  }
  result += text.slice(cursor);
  return result;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tick
───────────────────────────────────────────────────────────────────────────── */
function MessageTick({ status, isFile }) {
  const baseClass = isFile ? "text-white/80" : "";
  if (status === "read") {
    return <CheckCheck size={14} className={isFile ? "text-white" : ""} style={!isFile ? { color: "#53bdeb" } : {}} />;
  }
  if (status === "delivered") {
    return <CheckCheck size={14} className={baseClass} style={!isFile ? { color: "#8696a0" } : {}} />;
  }
  return <Check size={14} className={baseClass} style={!isFile ? { color: "#8696a0" } : {}} />;
}

/* ─────────────────────────────────────────────────────────────────────────────
   FloatingReactionPicker
───────────────────────────────────────────────────────────────────────────── */
function FloatingReactionPicker({ anchorRef, isOwn, onSelect, onClose }) {
  const wrapRef = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden" });

  useEffect(() => {
    if (!anchorRef.current || !wrapRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const wrap = wrapRef.current.getBoundingClientRect();
    const vw = window.innerWidth;

    let top = anchor.top - wrap.height - 6;
    if (top < 8) top = anchor.bottom + 6;

    let left = anchor.left + anchor.width / 2 - wrap.width / 2;
    if (left + wrap.width > vw - 8) left = vw - wrap.width - 8;
    if (left < 8) left = 8;

    setStyle({ top, left, visibility: "visible" });
  }, [anchorRef, isOwn]);

  useEffect(() => {
    const handler = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)
      ) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  return (
    <div ref={wrapRef} style={{ position: "fixed", zIndex: 99998, ...style }}>
      <ReactionPicker onSelect={onSelect} onClose={onClose} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   canEditMessage
───────────────────────────────────────────────────────────────────────────── */
function checkCanEdit(conversationSetting, createdAt) {
  if (conversationSetting?.allowEditing === false) return false;
  const limitMinutes = conversationSetting?.editTimeLimit ?? 0;
  if (!limitMinutes) return true;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs / 60000 <= limitMinutes;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main MessageBubble

   Props:
     message             – message object  (mentions[] populated by backend)
     isOwn               – boolean
     conversationSetting – conv.settings object
     showAvatar          – boolean
     conversationId      – string
     onReply             – (msg) => void
     onForward           – (msg) => void
     onJumpToMessage     – (messageId) => void
     onMentionClick      – (userId) => void  → opens DM with that user
───────────────────────────────────────────────────────────────────────────── */
export default function MessageBubble({
  message: msg,
  isOwn,
  conversationSetting,
  showAvatar,
  conversationId,
  onReply,
  onForward,
  onJumpToMessage,
  onMentionClick,
  pinnedMessages,
}) {
  const qc = useQueryClient();
  const { myId } = useChatUi();

  const [showMenu, setShowMenu] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text || "");

  const chevronRef = useRef(null);
  const emojiRef = useRef(null);

  const closeMenu = useCallback(() => setShowMenu(false), []);
  const closePicker = useCallback(() => setShowPicker(false), []);

  const editAllowed = isOwn && msg.type === "text" && checkCanEdit(conversationSetting, msg.createdAt);
  const isPinned = pinnedMessages?.some(
    (p) => p.messageId?._id === msg._id
  );
  // ── Deleted ──────────────────────────────────────────────
  if (msg.deletedForEveryone) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-0.5 px-2`}>
        <span className="text-[12.5px] italic text-[#8696a0] bg-white rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-1.5">
          🚫 This message was deleted
        </span>
      </div>
    );
  }

  // ── System ───────────────────────────────────────────────
  if (msg.type === "system") {
    return (
      <div className="flex justify-center my-1.5 px-2">
        <span className="text-[12px] text-[#54656f] bg-[#fffbd5] rounded-lg px-4 py-1.5 shadow-sm max-w-[80%] text-center leading-snug">
          {msg.text}
        </span>
      </div>
    );
  }

  // ── Handlers ─────────────────────────────────────────────
  const handleReact = (emoji) => {
    socketService.toggleReaction(
      { messageId: msg._id, conversationId, emoji },
      (res) => {
        if (!res?.ok) {
          updateMessageInCache(qc, conversationId, msg._id, { reactions: msg.reactions || [] });
        }
      }
    );
    setShowPicker(false);
  };

  const handleEdit = () => {
    if (!editText.trim() || editText === msg.text) { setIsEditing(false); return; }
    socketService.editMessage(
      { messageId: msg._id, newText: editText.trim(), conversationId },
      (res) => {
        if (res?.ok) updateMessageInCache(qc, conversationId, msg._id, { text: editText.trim(), isEdited: true });
      }
    );
    setIsEditing(false);
    setShowMenu(false);
  };

  const handleDelete = (deleteFor) => {
    socketService.deleteMessage(
      { messageId: msg._id, deleteFor, conversationId },
      (res) => {
        if (res?.ok) {
          if (deleteFor === "everyone") {
            updateMessageInCache(qc, conversationId, msg._id, { deletedForEveryone: true });
          } else {
            removeMessageFromCache(qc, conversationId, msg._id);
          }
        }
      }
    );
    setShowMenu(false);
  };

  const handlePin = async () => {
    try { await api.pinMessage(conversationId, msg._id); }
    catch (err) { console.error("Pin failed", err); }
    finally { setShowMenu(false); }
  };

  const handleCopy = async () => {
    const copyText = buildCleanCopyText(msg.text, msg.mentions);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = copyText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    } catch (err) { console.error("Copy failed:", err); }
    setShowMenu(false);
  };

  const handleReplyPreviewClick = () => {
    const targetId = msg.replyToMessageId;
    if (!targetId) return;
    onJumpToMessage?.(String(targetId));
  };

  const handleForwardedClick = () => {
    const targetId = msg.originalMessageId || msg.forwardedFrom?.messageId;
    if (!targetId) return;
    onJumpToMessage?.(String(targetId));
  };

  const time = format(new Date(msg.createdAt), "hh:mm a");
  const reactions = msg.reactions || [];
  const hasFile = ["file", "image", "video", "audio"].includes(msg.type);

  // Render text with @Name chips at correct positions
  const mentionNodes = renderMentionText(msg.text, msg.mentions, onMentionClick);

  return (
    <div
      className={`flex items-end gap-1 px-2 py-[1px] group ${isOwn ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      {!isOwn && (
        <div className="flex-shrink-0 self-start mb-1" style={{ width: 28 }}>
          {showAvatar ? (
            <UserAvatar name={msg.senderId?.name || "?"} avatarUrl={msg.senderId?.profile_image} size={28} />
          ) : null}
        </div>
      )}

      {/* Bubble */}
      <div
        className={`relative max-w-[65%] min-w-[80px] rounded-[8px] px-[9px] pt-[6px] pb-[20px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${isOwn ? "rounded-tr-[3px]" : "rounded-tl-[3px]"
          }`}
        style={{ background: isOwn ? "#d9fdd3" : "#ffffff" }}
      >
        {/* Sender name */}
        {!isOwn && showAvatar && msg.senderId?.name && (
          <p className="text-[12.5px] font-semibold mb-0.5 truncate" style={{ color: "#027eb5" }}>
            {msg.senderId.name}
          </p>
        )}

        {/* Chevron */}
        <button
          ref={chevronRef}
          onClick={(e) => { e.stopPropagation(); setShowMenu((p) => !p); }}
          className={`
            absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity
            w-5 h-5 flex items-center justify-center rounded-full
            ${isOwn ? "left-1" : "right-1"} text-[#8696a0]
          `}
          style={{ background: isOwn ? "rgba(217,253,211,0.92)" : "rgba(255,255,255,0.92)", zIndex: 10 }}
        >
          <ChevronDown size={14} />
        </button>
{isPinned && (
  <div className="absolute top-1 right-2 text-[#8696a0]">
    <Pin size={14} />
  </div>
)}
        {showMenu && (
          <ContextMenu anchorRef={chevronRef} isOwn={isOwn} onClose={closeMenu}>
            {conversationSetting?.allowReplies && (
              <MenuItem icon={Reply} label="Reply" onClick={() => { onReply?.(msg); closeMenu(); }} />
            )}
            {conversationSetting?.allowForwarding && (
              <MenuItem icon={Forward} label="Forward" onClick={() => { onForward?.(msg); closeMenu(); }} />
            )}
            {msg.text && <MenuItem icon={Copy} label="Copy" onClick={handleCopy} />}
            {editAllowed && (
              <MenuItem icon={Pencil} label="Edit message" onClick={() => { setIsEditing(true); closeMenu(); }} />
            )}
            <MenuItem icon={Pin} label={isPinned ? "Unpin message" : "Pin message"} onClick={handlePin} />
            {isOwn && (
              <>
                <div className="h-px bg-gray-100 my-1 mx-2" />
                <MenuItem icon={Trash2} label="Delete for me" color="text-red-500" onClick={() => handleDelete("me")} />
                <MenuItem icon={Trash2} label="Delete for everyone" color="text-red-500" onClick={() => handleDelete("everyone")} />
              </>
            )}
          </ContextMenu>
        )}

        {/* Forwarded badge */}
        {msg.isForwarded && (
          <button
            type="button"
            onClick={handleForwardedClick}
            className={`flex items-center gap-1 text-[11.5px] text-[#8696a0] mb-1 hover:text-[#075e54] cursor-pointer ${hasFile ? "mx-2 mt-1" : ""}`}
          >
            <Forward size={11} />
            <span className="italic">Forwarded</span>
          </button>
        )}

        {/* Reply preview */}
        {msg.replyToPreview && (
          <button
            type="button"
            onClick={handleReplyPreviewClick}
            className={`
              w-full text-left rounded-[5px] px-2.5 py-1.5 mb-1.5
              border-l-[3px] border-[#06cf9c]
              bg-black/[0.05] hover:bg-black/[0.09]
              transition-colors cursor-pointer block overflow-hidden
              ${hasFile ? "mx-1 mt-1 w-[calc(100%-8px)]" : ""}
            `}
          >
            <p className="text-[12px] font-semibold text-[#06cf9c] truncate leading-snug">
              {msg.replyToPreview.senderId?.name || "Someone"}
            </p>
            <p
              className="text-[12.5px] text-[#3b4a54] leading-snug break-words"
              style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {msg.replyToPreview.text || `📎 ${msg.replyToPreview.type}`}
            </p>
          </button>
        )}

        {/* Content */}
        <div className="relative">
          {/* Reaction emoji button */}
          {conversationSetting?.allowReactions && (
            <>
              <button
                ref={emojiRef}
                onClick={() => setShowPicker(true)}
                className={`
                  absolute top-1/2 -translate-y-1/2
                  opacity-0 group-hover:opacity-100 transition-opacity
                  w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10
                  ${isOwn ? "-left-8" : "-right-8"}
                `}
                style={{ zIndex: 10 }}
              >
                <Smile size={17} className="text-[#8696a0]" />
              </button>
              {showPicker && (
                <FloatingReactionPicker
                  anchorRef={emojiRef}
                  isOwn={isOwn}
                  onSelect={(emoji) => { handleReact(emoji); closePicker(); }}
                  onClose={closePicker}
                />
              )}
            </>
          )}

          {/* Message body */}
          {isEditing ? (
            <div className="flex gap-2 items-center px-1 py-0.5 w-full">
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEdit();
                  if (e.key === "Escape") setIsEditing(false);
                }}
                className="text-[14.2px] outline-none bg-transparent border-b border-[#25d366] min-w-0 flex-1 py-0.5"
              />
              <button onClick={handleEdit} className="text-xs text-[#25d366] font-semibold whitespace-nowrap shrink-0">Save</button>
              <button onClick={() => setIsEditing(false)} className="text-xs text-[#8696a0] whitespace-nowrap shrink-0">Cancel</button>
            </div>
          ) : hasFile ? (
            <div>
              <FileMessageContent message={msg} />
              {msg.text && (
                <p className="text-[14.2px] text-[#111b21] whitespace-pre-wrap break-words leading-[1.45] px-[6px] pb-[2px] mt-1">
                  {mentionNodes}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[14.2px] text-[#111b21] whitespace-pre-wrap break-words leading-[1.45]">
              {mentionNodes}
              <span className="inline-block" style={{ width: isOwn ? 60 : 38 }} aria-hidden="true" />
            </p>
          )}
        </div>

        {/* Time + ticks */}
        <div
          className={`
            flex items-center gap-[3px] select-none pointer-events-none
            ${hasFile
              ? "absolute bottom-[5px] right-[7px] bg-black/40 text-white rounded-full px-1.5 py-0.5"
              : "absolute bottom-[4px] right-[8px]"
            }
          `}
        >
          {msg.isEdited && (
            <span className={`text-[11px] italic ${hasFile ? "text-white/80" : "text-[#8696a0]"}`}>edited</span>
          )}
          <span className={`text-[11px] tabular-nums ${hasFile ? "text-white/90" : "text-[#8696a0]"}`}>
            {time}
          </span>
          {isOwn && <MessageTick status={msg.status} isFile={hasFile} />}
        </div>
      </div>

      {/* Reactions */}
      {reactions.length > 0 && (
        <div className={`self-end mb-1 ${isOwn ? "mr-2" : "ml-2"}`}>
          <ReactionBar reactions={reactions} myId={myId} onToggle={handleReact} />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MenuItem
───────────────────────────────────────────────────────────────────────────── */
function MenuItem({ icon: Icon, label, onClick, color = "text-[#3b4a54]" }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-[10px] text-[13.5px] hover:bg-[#f5f6f6] active:bg-[#edf0f0] transition-colors ${color}`}
    >
      <Icon size={15} className="opacity-70 shrink-0" />
      <span>{label}</span>
    </button>
  );
}