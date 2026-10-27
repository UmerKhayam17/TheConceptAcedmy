/**
 * components/Chat/ChatHeader.jsx
 *
 * MODIFICATIONS (points #2 & #3):
 *  - When a search result is found on the backend but the message is not yet
 *    loaded in the frontend Redux store, we iteratively call `onLoadMore` /
 *    dispatch fetchMessages with a `before` cursor until the message ID
 *    appears in the messages bucket or we exhaust pagination (hasMore = false).
 *    Only then do we call onJumpToMessage.
 *  - Pinned message bar uses the same smart-load helper via the exported
 *    `useSmartJump` hook, consumed in PinnedMessageBar (see note below).
 *
 * The `onJumpToMessage` prop signature stays the same.
 * A new `onSmartJump` prop is added — it receives (messageId) and handles
 * the load-until-found logic. ChatWindow passes both down.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MoreVertical, Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import UserAvatar from "../Shared/UserAvatar";
import ConversationInfoDrawer from "../Conversation/ConversationInfoDrawer";
import api, { useChatUi, userIdStr } from "@/services/socket/chat.api";

/* ─────────────────────────────────────────────────────────────────────────────
   MessageSearchPanel
───────────────────────────────────────────────────────────────────────────── */
function MessageSearchPanel({ conversationId, onSmartJump, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(
    async (q) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await api.searchMessages(conversationId, q);
        const msgs = res.messages || [];
        setResults(msgs);
        setCurrentIdx(0);
        if (msgs.length > 0) {
          setJumping(true);
          await onSmartJump(msgs[0]._id);
          setJumping(false);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, onSmartJump]
  );

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 350);
  };

  const navigate = async (dir) => {
    if (results.length === 0) return;
    const nextIdx =
      dir === "up"
        ? (currentIdx - 1 + results.length) % results.length
        : (currentIdx + 1) % results.length;
    setCurrentIdx(nextIdx);
    setJumping(true);
    await onSmartJump(results[nextIdx]._id);
    setJumping(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") navigate("down");
    if (e.key === "Escape") onClose();
  };

  const isBusy = loading || jumping;

  return (
    <div
      className="flex items-center gap-2 px-3 flex-1"
      style={{ animation: "waFadeIn 0.15s ease-out" }}
    >
      <div
        className="flex items-center flex-1 rounded-lg px-3 gap-2"
        style={{ background: "#fff", height: 36, border: "1px solid #e9edef" }}
      >
        {isBusy ? (
          <Loader2 size={15} className="animate-spin flex-shrink-0" style={{ color: "#8696a0" }} />
        ) : (
          <Search size={15} style={{ color: "#8696a0", flexShrink: 0 }} />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search messages…"
          className="flex-1 bg-transparent text-[13.5px] outline-none"
          style={{ color: "#3b4a54" }}
        />
        {query && (
          <span className="text-[11px] flex-shrink-0" style={{ color: "#8696a0" }}>
            {results.length > 0 ? `${currentIdx + 1}/${results.length}` : "0"}
          </span>
        )}
      </div>

      <button
        onClick={() => navigate("up")}
        disabled={results.length === 0 || isBusy}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/[0.06] disabled:opacity-30 transition-colors"
        style={{ color: "#54656f" }}
      >
        <ChevronUp size={18} />
      </button>
      <button
        onClick={() => navigate("down")}
        disabled={results.length === 0 || isBusy}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/[0.06] disabled:opacity-30 transition-colors"
        style={{ color: "#54656f" }}
      >
        <ChevronDown size={18} />
      </button>
      <button
        onClick={onClose}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/[0.06] transition-colors"
        style={{ color: "#54656f" }}
      >
        <X size={18} />
      </button>

      <style>{`
        @keyframes waFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ChatHeader
───────────────────────────────────────────────────────────────────────────── */
export default function ChatHeader({ conversation: conv, onJumpToMessage, onSmartJump }) {
  const { myId, presenceMap, typingMap } = useChatUi();
  const [showInfo,   setShowInfo]   = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  if (!conv) return null;

  const isDirect    = conv.type === "direct";
  const other       = isDirect
    ? conv.participants?.find((p) => userIdStr(p.userId) !== userIdStr(myId))
    : null;

  const displayName  = isDirect ? (other?.userId?.name || "Unknown") : (conv.title || "Group");
  const avatarUrl    = isDirect
    ? other?.userId?.profile_image || other?.userId?.profileImage
    : conv.avatar;
  const onlineStatus = isDirect
    ? presenceMap[String(other?.userId?._id || other?.userId)]?.status || other?.userId?.onlineStatus || "offline"
    : null;

  const lastSeen  = presenceMap[String(other?.userId?._id || other?.userId)]?.lastSeenAt;
  const typingArr = typingMap[conv._id] || [];

  const subtitle =
    typingArr.length > 0
      ? `${typingArr.map((t) => t.name).join(", ")} typing…`
      : isDirect
      ? onlineStatus === "online"
        ? "online"
        : lastSeen
        ? `last seen today at ${new Date(lastSeen).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}`
        : "offline"
      : `${conv.participants?.length || 0} members`;

  return (
    <>
      <div
        className="flex items-center px-3 py-[10px] flex-shrink-0"
        style={{
          background: "#f0f2f5",
          borderBottom: "1px solid #e9edef",
          height: 59,
        }}
      >
        {showSearch ? (
          <MessageSearchPanel
            conversationId={conv._id}
            onSmartJump={onSmartJump || onJumpToMessage}
            onClose={() => setShowSearch(false)}
          />
        ) : (
          <>
            {/* Left: avatar + info — clickable */}
            <button
              onClick={() => setShowInfo(true)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg py-0.5 px-1 -mx-1 transition-colors"
            >
              <div className="relative flex-shrink-0">
                <UserAvatar
                  name={displayName}
                  avatarUrl={avatarUrl}
                  size={40}
                  isGroup={!isDirect}
                />
                {isDirect && onlineStatus === "online" && (
                  <span
                    className="absolute bottom-0 right-0 rounded-full border-2 border-[#f0f2f5]"
                    style={{ width: 10, height: 10, background: "#25d366" }}
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="text-[15px] font-semibold truncate leading-tight"
                  style={{ color: "#111b21" }}
                >
                  {displayName}
                </p>
                <p
                  className={`text-[12.5px] truncate leading-tight ${
                    typingArr.length ? "text-[#00a884]" : "text-[#8696a0]"
                  }`}
                >
                  {subtitle}
                </p>
              </div>
            </button>

            {/* Right: action buttons */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => setShowSearch(true)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/[0.06] transition-colors text-[#54656f]"
                title="Search messages"
              >
                <Search size={20} />
              </button>
              <button
                onClick={() => setShowInfo(true)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/[0.06] transition-colors text-[#54656f]"
                title="More options"
              >
                <MoreVertical size={20} />
              </button>
            </div>
          </>
        )}
      </div>

      {showInfo && (
        <ConversationInfoDrawer
          conversation={conv}
          onClose={() => setShowInfo(false)}
        />
      )}
    </>
  );
}