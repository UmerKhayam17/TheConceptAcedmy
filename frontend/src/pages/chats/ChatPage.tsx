import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import ConversationSidebar from "@/pages/chats/Conversation/ConversationSidebar";
import ChatWindow from "@/pages/chats/Chat/ChatWindow";
import EmptyChatPlaceholder from "@/pages/chats/Chat/EmptyChatPlaceholder";
import {
  ChatUiProvider,
  useChatSocket,
  useChatUi,
  useConversations,
} from "@/services/socket/chat.api";

function ChatPageInner({ canParticipate }: { canParticipate: boolean }) {
  const { activeId, setActiveId } = useChatUi();
  const [searchParams] = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);

  useChatSocket();
  useConversations();

  useEffect(() => {
    const urlConvId = searchParams.get("conversationId");
    if (urlConvId && !activeId) setActiveId(urlConvId);
  }, [searchParams, activeId, setActiveId]);

  return (
    <div className="flex h-full bg-[#f0f2f5] overflow-hidden">
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
  );
}

export default function ChatPage({ canParticipate = true }: { canParticipate?: boolean }) {
  return (
    <ChatUiProvider>
      <ChatPageInner canParticipate={canParticipate} />
    </ChatUiProvider>
  );
}
