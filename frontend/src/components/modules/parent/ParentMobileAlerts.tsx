import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  FileText,
  Megaphone,
  MessageSquare,
  Monitor,
  Receipt,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchNotifications,
  markNotificationRead,
  notificationHref,
  type AppNotification,
} from "@/lib/notificationsApi";

function visualFor(n: AppNotification): { label: string; Icon: LucideIcon } {
  const blob = `${n.type} ${n.moduleKey} ${n.resource} ${n.path} ${n.title}`.toLowerCase();
  if (/chat|message/.test(blob)) return { label: "Chat", Icon: MessageSquare };
  if (/lesson/.test(blob)) return { label: "Lesson Plans", Icon: Monitor };
  if (/attendance|absent/.test(blob)) return { label: "Attendance", Icon: CalendarDays };
  if (/fee|challan/.test(blob)) return { label: "Fees", Icon: Receipt };
  if (/homework/.test(blob)) return { label: "Homework", Icon: BookOpen };
  if (/announce|notice/.test(blob)) return { label: "Notice Board", Icon: Megaphone };
  if (/exam|date-sheet|assessment|result|report/.test(blob)) return { label: "Date Sheet", Icon: FileText };
  if (n.path) return { label: "Open", Icon: Bell };
  return { label: "", Icon: Bell };
}

function AlertCard({
  item,
  onOpen,
}: {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
}) {
  const { label, Icon } = visualFor(item);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex w-full gap-3 rounded-[18px] bg-white p-3.5 text-left shadow-[0_8px_22px_rgba(15,23,42,0.05)]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F3F6F8] text-[#13B6C6]">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-5 text-[#111827]">{item.title}</span>
        {item.body ? (
          <span className="mt-1 block text-[13px] leading-5 text-[#64748B]">{item.body}</span>
        ) : null}
        {label ? (
          <span className="mt-2 inline-flex rounded-full bg-[#E6F7FB] px-3 py-1 text-xs font-semibold text-[#12C2D4]">
            {label}
          </span>
        ) : null}
      </span>
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
      <h2 className="mb-2.5 flex items-center gap-2 px-0.5 text-sm font-medium text-[#94A3B8]">
        <span className="h-2 w-2 rounded-full bg-[#94A3B8]" />
        {label} ({items.length})
      </h2>
      <div className="space-y-3">
        {items.map((item) => (
          <AlertCard key={item._id} item={item} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export default function ParentMobileAlerts() {
  const { user } = useAuth();
  const role = user?.role || "parent";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications-inbox", false],
    queryFn: () => fetchNotifications({ limit: 50 }),
    enabled: Boolean(user),
  });

  const items = data?.items ?? [];
  const unseen = items.filter((item) => !item.read);
  const seen = items.filter((item) => item.read);

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-inbox"] });
      qc.invalidateQueries({ queryKey: ["parent-mobile-alert-count"] });
      qc.invalidateQueries({ queryKey: ["parent-dashboard-notifications"] });
    },
  });

  const openNotification = async (item: AppNotification) => {
    if (!item.read) {
      try {
        await markOne.mutateAsync(item._id);
      } catch {
        /* still navigate */
      }
    }
    if (item.path) navigate(notificationHref(role, item.path));
  };

  return (
    <div className="flex min-h-full flex-col bg-[#E7F4FB]">
      <header className="px-4 pb-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
        <h1 className="text-center text-xl font-bold text-[#111827]">Notifications</h1>
      </header>

      <div className="flex-1 space-y-5 px-4 pb-6">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-[18px] bg-white/70" />
            <div className="h-24 animate-pulse rounded-[18px] bg-white/70" />
          </div>
        ) : null}
        {isError ? (
          <p className="py-10 text-center text-sm text-slate-500">Could not load alerts.</p>
        ) : null}
        {!isLoading && !isError && items.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No alerts yet.</p>
        ) : null}
        <Section label="Unseen" items={unseen} onOpen={(item) => void openNotification(item)} />
        <Section label="Seen" items={seen} onOpen={(item) => void openNotification(item)} />
      </div>
    </div>
  );
}
