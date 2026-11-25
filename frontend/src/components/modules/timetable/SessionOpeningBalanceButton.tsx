import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPkr } from "@/lib/financeDashboardData";
import { fetchOpeningBalance, saveOpeningBalance } from "@/lib/studentManagementApi";
import { patchSession, type Weekday, type WorkingDaysChange } from "@/lib/configApi";
import { localTodayYmd } from "@/lib/localDate";
import { normalizeWorkingDays } from "./constants";
import WorkingDaysPicker, { weeklyOffDays, weeklyOffText } from "./WorkingDaysPicker";

function sessionYmd(value?: string | null): string {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (match) return match[1];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  const ymd = sessionYmd(value);
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}


const sameDays = (a: Weekday[], b: Weekday[]) => a.length === b.length && a.every((d) => b.includes(d));

const DAY_SHORT: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};
const WEEK: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** "Mon–Fri", or "Mon, Wed, Fri" when not consecutive. */
function daysText(days: Weekday[]) {
  const list = WEEK.filter((d) => days.includes(d));
  if (!list.length) return "—";
  const first = WEEK.indexOf(list[0]);
  const consecutive = list.every((d, i) => WEEK.indexOf(d) === first + i);
  if (consecutive && list.length > 2) return `${DAY_SHORT[list[0]]}–${DAY_SHORT[list[list.length - 1]]}`;
  return list.map((d) => DAY_SHORT[d]).join(", ");
}

/** Past changes as "Mon–Sat until 15 Nov 2026", "Mon–Fri from 16 Nov 2026". */
function historyLines(history?: WorkingDaysChange[]) {
  const list = [...(history || [])]
    .filter((h) => h.days?.length && h.effectiveFrom)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  if (list.length < 2) return [];
  return list.map((h, i) => {
    const from = h.effectiveFrom <= "1970-01-01" ? "" : `from ${formatDate(h.effectiveFrom)}`;
    const next = list[i + 1];
    const until = next ? `until ${formatDate(prevYmd(next.effectiveFrom))}` : "onward";
    return `${daysText(h.days)} ${[from, until].filter(Boolean).join(" ")}`;
  });
}

function prevYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** Edit a session's opening balance and working days (weekly off). */
export default function SessionOpeningBalanceButton({
  session,
  className,
  variant = "ghost",
  iconOnly = false,
}: {
  session: {
    _id: string;
    name: string;
    startDate: string;
    endDate: string;
    workingDays?: Weekday[];
    workingDaysHistory?: WorkingDaysChange[];
  };
  className?: string;
  variant?: "ghost" | "outline";
  iconOnly?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState<Weekday[]>(() => normalizeWorkingDays(session.workingDays));
  /** Date the new working days start applying; earlier days keep the old rule. */
  const [effectiveFrom, setEffectiveFrom] = useState(() => localTodayYmd());
  const seeded = useRef(false);
  const start = sessionYmd(session.startDate);
  const end = sessionYmd(session.endDate);
  const savedDays = normalizeWorkingDays(session.workingDays);

  const { data: saved } = useQuery({
    queryKey: ["finance-opening-balance", session._id],
    queryFn: () => fetchOpeningBalance(session._id),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current || saved === undefined) return;
    seeded.current = true;
    setAmount(saved ? String(saved.amount) : "");
  }, [open, saved]);

  const openDialog = () => {
    setDays(normalizeWorkingDays(session.workingDays));
    setEffectiveFrom(localTodayYmd());
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const trimmed = amount.trim();
      const value = Number(trimmed);
      const amountChanged = trimmed !== "" && (!saved || value !== saved.amount);
      const daysChanged = !sameDays(days, savedDays);
      if (trimmed !== "" && (!Number.isFinite(value) || value < 0)) throw new Error("Enter a valid opening balance");
      if (!days.length) throw new Error("Select at least one working day");
      if (daysChanged && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
        throw new Error("Pick the date the new working days apply from");
      }
      if (!amountChanged && !daysChanged) return { amountRow: null, daysSaved: false };
      if (amountChanged && !start) throw new Error("This session has no start date");

      const amountRow = amountChanged
        ? await saveOpeningBalance({ amount: value, sessionId: session._id, asOf: start })
        : null;
      if (daysChanged) {
        await patchSession(session._id, { workingDays: days, workingDaysEffectiveFrom: effectiveFrom });
      }
      return { amountRow, daysSaved: daysChanged };
    },
    onSuccess: ({ amountRow, daysSaved }) => {
      if (amountRow) qc.setQueryData(["finance-opening-balance", session._id], amountRow);
      // Timetable, class board, holidays calendar and attendance all read the session's working days.
      if (daysSaved) qc.invalidateQueries();
      setOpen(false);
      const off = weeklyOffDays(days);
      const parts = [
        amountRow ? `Opening balance ${formatPkr(amountRow.amount)}.` : null,
        daysSaved
          ? `${off.length ? `Weekly off: ${weeklyOffText(off)}` : "All days are working days"} from ${formatDate(effectiveFrom)}. Earlier days keep the old working days.`
          : null,
      ].filter(Boolean);
      toast({
        title: parts.length ? "Session updated" : "No changes to save",
        description: parts.length ? parts.join(" ") : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Could not save session", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <Button
        type="button"
        size={iconOnly ? "icon" : "sm"}
        variant={variant}
        className={className ?? (iconOnly ? "h-8 w-8 text-sky-600 hover:text-sky-700" : "h-7 text-xs gap-1")}
        aria-label="Edit Session"
        title="Edit Session"
        onClick={openDialog}
      >
        <Pencil className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {iconOnly ? null : "Edit Session"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!saveMut.isPending) setOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label>Session</Label>
              <p className="mt-1 text-sm">{session.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Session Start</Label>
                <p className="mt-1 text-sm">{formatDate(session.startDate)}</p>
              </div>
              <div>
                <Label>Session End</Label>
                <p className="mt-1 text-sm">{formatDate(session.endDate)}</p>
              </div>
            </div>
            <div>
              <Label htmlFor={`opening-${session._id}`}>Opening Balance</Label>
              <Input
                id={`opening-${session._id}`}
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="Cash At The Session Start"
                className="mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {saved ? `Saved amount: ${formatPkr(saved.amount)}. ` : ""}
                This is the cash on {start ? formatDate(session.startDate) : "the session start"}. Fees and academy
                expenses through the session end follow on the balance sheet.
              </p>
            </div>
            <WorkingDaysPicker label="Working Days" value={days} onChange={setDays} disabled={saveMut.isPending} />
            {!sameDays(days, savedDays) ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <Label htmlFor={`wd-from-${session._id}`}>Apply new working days from</Label>
                <Input
                  id={`wd-from-${session._id}`}
                  type="date"
                  className="mt-1 bg-white"
                  value={effectiveFrom}
                  min={start || undefined}
                  max={end || undefined}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  disabled={saveMut.isPending}
                />
                <p className="mt-1 text-xs text-amber-900">
                  Days before this date keep the current working days ({daysText(savedDays)}), so past
                  attendance and reports don&apos;t change.
                </p>
              </div>
            ) : null}
            {historyLines(session.workingDaysHistory).length ? (
              <div>
                <Label>Working days history</Label>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {historyLines(session.workingDaysHistory).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saveMut.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveMut.isPending || !start || !end || !days.length}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
