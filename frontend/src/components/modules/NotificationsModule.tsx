import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
  type AppNotification,
} from "@/lib/notificationsApi";
import { cn } from "@/lib/utils";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Full-page notifications inbox (parents, staff, teachers). */
export default function NotificationsModule() {
  const { user } = useAuth();
  const role = user?.role || "parent";
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["notifications-inbox", unreadOnly],
    queryFn: () => fetchNotifications({ limit: 50, unread: unreadOnly || undefined }),
    enabled: Boolean(user),
  });

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? items.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    return items.filter((n) => matchesPanelSearch(search, n.title, n.body, n.type, n.moduleKey));
  }, [items, search]);

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-inbox"] });
      toast({ title: "All notifications marked read" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  });

  const openNotification = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await markOne.mutateAsync(n._id);
      } catch {
        /* still navigate */
      }
    }
    if (n.path) navigate(notificationHref(role, n.path));
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-[#1a2b4b]">
              Notifications
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              Alerts from the school about your children, exams, and announcements.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="secondary">{unreadCount} unread</Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={markAll.isPending || unreadCount === 0}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search notifications…"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="rounded border"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          Unread only
        </label>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading notifications…</p>}
      {isError && (
        <Card className="rounded-xl border p-6 text-sm text-destructive">
          {(error as Error)?.message || "Failed to load notifications"}
        </Card>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <Card className="rounded-2xl border border-dashed p-10 text-center">
          <p className="text-sm font-medium text-foreground">No notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadOnly
              ? "You're all caught up — no unread items."
              : "When the school sends updates, they will appear here."}
          </p>
        </Card>
      )}

      <ul className="space-y-2">
        {filtered.map((n) => (
          <li key={n._id}>
            <button
              type="button"
              onClick={() => void openNotification(n)}
              className={cn(
                "w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-slate-50/80",
                !n.read && "border-primary/20 bg-primary/[0.03]",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("font-medium text-[#1a2b4b]", !n.read && "font-semibold")}>
                    {n.title}
                  </p>
                  {n.body ? (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{n.body}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {!n.read && <Badge className="bg-primary text-primary-foreground">New</Badge>}
                  <span className="text-[11px] text-muted-foreground">{formatWhen(n.createdAt)}</span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
