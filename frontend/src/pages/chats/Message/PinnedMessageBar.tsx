/**
 * components/Message/PinnedMessageBar.jsx
 * WhatsApp-exact pinned message bar
 */

import React, { useState } from "react";
import { Pin, X, ChevronRight, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { chatMediaUrl } from "../chatMediaUrl";

function AllPinnedPanel({ pinnedMessages, onClose, onJump }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md bg-white sm:rounded-xl shadow-2xl overflow-hidden"
        style={{ animation: "waSlideUp 0.22s ease-out" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3.5 text-white"
          style={{ background: "#075e54" }}
        >
          <div className="flex items-center gap-2">
            <Pin size={15} style={{ color: "#06cf9c" }} />
            <h3 className="font-semibold text-[14.5px]">
              {pinnedMessages.length} Pinned Message{pinnedMessages.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
          {[...pinnedMessages].reverse().map((pin, i) => {
            const msg = pin.messageId;
            const isDeleted = msg?.deletedForEveryone;
            const preview = isDeleted ? "This message was deleted"
              : msg?.type === "image" ? "📷 Photo"
              : msg?.type === "video" ? "🎬 Video"
              : msg?.type === "audio" ? "🎵 Audio"
              : msg?.type === "file"  ? `📎 ${msg?.file?.name || "File"}`
              : msg?.text || "[Message]";

            return (
              <button
                key={pin._id}
                onClick={() => { onJump(msg?._id); onClose(); }}
                className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left group"
              >
                <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(7,94,84,0.10)" }}>
                  <Pin size={13} style={{ color: "#075e54" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#075e54" }}>
                      Pinned message #{pinnedMessages.length - i}
                    </span>
                    <span className="text-[10.5px]" style={{ color: "#8696a0" }}>
                      {pin.pinnedAt ? format(new Date(pin.pinnedAt), "MMM d, hh:mm a") : ""}
                    </span>
                  </div>
                  {msg?.type === "image" && msg?.file?.url && (
                    <div className="flex items-center gap-2">
                      <img src={chatMediaUrl(msg.file.url)} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      <p className="text-[13px] italic" style={{ color: "#8696a0" }}>Photo</p>
                    </div>
                  )}
                  {msg?.type !== "image" && (
                    <p className={`text-[13px] truncate ${isDeleted ? "italic" : ""}`} style={{ color: isDeleted ? "#8696a0" : "#3b4a54" }}>
                      {preview}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="flex-shrink-0 mt-1 opacity-30 group-hover:opacity-70 transition-opacity" />
              </button>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes waSlideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function PinnedMessageBar({ pinnedMessages, onJumpToMessage }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAll,    setShowAll]    = useState(false);

  if (!pinnedMessages || pinnedMessages.length === 0) return null;

  const displayed = pinnedMessages[currentIdx] || pinnedMessages[pinnedMessages.length - 1];
  const msg = displayed?.messageId;

  const preview = msg?.deletedForEveryone ? "This message was deleted"
    : msg?.type === "image" ? "📷 Photo"
    : msg?.type === "video" ? "🎬 Video"
    : msg?.type === "audio" ? "🎵 Audio"
    : msg?.type === "file"  ? `📎 ${msg?.file?.name || "File"}`
    : msg?.text || "[Message]";

  const handleBarClick = () => {
    if (msg?._id) onJumpToMessage?.(msg._id);
    setCurrentIdx((prev) => (prev + 1) % pinnedMessages.length);
  };

  return (
    <>
      <div
        className="flex items-stretch flex-shrink-0 overflow-hidden"
        style={{ background: "#fff", borderBottom: "1px solid #e9edef" }}
      >
        {/* Left accent + icon */}
        <div
          className="flex items-center justify-center w-10 flex-shrink-0"
          style={{ borderRight: "1px solid #f0f2f5", background: "rgba(7,94,84,0.04)" }}
        >
          <Pin size={14} style={{ color: "#075e54" }} />
        </div>

        {/* Main content */}
        <button
          onClick={handleBarClick}
          className="flex-1 flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors min-w-0"
        >
          {msg?.type === "image" && msg?.file?.url && (
            <img src={chatMediaUrl(msg.file.url)} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold leading-snug" style={{ color: "#075e54" }}>
              Pinned Message
              {pinnedMessages.length > 1 && (
                <span className="ml-1 font-normal" style={{ color: "#8696a0" }}>
                  {currentIdx + 1}/{pinnedMessages.length}
                </span>
              )}
            </p>
            <p className="text-[12.5px] truncate" style={{ color: "#8696a0" }}>{preview}</p>
          </div>
        </button>

        {/* Progress bars */}
        {pinnedMessages.length > 1 && (
          <div className="flex flex-col justify-center gap-0.5 px-1.5 flex-shrink-0">
            {pinnedMessages.map((_, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full transition-all duration-300"
                style={{
                  height: i === currentIdx ? 16 : 8,
                  background: i === currentIdx ? "#075e54" : "#d1d7db",
                }}
              />
            ))}
          </div>
        )}

        {/* Show all */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
          className="flex items-center justify-center w-10 flex-shrink-0 hover:bg-gray-100 transition-colors"
          style={{ borderLeft: "1px solid #f0f2f5", color: "#8696a0" }}
        >
          <ChevronDown size={16} className="rotate-0" style={{ transform: "rotate(0deg)" }} />
        </button>
      </div>

      {showAll && (
        <AllPinnedPanel
          pinnedMessages={pinnedMessages}
          onClose={() => setShowAll(false)}
          onJump={(id) => onJumpToMessage?.(id)}
        />
      )}
    </>
  );
}