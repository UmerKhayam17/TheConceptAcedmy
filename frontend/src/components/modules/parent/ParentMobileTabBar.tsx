import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, GraduationCap, Home, MessageCircle, Play } from "lucide-react";
import { moduleHref } from "@/lib/panelMenus";
import { fetchNotifications } from "@/lib/notificationsApi";
import { useAuth } from "@/hooks/useAuth";
import { useConversations, userIdStr } from "@/services/socket/chat.api";
import { cn } from "@/lib/utils";

const ROLE = "parent" as const;

function Tab({
  to,
  label,
  active,
  icon: Icon,
  badge,
}: {
  to: string;
  label: string;
  active: boolean;
  icon: typeof Home;
  badge?: number;
}) {
  return (
    <NavLink to={to} className="flex flex-col items-center justify-end gap-1 pb-1" aria-label={label}>
      <span className="relative">
        <Icon className={cn("h-5 w-5", active ? "text-[#13B6C6]" : "text-[#94A3B8]")} strokeWidth={active ? 2.25 : 1.75} />
        {badge ? (
          <span className="absolute -right-2 -top-1.5 grid min-w-[16px] place-items-center rounded-full bg-[#F43F5E] px-1 text-[9px] font-bold leading-4 text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className={cn("text-[10px] font-semibold", active ? "text-[#13B6C6]" : "text-[#94A3B8]")}>{label}</span>
    </NavLink>
  );
}

export default function ParentMobileTabBar() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const view = params.get("view") || "";
  const { user } = useAuth();
  const onHome = pathname === "/panel/parent" || pathname === "/panel/parent/";

  const { data: alerts } = useQuery({
    queryKey: ["parent-mobile-alert-count", user?.id],
    queryFn: () => fetchNotifications({ limit: 1, unread: true }),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const { data: conversations = [] } = useConversations();
  const chatUnread = conversations.reduce((sum, conversation) => {
    const mine = conversation.participants?.find(
      (participant: { userId?: unknown; unreadCount?: number }) =>
        userIdStr(participant.userId) === String(user?.id || ""),
    );
    return sum + (Number(mine?.unreadCount) || 0);
  }, 0);

  return (
    <nav
      data-panel-mobile-nav
      className="relative z-40 shrink-0 bg-transparent md:hidden"
      aria-label="Parent navigation"
    >
      <div className="relative mx-auto grid h-[68px] max-w-lg grid-cols-5 items-end border-t border-[#E6EEF3] bg-white px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.05)]">
        <Tab to="/panel/parent" label="Home" active={onHome && !view} icon={Home} />
        <Tab to="/panel/parent?view=etube" label="eTube" active={onHome && view === "etube"} icon={Play} />
        <div className="relative flex justify-center">
          <NavLink
            to="/panel/parent?view=mentor"
            aria-label="Mentor AI"
            className="absolute -top-6 grid h-[58px] w-[58px] place-items-center rounded-full bg-white shadow-[0_8px_18px_rgba(19,182,198,0.28)] ring-2 ring-[#7FE3EE]"
          >
            <span
              className={cn(
                "grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#7DD3FC] to-[#2563EB] text-white",
                onHome && view === "mentor" && "ring-2 ring-[#13B6C6]",
              )}
            >
              <GraduationCap className="h-5 w-5" />
            </span>
          </NavLink>
        </div>
        <Tab
          to={moduleHref(ROLE, "notifications")}
          label="Alerts"
          active={pathname.includes("/notifications")}
          icon={Bell}
          badge={alerts?.unreadCount || 0}
        />
        <Tab
          to={moduleHref(ROLE, "chat")}
          label="Chats"
          active={pathname.includes("/chat")}
          icon={MessageCircle}
          badge={chatUnread}
        />
      </div>
    </nav>
  );
}
