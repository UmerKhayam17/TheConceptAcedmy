import ChatPage from "@/pages/chats/ChatPage";
import { SessionUser } from "@/lib/auth";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";

/** Panel chat module — WhatsApp-style UI wired to backend + sockets. */
const ChatModule = ({ caps }: { user: SessionUser; perm: PermLevel; caps: ModuleActionCaps }) => (
  <div className="h-[calc(100vh-140px)] min-h-[520px]">
    <ChatPage canParticipate={caps.canParticipate} />
  </div>
);

export default ChatModule;
