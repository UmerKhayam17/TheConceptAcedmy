/**
 * components/Message/MessageInput.jsx
 *
 * Mention format sent to backend:
 *   text     : "Hey Alice how are you"          ← clean text, @Name replaced with nothing extra
 *   mentions : [{ userId: "...", position: 4 }] ← char offset of the mention in clean text
 *
 * How it works:
 *   - User types "@" → MentionPicker opens
 *   - User picks a user → "@QueryText" is replaced with "@Name " in the textarea (display)
 *   - We track a parallel array of { userId, name, position } in mentionChipsRef
 *   - On send we strip all "@Name" tokens from the display text to get clean text,
 *     and recalculate each mention's position in that clean text
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Paperclip, Smile, Send, X, AtSign, Users } from "lucide-react";
import { useChatUi, useTyping, userIdStr } from "@/services/socket/chat.api";
import socketService from "@/services/socket/socket.service";
import api from "@/services/socket/chat.api";
import EmojiPicker from "./EmojiPicker";
import UserAvatar from "../Shared/UserAvatar";

/* ─────────────────────────────────────────────────────────────────────────────
   MentionPicker — unchanged from original
───────────────────────────────────────────────────────────────────────────── */
function MentionPicker({ isGroup, participants, myId, query, onSelect, onClose }) {
  const panelRef    = useRef(null);
  const [allUsers,   setAllUsers]   = useState([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const debounceRef = useRef(null);

  const participantIds = new Set(
    (participants || []).map((p) => String(p.userId?._id || p.userId))
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingAll(true);
      try {
        const res = await api.searchUsers(query || "");
        setAllUsers(res.users || []);
      } catch {
        setAllUsers([]);
      } finally {
        setLoadingAll(false);
      }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const groupParticipants = isGroup
    ? (participants || []).filter((p) => {
        const u   = p.userId;
        const uid = String(u?._id || u || "");
        if (!u || uid === String(myId)) return false;
        const name = u?.name || "";
        return !query || name.toLowerCase().includes(query.toLowerCase());
      })
    : [];

  const otherEmployees = allUsers.filter((u) => {
    if (String(u._id) === String(myId)) return false;
    if (isGroup && participantIds.has(String(u._id))) return false;
    return true;
  });

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const hasGroupSection = isGroup && groupParticipants.length > 0;
  const hasOtherSection = otherEmployees.length > 0;
  const hasResults      = hasGroupSection || hasOtherSection;

  if (!hasResults && !loadingAll) return null;

  const renderUserRow = (u, uid) => (
    <button
      key={uid}
      type="button"
      onClick={() => onSelect({ _id: uid, name: u?.name || "Unknown", profile_image: u?.profile_image })}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f0faf7] active:bg-[#e0f5ef] transition-colors"
      style={{ borderBottom: "1px solid #f5f5f5" }}
    >
      <UserAvatar name={u?.name || "?"} avatarUrl={u?.profile_image} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium truncate" style={{ color: "#111b21" }}>
          {u?.name || "Unknown"}
        </p>
        {(u?.designation || u?.email) && (
          <p className="text-[11.5px] truncate" style={{ color: "#8696a0" }}>
            {u?.designation || u?.email}
          </p>
        )}
      </div>
      <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#00a884" }}>@</span>
    </button>
  );

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 right-0 mb-1 z-30 rounded-xl shadow-2xl overflow-hidden"
      style={{ background: "#fff", border: "1px solid #e9edef", maxHeight: 280, overflowY: "auto" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 sticky top-0"
        style={{ background: "#f0faf7", borderBottom: "1px solid #e4f5ef", zIndex: 1 }}
      >
        <div className="flex items-center gap-1.5">
          <AtSign size={13} style={{ color: "#00a884" }} />
          <span className="text-[11.5px] font-semibold" style={{ color: "#00a884" }}>Mention someone</span>
          {query && <span className="text-[11px]" style={{ color: "#8696a0" }}>· "{query}"</span>}
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
          style={{ color: "#8696a0" }}
        >
          <X size={12} />
        </button>
      </div>

      {loadingAll && (
        <div className="py-4 text-center text-[12px]" style={{ color: "#8696a0" }}>Searching…</div>
      )}

      {!loadingAll && hasGroupSection && (
        <>
          <div
            className="flex items-center gap-1.5 px-4 py-1.5"
            style={{ background: "#f9fafb", borderBottom: "1px solid #f0f2f5" }}
          >
            <Users size={11} style={{ color: "#8696a0" }} />
            <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "#8696a0" }}>
              In this group
            </span>
          </div>
          {groupParticipants.map((p) => {
            const u   = p.userId;
            const uid = String(u?._id || u || "");
            return renderUserRow(u, uid);
          })}
        </>
      )}

      {!loadingAll && hasOtherSection && (
        <>
          {isGroup && (
            <div
              className="flex items-center gap-1.5 px-4 py-1.5"
              style={{ background: "#f9fafb", borderBottom: "1px solid #f0f2f5" }}
            >
              <AtSign size={11} style={{ color: "#8696a0" }} />
              <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "#8696a0" }}>
                All employees
              </span>
            </div>
          )}
          {otherEmployees.map((u) => renderUserRow(u, String(u._id)))}
        </>
      )}

      {!loadingAll && !hasResults && (
        <div className="py-5 text-center text-[12.5px]" style={{ color: "#8696a0" }}>No employees found</div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   buildPayload
   ─────────────────────────────────────────────────────────────────────────────
   Given the display text ("Hey @Alice how are you @Bob ok?") and the tracked
   mention chips [{ userId, name, displayStart }], produces:
     - cleanText : "Hey  how are you  ok?"  (chip tokens stripped)
     - mentions  : [{ userId, position }]   (position in cleanText)

   "displayStart" is where "@Name " begins in the displayText.
───────────────────────────────────────────────────────────────────────────── */
function buildPayload(displayText, chips) {
  if (!chips.length) return { cleanText: displayText, mentions: [] };

  // Sort chips by their start position in displayText (ascending)
  const sorted = [...chips].sort((a, b) => a.displayStart - b.displayStart);

  let cleanText = "";
  let lastEnd   = 0;     // cursor in displayText
  let offset    = 0;     // how many chars we've stripped so far
  const mentions = [];

  for (const chip of sorted) {
    const token    = `@${chip.name} `;  // the text we inserted, e.g. "@Alice "
    const chipStart = chip.displayStart;
    const chipEnd   = chipStart + token.length;

    // Append the text before this chip
    cleanText += displayText.slice(lastEnd, chipStart);

    // The position of this mention in the clean text = length of cleanText so far
    mentions.push({ userId: chip.userId, position: cleanText.length });

    lastEnd = chipEnd;
  }

  // Append remaining text after last chip
  cleanText += displayText.slice(lastEnd);

  return { cleanText: cleanText.trim(), mentions };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main MessageInput
───────────────────────────────────────────────────────────────────────────── */
export default function MessageInput({
  conversationId,
  conversation,
  replyTo,
  onCancelReply,
  canParticipate = true,
}) {
  const { myId } = useChatUi();

  // Display text — what the user sees in the textarea
  const [displayText,  setDisplayText]  = useState("");
  const [uploading,    setUploading]    = useState(false);
  const [uploadPct,    setUploadPct]    = useState(0);
  const [showEmoji,    setShowEmoji]    = useState(false);
  const [showMention,  setShowMention]  = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  /**
   * mentionChips: array of { userId, name, displayStart }
   *   userId       – ObjectId string
   *   name         – display name used in the textarea token
   *   displayStart – index of "@" in displayText when chip was inserted
   *
   * We update displayStart offsets whenever text before a chip changes.
   */
  const mentionChipsRef = useRef([]); // use ref to avoid stale closure in handlers
  const [, forceRender] = useState(0); // only used when we need to re-render after chip mutation

  const mentionAtIndexRef = useRef(-1); // where the "@" that opened MentionPicker lives

  const inputRef = useRef(null);
  const fileRef  = useRef(null);
  const { onInput, stop } = useTyping(conversationId);

  const isGroup      = conversation?.type === "group";
  const participants = conversation?.participants || [];

  // ── Reset on conversation change ───────────────────────────
  useEffect(() => {
    setDisplayText("");
    mentionChipsRef.current = [];
    setShowMention(false);
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [conversationId]);

  // ── Text change ────────────────────────────────────────────
  const handleTextChange = useCallback((e) => {
    const newText = e.target.value;
    const oldText = displayText;

    setDisplayText(newText);
    onInput();

    // Auto-resize
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

    // ── Update chip positions when text changes ──────────────
    // Find where text diverges between old and new
    let diffAt = 0;
    while (
      diffAt < oldText.length &&
      diffAt < newText.length &&
      oldText[diffAt] === newText[diffAt]
    ) diffAt++;

    const removedLen = oldText.length - diffAt - (oldText.length - Math.max(newText.length, oldText.length));
    const insertedLen = newText.length - oldText.length; // negative if deletion

    // Shift any chip whose displayStart is AFTER the edit point
    mentionChipsRef.current = mentionChipsRef.current
      .map((chip) => {
        if (chip.displayStart >= diffAt) {
          return { ...chip, displayStart: chip.displayStart + insertedLen };
        }
        return chip;
      })
      // Remove chips whose token was partially or fully deleted
      .filter((chip) => {
        const token    = `@${chip.name} `;
        const chipEnd  = chip.displayStart + token.length;
        // Keep if the chip's entire token still exists verbatim in newText
        return (
          chip.displayStart >= 0 &&
          newText.slice(chip.displayStart, chip.displayStart + token.length) === token
        );
      });

    // ── Detect @ trigger ─────────────────────────────────────
    const caret  = e.target.selectionStart ?? newText.length;
    const before = newText.slice(0, caret);
    const match  = before.match(/(^|[\s\n])@([^\s@]*)$/);

    if (match) {
      mentionAtIndexRef.current = before.lastIndexOf("@");
      setMentionQuery(match[2]);
      setShowMention(true);
    } else {
      setShowMention(false);
      setMentionQuery("");
      mentionAtIndexRef.current = -1;
    }
  }, [displayText, onInput]);

  // ── Select mention from picker ──────────────────────────────
  const handleSelectMention = useCallback((user) => {
    const atIdx = mentionAtIndexRef.current;
    if (atIdx === -1 || !user?._id) return;

    const caret  = inputRef.current?.selectionStart ?? displayText.length;
    const before = displayText.slice(0, atIdx);
    const after  = displayText.slice(caret);

    const token       = `@${user.name} `;
    const newDisplay  = before + token + after;

    // Record chip with its position in the display string
    mentionChipsRef.current = [
      ...mentionChipsRef.current,
      { userId: String(user._id), name: user.name, displayStart: atIdx },
    ];

    setDisplayText(newDisplay);
    setShowMention(false);
    setMentionQuery("");
    mentionAtIndexRef.current = -1;

    setTimeout(() => {
      if (inputRef.current) {
        const pos = before.length + token.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(pos, pos);
        inputRef.current.style.height = "auto";
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
      }
    }, 0);
  }, [displayText]);

  // ── Send ────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmedDisplay = displayText.trim();
    if (!trimmedDisplay && !replyTo) return;

    const { cleanText, mentions } = buildPayload(trimmedDisplay, mentionChipsRef.current);

    socketService.sendMessage({
      conversationId,
      type: "text",
      text: cleanText,         // clean text — no @id tokens
      mentions,                // [{ userId, position }]
      replyToMessageId: replyTo?._id,
    });

    setDisplayText("");
    mentionChipsRef.current = [];
    setShowMention(false);
    onCancelReply?.();
    stop();

    if (inputRef.current) inputRef.current.style.height = "auto";
    inputRef.current?.focus();
  }, [displayText, replyTo, conversationId, stop, onCancelReply]);

  const handleKeyDown = (e) => {
    if (showMention && e.key === "Escape") {
      e.preventDefault();
      setShowMention(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── File upload ─────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setUploadPct(0);
    try {
      const res = await api.uploadFile(file, conversationId, setUploadPct);
      const { url, name, size, mimeType, type } = res.file;
      socketService.sendMessage({
        conversationId,
        type,
        file: { url, name, size, mimeType },
        replyToMessageId: replyTo?._id,
      });
      onCancelReply?.();
    } catch (err) {
      console.error("Upload failed", err);
      alert(err instanceof Error ? err.message : "File upload failed");
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const addEmoji = (emoji) => {
    setDisplayText((t) => t + emoji);
    inputRef.current?.focus();
  };

  const onlyAdmins  = conversation?.settings?.onlyAdminsCanSend;
  const myRole      = conversation?.participants?.find(
    (p) => userIdStr(p.userId) === userIdStr(myId)
  )?.role;
  const canSend         = canParticipate && (!onlyAdmins || myRole === "admin");
  const canDocumentSend = conversation?.settings?.allowFileSharing !== false;

  if (!canParticipate) {
    return (
      <div
        className="flex items-center justify-center px-4 py-3.5 text-[13px] text-[#8696a0]"
        style={{ background: "#f0f2f5", borderTop: "1px solid #e9edef" }}
      >
        View-only — you cannot send messages
      </div>
    );
  }

  if (!canSend) {
    return (
      <div
        className="flex items-center justify-center px-4 py-3.5 text-[13px] text-[#8696a0]"
        style={{ background: "#f0f2f5", borderTop: "1px solid #e9edef" }}
      >
        Only admins can send messages in this group
      </div>
    );
  }

  const hasText = displayText.trim().length > 0;

  return (
    <div
      className="flex-shrink-0 relative"
      style={{ background: "#f0f2f5", borderTop: "1px solid #e9edef", padding: "6px 8px" }}
    >
      {uploading && (
        <div className="mb-2 px-1">
          <div className="h-[3px] bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00a884] transition-all duration-300 rounded-full"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
          <p className="text-[11px] text-[#8696a0] mt-0.5">Uploading… {uploadPct}%</p>
        </div>
      )}

      {replyTo && (
        <div
          className="flex items-start justify-between rounded-[7px] px-3 py-2 mb-1.5"
          style={{ background: "#fff", borderLeft: "4px solid #00a884" }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-[#06cf9c] truncate leading-snug">
              {replyTo.senderId?.name || "You"}
            </p>
            <p className="text-[12.5px] text-[#8696a0] truncate leading-snug max-w-xs">
              {replyTo.text || `📎 ${replyTo.type}`}
            </p>
          </div>
          <button
            onClick={() => onCancelReply?.()}
            className="text-[#8696a0] hover:text-[#3b4a54] ml-2 mt-0.5 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showMention && (
        <MentionPicker
          isGroup={isGroup}
          participants={participants}
          myId={myId}
          query={mentionQuery}
          onSelect={handleSelectMention}
          onClose={() => setShowMention(false)}
        />
      )}

      <div className="flex items-end gap-2">
        <div
          className="flex items-end flex-1 rounded-[26px] overflow-hidden"
          style={{ background: "#fff", minHeight: 42, boxShadow: "0 1px 1px rgba(0,0,0,0.06)" }}
        >
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowEmoji((p) => !p)}
              className="flex items-center justify-center w-11 h-11 text-[#8696a0] hover:text-[#3b4a54] transition-colors"
            >
              <Smile size={22} />
            </button>
          </div>
          {showEmoji && (
            <div className="absolute bottom-12 left-0 z-20">
              <EmojiPicker onSelect={addEmoji} onClose={() => setShowEmoji(false)} />
            </div>
          )}

          <textarea
            ref={inputRef}
            rows={1}
            value={displayText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message"
            className="flex-1 text-[14.5px] text-[#3b4a54] placeholder-[#8696a0] outline-none resize-none bg-transparent leading-[1.45] py-[10px] pr-1"
            style={{ maxHeight: 120, fontFamily: "inherit" }}
          />

          {canDocumentSend && (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center w-11 h-11 text-[#8696a0] hover:text-[#3b4a54] transition-colors flex-shrink-0"
              title="Attach"
            >
              <Paperclip size={22} />
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept=".doc,.docx,.rtf,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.svg,.heif,.heic,.pdf,.txt,.mp4,.mp3,.ogg,.wav"
          />
        </div>

        <button
          onClick={hasText ? handleSend : undefined}
          disabled={!hasText}
          className={`flex items-center justify-center rounded-full flex-shrink-0 transition-all duration-200 ease-out
            ${hasText
              ? "bg-[#00a884] hover:bg-[#029e7a] active:scale-95 shadow-md cursor-pointer"
              : "bg-[#00a884]/40 cursor-not-allowed"
            }`}
          style={{ width: 42, height: 42 }}
        >
          <Send
            size={18}
            className={`transition-transform duration-150 ${hasText ? "translate-x-[1px]" : "opacity-60"}`}
          />
        </button>
      </div>
    </div>
  );
}