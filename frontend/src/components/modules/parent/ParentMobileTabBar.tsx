import { useMemo } from "react";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarDays, Home, MessageCircle } from "lucide-react";
import { moduleHref } from "@/lib/panelMenus";
import { fetchNotifications } from "@/lib/notificationsApi";
import { useAuth } from "@/hooks/useAuth";
import { useConversations, userIdStr } from "@/services/socket/chat.api";
import {
  conversationBelongsToChild,
  notificationBelongsToChild,
  useParentSelectedChild,
} from "@/components/modules/parent/ParentChildSelectBanner";

const ROLE = "parent" as const;
const ACTIVE = "#12C5D6";
const IDLE = "#94A3B8";

function Tab({
  to,
  label,
  active,
  icon: Icon,
  badge = 0,
}: {
  to: string;
  label: string;
  active: boolean;
  icon: typeof Home;
  badge?: number;
}) {
  const count = Math.max(0, Math.floor(Number(badge) || 0));
  const shown = count > 99 ? "99+" : String(count);
  return (
    <NavLink
      to={to}
      className="relative flex h-full flex-col items-center justify-end gap-1 overflow-visible pb-2"
      aria-label={count > 0 ? `${label}, ${count} unread` : label}
    >
      <span className="relative overflow-visible">
        <Icon
          className="h-[22px] w-[22px]"
          style={{ color: active ? ACTIVE : IDLE }}
          strokeWidth={active ? 2.25 : 1.75}
        />
        {count > 0 ? (
          <span className="absolute -right-2.5 -top-1.5 z-10 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#F04444] px-[4px] text-[10px] font-bold leading-none text-white">
            {shown}
          </span>
        ) : null}
      </span>
      <span
        className="text-[11px] font-medium leading-none"
        style={{ color: active ? ACTIVE : IDLE }}
      >
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
  const { selected, children, selectedStudentId } = useParentSelectedChild();

  const { data: alerts } = useQuery({
    queryKey: ["parent-mobile-alert-count", user?.id, selectedStudentId],
    queryFn: () => fetchNotifications({ limit: 80 }),
    enabled: Boolean(user),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const alertCount = useMemo(() => {
    const items = (alerts?.items || []).filter(
      (item) => !item.read && notificationBelongsToChild(item, selected, children),
    );
    return items.length;
  }, [alerts?.items, selected, children]);

  const { data: conversations = [] } = useConversations();
  const myId = String(user?.id || "");
  const siblingNames = children.map((child) => child.studentName || "");
  const childName = selected?.studentName || "";

  const chatUnread = useMemo(() => {
    return conversations.reduce((sum, conversation) => {
      if (!conversationBelongsToChild(conversation, childName, siblingNames)) return sum;
      const fromMine = Number((conversation as { myUnreadCount?: number }).myUnreadCount);
      if (Number.isFinite(fromMine) && fromMine > 0) return sum + fromMine;
      const mine = conversation.participants?.find(
        (participant: { userId?: unknown; unreadCount?: number }) =>
          userIdStr(participant.userId) === myId,
      );
      return sum + (Number(mine?.unreadCount) || 0);
    }, 0);
  }, [conversations, childName, siblingNames, myId]);

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

        <div className="relative grid h-16 grid-cols-5 overflow-visible">
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
            <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[42%]">
              <span
                className="academy-icon-pulse grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-white shadow-[0_8px_16px_rgba(15,23,42,0.16)] ring-[3px] ring-white"
                style={{ animation: "academyIconPulse 1.8s ease-in-out infinite" }}
              >
                <img src="/icons/icon-512.png" alt="" className="h-full w-full object-cover" />
              </span>
            </span>
            <style>{`
              @keyframes academyIconPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.14); }
              }
              @media (prefers-reduced-motion: reduce) {
                .academy-icon-pulse { animation: none !important; }
              }
            `}</style>
          </NavLink>
          <Tab
            to={moduleHref(ROLE, "notifications")}
            label="Alerts"
            active={pathname.includes("/notifications")}
            icon={Bell}
            badge={alertCount}
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
