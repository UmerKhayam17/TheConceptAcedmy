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

export default function SessionOpeningBalanceButton({
  session,
  className,
  variant = "ghost",
  iconOnly = false,
}: {
  session: { _id: string; name: string; startDate: string; endDate: string };
  className?: string;
  variant?: "ghost" | "outline";
  iconOnly?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const seeded = useRef(false);
  const start = sessionYmd(session.startDate);
  const end = sessionYmd(session.endDate);

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
    if (seeded.current || saved == null) return;
    seeded.current = true;
    setAmount(String(saved.amount));
  }, [open, saved]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!start) throw new Error("This session has no start date");
      const trimmed = amount.trim();
      const value = Number(trimmed);
      if (trimmed === "" || !Number.isFinite(value) || value < 0) throw new Error("Enter the opening balance");
      return saveOpeningBalance({ amount: value, sessionId: session._id, asOf: start });
    },
    onSuccess: (row) => {
      qc.setQueryData(["finance-opening-balance", session._id], row);
      setOpen(false);
      toast({
        title: "Opening balance saved",
        description: `${formatPkr(row.amount)} at the start of ${session.name}.`,
      });
    },
    onError: (e: Error) => toast({ title: "Could not save opening balance", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <Button
        type="button"
        size={iconOnly ? "icon" : "sm"}
        variant={variant}
        className={className ?? (iconOnly ? "h-8 w-8 text-sky-600 hover:text-sky-700" : "h-7 text-xs gap-1")}
        aria-label="Edit opening balance"
        title="Edit opening balance"
        onClick={() => setOpen(true)}
      >
        <Pencil className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {iconOnly ? null : "Edit opening"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit opening balance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label>Session</Label>
              <p className="mt-1 text-sm">{session.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Session start</Label>
                <p className="mt-1 text-sm">{formatDate(session.startDate)}</p>
              </div>
              <div>
                <Label>Session end</Label>
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
                placeholder="Cash at the session start"
                className="mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {saved ? (
                <p className="mt-1 text-xs text-muted-foreground">Saved amount: {formatPkr(saved.amount)}</p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              This is the cash on {start ? formatDate(session.startDate) : "the session start"}. Fees and academy expenses through the session end follow on the balance sheet.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveMut.isPending || !start || !end}
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
