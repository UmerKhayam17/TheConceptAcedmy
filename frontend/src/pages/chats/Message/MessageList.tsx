/**
 * components/Message/MessageList.jsx
 *
 * MODIFICATION: accepts onMentionClick prop and passes it to each MessageBubble.
 * Everything else is identical to the original.
 */
import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useState,
} from "react";
import { useChatUi, useIntersection, type ChatMessage } from "@/services/socket/chat.api";
import MessageBubble from "./MessageBubble";
import DateDivider from "./DateDivider";
import { Loader2 } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

// ── Floating date header ────────────────────────────────────────────────────
function FloatingDateHeader({ label }) {
  return (
    <div
      className="sticky top-2 z-20 flex justify-center pointer-events-none"
      style={{ marginBottom: -28 }}
    >
      <span
        className="text-[12px] font-[500] rounded-lg px-3 py-[5px] shadow-sm select-none"
        style={{
          background: "rgba(255,255,255,0.90)",
          color: "#54656f",
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function getDateLabel(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d))     return "TODAY";
  if (isYesterday(d)) return "YESTERDAY";
  return format(d, "MMMM d, yyyy").toUpperCase();
}

type MessageListProps = {
  conversationId: string;
  messages: ChatMessage[];
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onReply?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversationSetting?: any;
  onMentionClick?: (userId: string) => void;
  pinnedMessages?: ChatMessage[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MessageList = forwardRef<any, MessageListProps>(function MessageList(
  {
    conversationId,
    messages,
    loading,
    hasMore,
    onLoadMore,
    onReply,
    onForward,
    conversationSetting,
    onMentionClick,   // ← NEW: (userId) => void — passed from ChatWindow
    pinnedMessages,
  },
  ref
) {
  const { myId } = useChatUi();

  const containerRef = useRef(null);
  const bottomRef    = useRef(null);
  const prevLenRef   = useRef(0);
  const prevConvRef  = useRef(null);
  const msgRefsMap   = useRef<Record<string, HTMLElement | null>>({});
  const glowTimer    = useRef(null);
  const isNearBottom = useRef(true);

  const topSentinel = useIntersection(onLoadMore);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isNearBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const [floatingDate, setFloatingDate] = useState(null);

  const updateFloatingDate = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const containerTop = el.getBoundingClientRect().top;
    const dateEls = el.querySelectorAll("[data-date-divider]");
    let current = null;
    for (const de of dateEls) {
      const rect = de.getBoundingClientRect();
      if (rect.top <= containerTop + 50) {
        current = de.getAttribute("data-date-divider");
      } else {
        break;
      }
    }
    setFloatingDate(current);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      handleScroll();
      updateFloatingDate();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [handleScroll, updateFloatingDate]);

  useEffect(() => {
    if (conversationId !== prevConvRef.current) {
      prevConvRef.current = conversationId;
      prevLenRef.current  = 0;
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
      }, 0);
    }
  }, [conversationId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const isNewMessage = messages.length > prevLenRef.current;
    const wasEmpty     = prevLenRef.current === 0;
    prevLenRef.current = messages.length;

    if (wasEmpty) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
      }, 0);
      return;
    }
    if (isNewMessage) {
      const last = messages[messages.length - 1];
      const isOwn = last?.senderId?._id === myId || last?.senderId === myId;
      if (isOwn || isNearBottom.current) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages.length, myId]);

  useEffect(() => {
    setTimeout(updateFloatingDate, 100);
  }, [messages.length, updateFloatingDate]);

  const setMsgRef = useCallback((id, el) => {
    const key = String(id);
    if (el) msgRefsMap.current[key] = el;
    else    delete msgRefsMap.current[key];
  }, []);

  const jumpToMessage = useCallback((messageId) => {
    if (!messageId) return;
    if (glowTimer.current) {
      clearTimeout(glowTimer.current.t1);
      clearTimeout(glowTimer.current.t2);
    }
    Object.values(msgRefsMap.current).forEach((el) =>
      el?.classList.remove("wa-msg-highlight")
    );
    const el = msgRefsMap.current[String(messageId)];
    if (!el) {
      console.warn("[jumpToMessage] message not in DOM:", messageId);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t1 = setTimeout(() => {
      el.classList.add("wa-msg-highlight");
      const t2 = setTimeout(() => el.classList.remove("wa-msg-highlight"), 2000);
      glowTimer.current = { t1: null, t2 };
    }, 380);
    glowTimer.current = { t1, t2: null };
  }, []);

  useImperativeHandle(ref, () => ({ jumpToMessage }), [jumpToMessage]);

  const grouped = groupMessages(messages);

  return (
    <>
      <style>{`
        .wa-msg-highlight {
          animation: waGlow 2s ease-out forwards;
          border-radius: 6px;
        }
        @keyframes waGlow {
          0%   { background: rgba(0,168,132,0.30); }
          35%  { background: rgba(0,168,132,0.20); }
          100% { background: transparent; }
        }
      `}</style>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
        style={{ padding: "8px 0" }}
      >
        {floatingDate && <FloatingDateHeader label={floatingDate} />}
        <div ref={topSentinel} className="h-1" />

        {loading && hasMore && (
          <div className="flex justify-center py-3">
            <Loader2 size={18} className="animate-spin text-[#8696a0]" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex justify-center py-16">
            <div
              className="text-[13px] text-[#54656f] rounded-lg px-5 py-2.5"
              style={{ background: "rgba(255,255,255,0.8)" }}
            >
              No messages yet. Say hello! 👋
            </div>
          </div>
        )}

        <div className="space-y-[1px]">
          {grouped.map((item) => {
            if (item.type === "date") {
              return (
                <div
                  key={`date-${item.date}`}
                  data-date-divider={getDateLabel(item.date)}
                >
                  <DateDivider date={item.date} />
                </div>
              );
            }
            return (
              <div
                key={item._id}
                ref={(el) => setMsgRef(item._id, el)}
                className="transition-colors duration-300"
              >
                <MessageBubble
                  message={item}
                  isOwn={item.senderId?._id === myId || item.senderId === myId}
                  showAvatar={item.showAvatar}
                  conversationSetting={conversationSetting}
                  conversationId={conversationId}
                  onReply={onReply}
                  onForward={onForward}
                  onJumpToMessage={jumpToMessage}
                  onMentionClick={onMentionClick}  
                  pinnedMessages={pinnedMessages}
                />
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} className="h-2" />
      </div>
    </>
  );
});

export default MessageList;

function groupMessages(messages) {
  const result = [];
  let lastDate   = null;
  let lastSender = null;
  messages.forEach((msg) => {
    const date = new Date(msg.createdAt).toDateString();
    if (date !== lastDate) {
      result.push({ type: "date", date });
      lastDate   = date;
      lastSender = null;
    }
    const senderId   = msg.senderId?._id || msg.senderId;
    const showAvatar = senderId !== lastSender;
    result.push({ ...msg, showAvatar });
    lastSender = senderId;
  });
  return result;
}