import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import ConversationSidebar from "@/pages/chats/Conversation/ConversationSidebar";
import ParentMobileChats from "@/pages/chats/Conversation/ParentMobileChats";
import ChatWindow from "@/pages/chats/Chat/ChatWindow";
import EmptyChatPlaceholder from "@/pages/chats/Chat/EmptyChatPlaceholder";
import { useAuth } from "@/hooks/useAuth";
import {
  ChatUiProvider,
  useChatSocket,
  useChatUi,
  useConversations,
} from "@/services/socket/chat.api";
import { cn } from "@/lib/utils";

function ChatPageInner({ canParticipate }: { canParticipate: boolean }) {
  const { user } = useAuth();
  const isParent = user?.role === "parent";
  const { activeId, setActiveId } = useChatUi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);

  const closeParentChat = () => {
    setActiveId(null);
    setSearchParams(
      (prev) => {
        prev.delete("conversationId");
        return prev;
      },
      { replace: true },
    );
  };

  useChatSocket();
  useConversations();

  useEffect(() => {
    const urlConvId = searchParams.get("conversationId");
    if (urlConvId && !activeId) setActiveId(urlConvId);
  }, [searchParams, activeId, setActiveId]);

  // Hide parent bottom tab bar while a conversation thread is open (composer screen).
  useEffect(() => {
    if (!isParent) return;
    if (activeId) document.body.dataset.parentChatThread = "1";
    else delete document.body.dataset.parentChatThread;
    return () => {
      delete document.body.dataset.parentChatThread;
    };
  }, [activeId, isParent]);

  // Deep-link sync (new URLSearchParams so React Router sees a real change).
  useEffect(() => {
    if (!isParent) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const current = next.get("conversationId");
        if (activeId) {
          if (current === activeId) return prev;
          next.set("conversationId", activeId);
          return next;
        }
        if (!current) return prev;
        next.delete("conversationId");
        return next;
      },
      { replace: true },
    );
  }, [activeId, isParent, setSearchParams]);

  return (
    <>
    {isParent && (
      <div className="flex h-full min-h-0 flex-col overflow-hidden md:hidden">
        {activeId ? (
          <ChatWindow
            conversationId={activeId}
            canParticipate={canParticipate}
            onBack={closeParentChat}
          />
        ) : (
          <ParentMobileChats />
        )}
      </div>
    )}
    <div className={cn("flex h-full bg-[#f0f2f5] overflow-hidden", isParent && "hidden md:flex")}>
      <ConversationSidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      {collapsed && (
        <div className="fixed top-24 -translate-y-1/2 z-50 transition-all duration-500">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-full hover:text-gray-800 text-gray-500 my-3"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {activeId ? (
          <ChatWindow
            conversationId={activeId}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            canParticipate={canParticipate}
          />
        ) : (
          <EmptyChatPlaceholder />
        )}
      </div>
    </div>
    </>
  );
}

export default function ChatPage({ canParticipate = true }: { canParticipate?: boolean }) {
  return (
    <ChatUiProvider>
      <ChatPageInner canParticipate={canParticipate} />
    </ChatUiProvider>
  );
}
