/**
 * components/Chat/ChatWindow.jsx
 *
 * MODIFICATION:
 *  - handleMentionClick(userId): calls api.getOrCreateDirect(userId),
 *    then dispatches setActiveConversation to open that DM.
 *    If user clicks their own @mention (shouldn't happen but just in case)
 *    it's silently ignored.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import socketService from "@/services/socket/socket.service";
import ChatHeader from "./ChatHeader";
import {
  useChatUi,
  useConversations,
  useMessages,
  useSmartJump,
  clearUnread,
  prependConversation,
  fetchOlderMessages,
} from "@/services/socket/chat.api";
import MessageList                        from "../Message/MessageList";
import MessageInput                       from "../Message/MessageInput";
import PinnedMessageBar                   from "../Message/PinnedMessageBar";
import ForwardMessageModal                from "../Message/ForwardMessageModal";
import api                                from "@/services/socket/chat.api";

// ── WhatsApp-style toast ─────────────────────────────────────────────────────
function NoAccessToast({ message, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{ animation: "waFadeUp .2s ease-out" }}
    >
      <div
        className="flex items-center gap-2 text-white text-[13px] px-4 py-2 rounded-lg shadow-xl whitespace-nowrap"
        style={{ background: "rgba(11,20,26,0.87)" }}
      >
        🔒 {message}
      </div>
      <style>{`
        @keyframes waFadeUp {
          from { opacity:0; transform:translate(-50%,8px); }
          to   { opacity:1; transform:translate(-50%,0);   }
        }
      `}</style>
    </div>
  );
}

// ── Subtle "opening conversation…" overlay ───────────────────────────────────
function OpeningDMToast() {
  return (
    <div
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{ animation: "waFadeUp .2s ease-out" }}
    >
      <div
        className="flex items-center gap-2 text-white text-[13px] px-4 py-2 rounded-lg shadow-xl whitespace-nowrap"
        style={{ background: "rgba(0,168,132,0.92)" }}
      >
        💬 Opening conversation…
      </div>
      <style>{`
        @keyframes waFadeUp {
          from { opacity:0; transform:translate(-50%,8px); }
          to   { opacity:1; transform:translate(-50%,0);   }
        }
      `}</style>
    </div>
  );
}

const WA_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='412' height='412'%3E%3Cdefs%3E%3Cpattern id='p' width='412' height='412' patternUnits='userSpaceOnUse'%3E%3Crect width='412' height='412' fill='%23eae6df'/%3E%3Cg fill='none' stroke='%23d4cfc8' stroke-width='1.1' opacity='0.55'%3E%3Ccircle cx='34' cy='34' r='16'/%3E%3Ccircle cx='100' cy='100' r='10'/%3E%3Crect x='150' y='20' width='28' height='28' rx='4'/%3E%3Cpath d='M220 60 l20-20 20 20 -20 20z'/%3E%3Ccircle cx='300' cy='50' r='14'/%3E%3Crect x='360' y='10' width='24' height='24' rx='3'/%3E%3Ccircle cx='34' cy='150' r='12'/%3E%3Cpath d='M80 180 l14-14 14 14 -14 14z'/%3E%3Crect x='120' y='140' width='22' height='22' rx='3'/%3E%3Ccircle cx='200' cy='160' r='16'/%3E%3Cpath d='M260 180 l18-18 18 18 -18 18z'/%3E%3Ccircle cx='340' cy='140' r='10'/%3E%3Crect x='370' y='130' width='26' height='26' rx='4'/%3E%3Ccircle cx='60' cy='260' r='14'/%3E%3Crect x='110' y='250' width='20' height='20' rx='3'/%3E%3Cpath d='M170 270 l16-16 16 16 -16 16z'/%3E%3Ccircle cx='240' cy='280' r='12'/%3E%3Crect x='290' y='255' width='24' height='24' rx='4'/%3E%3Ccircle cx='370' cy='260' r='16'/%3E%3Ccircle cx='30' cy='370' r='10'/%3E%3Cpath d='M80 380 l14-14 14 14 -14 14z'/%3E%3Ccircle cx='150' cy='380' r='14'/%3E%3Crect x='200' y='360' width='22' height='22' rx='3'/%3E%3Ccircle cx='280' cy='390' r='12'/%3E%3Cpath d='M330 370 l18-18 18 18 -18 18z'/%3E%3C/g%3E%3C/pattern%3E%3C/defs%3E%3Crect width='412' height='412' fill='url(%23p)'/%3E%3C/svg%3E")`;

export default function ChatWindow({ conversationId, canParticipate = true }) {
  const qc = useQueryClient();
  const { myId, setActiveId } = useChatUi();
  const { data: bucket, isLoading: messagesLoading } = useMessages(conversationId);
  const { data: allConversations = [] } = useConversations();
  const conv = allConversations.find((c) => String(c._id) === String(conversationId));

  const [replyToMessage, setReplyToMessage] = useState(null);
  const [forwardMessage, setForwardMessage] = useState(null);
  const [noAccessMsg,    setNoAccessMsg]    = useState(null);
  const [openingDM,      setOpeningDM]      = useState(false);

  const messageListRef = useRef(null);
  const hasFetched     = useRef(false);
  const prevConvRef    = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Sync URL param ─────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    setSearchParams(
      (prev) => { prev.set("conversationId", conversationId); return prev; },
      { replace: true }
    );
  }, [conversationId]);

  // ── Join room, mark read, fetch messages ───────────────────
  useEffect(() => {
    if (!conversationId) return;

    if (prevConvRef.current && prevConvRef.current !== conversationId) {
      socketService.chat?.emit("conversation:blur", { conversationId: prevConvRef.current });
    }
    prevConvRef.current = conversationId;

    socketService.joinConversation(conversationId);
    socketService.markRead(conversationId);
    clearUnread(qc, conversationId, myId);

    if (!bucket || bucket.messages.length === 0) hasFetched.current = false;
    if (!hasFetched.current) {
      qc.invalidateQueries({ queryKey: ["chat", "messages", conversationId] });
      hasFetched.current = true;
    }
  }, [conversationId, qc, myId, bucket]);

  // ── Re-mark read on focus ──────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const onFocus = () => {
      socketService.markRead(conversationId);
      clearUnread(qc, conversationId, myId);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [conversationId, myId, qc]);

  // ── Blur on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (conversationId) {
        socketService.chat?.emit("conversation:blur", { conversationId });
      }
    };
  }, [conversationId]);

  const loadMore = () => {
    if (!bucket?.hasMore || bucket?.loading) return;
    const oldest = bucket.messages[0];
    fetchOlderMessages(qc, conversationId, oldest?.createdAt);
  };

  // ── Direct jump (already-loaded messages) ─────────────────
  const jumpToMessage = useCallback((messageId) => {
    messageListRef.current?.jumpToMessage(messageId);
  }, []);

  // ── Smart jump (loads more pages if needed) ───────────────
  const { smartJump } = useSmartJump(conversationId, jumpToMessage);

  // ── Forward origin jump ───────────────────────────────────
  const handleForwardJump = useCallback(
    (originalMessageId, originalConvId) => {
      if (!originalMessageId) return;
      if (!originalConvId || originalConvId === conversationId) {
        smartJump(originalMessageId);
        return;
      }
      const targetConv = allConversations.find((c) => c._id === originalConvId);
      setNoAccessMsg(
        targetConv
          ? "Original message is in another conversation."
          : "You don't have access to the original conversation."
      );
    },
    [conversationId, allConversations, smartJump]
  );

  // ── Mention click → open DM ───────────────────────────────
  const handleMentionClick = useCallback(
    async (userId) => {
      if (!userId) return;
      // Don't open a DM with yourself
      if (String(userId) === String(myId)) return;

      // If we already have a direct conv with this user in the list, just switch
      const existing = allConversations.find(
        (c) =>
          c.type === "direct" &&
          c.participants?.some(
            (p) => String(p.userId?._id || p.userId) === String(userId)
          )
      );

      if (existing) {
        setActiveId(existing._id);
        socketService.joinConversation(existing._id);
        socketService.markRead(existing._id);
        clearUnread(qc, existing._id, myId);
        return;
      }

      // Otherwise create/fetch via API
      setOpeningDM(true);
      try {
        const res  = await api.getOrCreateDirect(userId);
        const conv = res.data.conversation;
        if (!conv) throw new Error("No conversation returned");

        dispatch(prependConversation(conv));
        socketService.joinConversation(conv._id);
        socketService.markRead(conv._id);
        dispatch(clearUnread({ conversationId: conv._id, myId }));
        dispatch(setActiveConversation(conv._id));
      } catch (err) {
        console.error("[handleMentionClick] failed:", err);
        setNoAccessMsg("Could not open conversation with this user.");
      } finally {
        setOpeningDM(false);
      }
    },
    [myId, allConversations, qc, setActiveId]
  );

  const pinnedMessages = conv?.pinnedMessages || [];

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{ background: "#eae6df" }}
    >
      {/* Wallpaper */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: WA_BG, backgroundSize: "412px 412px", opacity: 1 }}
      />
      {/* Content */}
      <div className="relative flex flex-col h-full z-10">
        <ChatHeader
          conversation={conv}
          onJumpToMessage={jumpToMessage}
          onSmartJump={smartJump}
        />

        {pinnedMessages.length > 0 && (
          <PinnedMessageBar
            pinnedMessages={pinnedMessages}
            onJumpToMessage={smartJump}
          />
        )}

        <MessageList
          ref={messageListRef}
          conversationId={conversationId}
          messages={bucket?.messages || []}
          conversationSetting={conv?.settings}
          loading={messagesLoading}
          hasMore={bucket?.hasMore}
          onLoadMore={loadMore}
          onReply={setReplyToMessage}
          onForward={setForwardMessage}
          onMentionClick={handleMentionClick}
          pinnedMessages={pinnedMessages}
        />

        <MessageInput
          conversationId={conversationId}
          conversation={conv}
          replyTo={replyToMessage}
          onCancelReply={() => setReplyToMessage(null)}
          canParticipate={canParticipate}
        />

        <ForwardMessageModal
          isOpen={!!forwardMessage}
          message={forwardMessage}
          onClose={() => setForwardMessage(null)}
        />

        {noAccessMsg && (
          <NoAccessToast message={noAccessMsg} onDismiss={() => setNoAccessMsg(null)} />
        )}
        {openingDM && <OpeningDMToast />}
      </div>
    </div>
  );
}