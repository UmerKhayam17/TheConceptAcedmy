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
import { cn } from "@/lib/utils";

const ROLE = "parent" as const;
const ACTIVE = "#0867cc";
const IDLE = "#555a70";

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
          className="h-[27px] w-[27px]"
          style={{ color: active ? ACTIVE : IDLE }}
          strokeWidth={active ? 2.25 : 2}
        />
        {count > 0 ? (
          <span className="absolute -right-2.5 -top-1.5 z-10 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#F04444] px-[4px] text-[10px] font-bold leading-none text-white">
            {shown}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-[clamp(10px,3.1vw,13px)] font-extrabold leading-none",
          active && "relative",
        )}
        style={{ color: active ? ACTIVE : IDLE }}
      >
        {label}
        {active ? (
          <span className="absolute -bottom-2 left-1/2 h-[3px] w-[54px] -translate-x-1/2 rounded bg-[#0867cc]" />
        ) : null}
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
      className="relative z-40 shrink-0 overflow-visible bg-transparent pb-[max(12px,var(--safe-bottom))] md:hidden"
      aria-label="Parent navigation"
    >
      <div className="relative mx-auto h-[72px] max-w-lg overflow-visible">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[110px] items-end [filter:drop-shadow(0_-5px_16px_#16385e1c)]">
          <div className="h-[72px] flex-1 rounded-tl-[44px] border-t border-[#E7EEF3] bg-white" />
          <svg width="180" height="110" viewBox="0 0 180 110" className="-mx-px shrink-0" aria-hidden>
            <path
              fill="#ffffff"
              d="M0 38H45C58 38 63 38 70 24C77 12 84 10 90 10C96 10 103 12 110 24C117 38 122 38 135 38H180V110H0Z"
            />
            <path
              fill="none"
              stroke="#E7EEF3"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              d="M0 38H45C58 38 63 38 70 24C77 12 84 10 90 10C96 10 103 12 110 24C117 38 122 38 135 38H180"
            />
          </svg>
          <div className="h-[72px] flex-1 rounded-tr-[44px] border-t border-[#E7EEF3] bg-white" />
        </div>

        <div className="relative grid h-[72px] grid-cols-5 overflow-visible px-1.5 pt-2">
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
            <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[55%]">
              <span
                className="academy-icon-pulse grid h-[78px] w-[78px] place-content-center overflow-hidden rounded-full border-[6px] border-white bg-[radial-gradient(circle_at_50%_30%,#ffda23_0_11%,#fff_34%)] text-center shadow-[0_6px_13px_#102b5d3b]"
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
