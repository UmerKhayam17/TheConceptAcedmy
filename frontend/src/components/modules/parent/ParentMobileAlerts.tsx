import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  FileText,
  Megaphone,
  MessageSquare,
  Monitor,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import ParentChildSelectBanner, {
  notificationBelongsToChild,
  useParentSelectedChild,
} from "@/components/modules/parent/ParentChildSelectBanner";
import {
  fetchNotifications,
  markNotificationRead,
  resolveParentNotificationHref,
  type AppNotification,
} from "@/lib/notificationsApi";
import { cn } from "@/lib/utils";

function visualFor(n: AppNotification): { label: string; Icon: LucideIcon } {
  const blob = `${n.type} ${n.moduleKey} ${n.resource} ${n.path} ${n.title}`.toLowerCase();
  if (/chat|message/.test(blob)) return { label: "Chat", Icon: MessageSquare };
  if (/lesson/.test(blob)) return { label: "Lesson Plans", Icon: Monitor };
  if (/attendance|absent/.test(blob)) return { label: "Attendance", Icon: CalendarDays };
  if (/fee|challan|voucher|due|unpaid/.test(blob)) return { label: "Fees", Icon: Receipt };
  if (/homework/.test(blob)) return { label: "Homework", Icon: BookOpen };
  if (/announce|notice/.test(blob)) return { label: "Notice Board", Icon: Megaphone };
  if (/report.?card|result|marks/.test(blob)) return { label: "Results", Icon: FileText };
  if (/exam|date-sheet|assessment/.test(blob)) return { label: "Date Sheet", Icon: FileText };
  if (/timetable|schedule/.test(blob)) return { label: "Timetable", Icon: CalendarDays };
  if (resolveParentNotificationHref(n)) return { label: "Open", Icon: Bell };
  return { label: "", Icon: Bell };
}

function timeLabel(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function AlertCard({
  item,
  onOpen,
}: {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
}) {
  const { label, Icon } = visualFor(item);
  const canOpen = Boolean(resolveParentNotificationHref(item));
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex w-full items-start gap-2.5 rounded-[16px] bg-white px-3 py-2.5 text-left shadow-[0_6px_16px_rgba(15,23,42,0.04)] active:bg-[#F8FAFC]"
    >
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F3F6F8] text-[#13B6C6]">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="block text-[14px] font-bold leading-5 text-[#111827]">{item.title}</span>
          {item.createdAt ? (
            <span className="shrink-0 pt-0.5 text-[11px] font-semibold text-[#A8B3C0]">
              {timeLabel(item.createdAt)}
            </span>
          ) : null}
        </span>
        {item.body ? (
          <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-[#64748B]">{item.body}</span>
        ) : null}
        <span className="mt-1.5 flex items-center gap-2">
          {label ? (
            <span className="inline-flex rounded-full bg-[#E6F7FB] px-2.5 py-0.5 text-[11px] font-semibold text-[#12C2D4]">
              {label}
            </span>
          ) : null}
          {!item.read ? (
            <span className="h-1.5 w-1.5 rounded-full bg-[#22C5D6]" aria-label="Unread" />
          ) : null}
        </span>
      </span>
      {canOpen ? <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-[#C0C8D2]" /> : null}
    </button>
  );
}

function Section({
  label,
  items,
  onOpen,
}: {
  label: string;
  items: AppNotification[];
  onOpen: (item: AppNotification) => void;
}) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[12px] font-semibold text-[#94A3B8]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" />
        {label} ({items.length})
      </h2>
      <div className="space-y-1.5">
        {items.map((item) => (
          <AlertCard key={item._id} item={item} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export default function ParentMobileAlerts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selected, children, selectedStudentId } = useParentSelectedChild();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications-inbox", false],
    queryFn: () => fetchNotifications({ limit: 80 }),
    enabled: Boolean(user),
  });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return all.filter((item) => notificationBelongsToChild(item, selected, children));
  }, [data?.items, selected, children, selectedStudentId]);

  const unseen = items.filter((item) => !item.read);
  const seen = items.filter((item) => item.read);

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: (_result, id) => {
      const markList = (prev?: { items: AppNotification[]; unreadCount: number }) => {
        if (!prev) return prev;
        const nextItems = prev.items.map((item) =>
          item._id === id ? { ...item, read: true } : item,
        );
        return {
          items: nextItems,
          unreadCount: nextItems.filter((item) => !item.read).length,
        };
      };
      qc.setQueryData(["notifications-inbox", false], markList);
      qc.setQueryData(["notifications"], markList);
      qc.invalidateQueries({ queryKey: ["parent-mobile-alert-count"] });
      qc.invalidateQueries({ queryKey: ["parent-dashboard-notifications"] });
    },
  });

  const openNotification = async (item: AppNotification) => {
    if (!item.read) {
      try {
        await markOne.mutateAsync(item._id);
      } catch {
        /* still open */
      }
    }
    const href = resolveParentNotificationHref(item);
    if (href) {
      navigate(href);
      return;
    }
    toast.message("Marked as seen");
  };

  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-center text-[22px] font-extrabold tracking-tight text-[#111827]">
          Notifications
        </h1>
      </header>

      <ParentChildSelectBanner className="mb-3" />

      <div className={cn("flex-1 space-y-3 px-4 pb-5")}>
        {isLoading ? (
          <div className="space-y-1.5">
            <div className="h-16 animate-pulse rounded-[16px] bg-white/70" />
            <div className="h-16 animate-pulse rounded-[16px] bg-white/70" />
          </div>
        ) : null}
        {isError ? (
          <p className="py-8 text-center text-sm text-slate-500">Could not load alerts.</p>
        ) : null}
        {!isLoading && !isError && items.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            No alerts for {selected?.studentName || "this student"} yet.
          </p>
        ) : null}
        <Section label="Unseen" items={unseen} onOpen={(item) => void openNotification(item)} />
        <Section label="Seen" items={seen} onOpen={(item) => void openNotification(item)} />
      </div>
    </div>
  );
}
