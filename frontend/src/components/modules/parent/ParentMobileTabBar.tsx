import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarDays, Home, MessageCircle } from "lucide-react";
import { moduleHref } from "@/lib/panelMenus";
import { fetchNotifications } from "@/lib/notificationsApi";
import { useAuth } from "@/hooks/useAuth";
import { useConversations, userIdStr } from "@/services/socket/chat.api";

const ROLE = "parent" as const;
const ACTIVE = "#12C5D6";
const IDLE = "#94A3B8";

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
    <NavLink to={to} className="flex h-full flex-col items-center justify-end gap-1 pb-2" aria-label={label}>
      <span className="relative">
        <Icon
          className="h-[22px] w-[22px]"
          style={{ color: active ? ACTIVE : IDLE }}
          strokeWidth={active ? 2.25 : 1.75}
        />
        {badge ? (
          <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#FF3B5C] px-1 text-[10px] font-bold leading-none text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] font-medium leading-none" style={{ color: active ? ACTIVE : IDLE }}>
        {label}
      </span>
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
      className="relative z-40 shrink-0 overflow-visible bg-white pb-[max(34px,var(--safe-bottom))] md:hidden"
      aria-label="Parent navigation"
    >
      <div className="relative mx-auto h-16 max-w-lg overflow-visible">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[94px] items-end [filter:drop-shadow(0_-4px_10px_rgba(15,23,42,0.06))]">
          <div className="h-16 flex-1 border-t border-[#E7EEF3] bg-white" />
          <svg width="160" height="94" viewBox="0 0 160 94" className="-mx-px shrink-0" aria-hidden>
            <path
              fill="#ffffff"
              d="M0 30H40C52 30 56 30 62 18C68 8 74 6 80 6C86 6 92 8 98 18C104 30 108 30 120 30H160V94H0Z"
            />
            <path
              fill="none"
              stroke="#E7EEF3"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              d="M0 30H40C52 30 56 30 62 18C68 8 74 6 80 6C86 6 92 8 98 18C104 30 108 30 120 30H160"
            />
          </svg>
          <div className="h-16 flex-1 border-t border-[#E7EEF3] bg-white" />
        </div>

        <div className="relative grid h-16 grid-cols-5">
          <Tab to="/panel/parent" label="Home" active={onHome && !view} icon={Home} />
          <Tab
            to={moduleHref(ROLE, "attendance")}
            label="Attendance"
            active={pathname.includes("/attendance")}
            icon={CalendarDays}
          />
          <NavLink
            to="/panel/parent"
            aria-label="The Concept Academy"
            className="relative flex h-full items-end justify-center"
          >
            <span className="absolute left-1/2 top-0 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full bg-white shadow-[0_8px_16px_rgba(15,23,42,0.16)] ring-[3px] ring-white">
              <img src="/icons/icon-512.png" alt="" className="h-full w-full object-cover" />
            </span>
          </NavLink>
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
      </div>
    </nav>
  );
}
