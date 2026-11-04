import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarRange, CheckCircle2, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchBalanceSheet, type BalanceSheet, type BalanceSheetLine } from "@/lib/studentManagementApi";
import logoUrl from "@/assets/logo.png";

/* ----------------------------- helpers ----------------------------- */

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function longDate(value: string): string {
  return parseYmd(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Accounting format: 1,250,000 · negatives in brackets · zero as a dash. */
function acct(n: number): string {
  if (!n || Math.abs(n) < 0.005) return "–";
  const s = Math.abs(n).toLocaleString("en-PK", { maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Preset = { key: string; label: string; range: () => [Date, Date] };

const PRESETS: Preset[] = [
  {
    key: "month",
    label: "This month",
    range: () => {
      const n = new Date();
      return [new Date(n.getFullYear(), n.getMonth(), 1), n];
    },
  },
  {
    key: "quarter",
    label: "This quarter",
    range: () => {
      const n = new Date();
      return [new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1), n];
    },
  },
  {
    key: "year",
    label: "This year",
    range: () => {
      const n = new Date();
      return [new Date(n.getFullYear(), 0, 1), n];
    },
  },
  {
    key: "lastYear",
    label: "Last year",
    range: () => {
      const y = new Date().getFullYear() - 1;
      return [new Date(y, 0, 1), new Date(y, 11, 31)];
    },
  },
];

/* --------------------------- print layout --------------------------- */

function buildPrintHtml(bs: BalanceSheet, preparedBy?: string): string {
  const logo = new URL(logoUrl, window.location.href).href;
  const e = escapeHtml;

  const row = (label: string, amount: number | null, cls = "", note = "") =>
    `<tr class="${cls}"><td class="lbl">${e(label)}</td><td class="note">${note}</td><td class="amt">${
      amount === null ? "" : acct(amount)
    }</td></tr>`;

  const lineRows = (lines: BalanceSheetLine[]) =>
    lines
      .map(
        (l) =>
          row(l.label, l.children?.length ? null : l.amount, "item") +
          (l.children?.length
            ? l.children.map((c) => row(c.label, c.amount, "sub")).join("") + row(`Total ${l.label.toLowerCase()}`, l.amount, "subtotal")
            : ""),
      )
      .join("");

  const { assets, liabilities, fund, incomeStatement: is, cashFlow: cf, notes, range, brand } = bs;
  const period = `${longDate(range.from)} to ${longDate(range.to)}`;
  const generated = new Date(bs.generatedAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Balance Sheet – ${e(range.to)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Georgia", "Times New Roman", serif; color: #1a2433; margin: 0; font-size: 11.5px; line-height: 1.45; }
  .sans { font-family: "Segoe UI", Arial, sans-serif; }
  header { display: flex; align-items: center; gap: 16px; padding-bottom: 12px; border-bottom: 3px double #0E2A4E; }
  header img { height: 64px; width: auto; }
  header .org h1 { margin: 0; font-size: 22px; color: #0E2A4E; letter-spacing: .3px; }
  header .org p { margin: 2px 0 0; color: #5A6A7A; font-size: 10.5px; }
  header .meta { margin-left: auto; text-align: right; font-size: 10px; color: #5A6A7A; }
  .title { text-align: center; margin: 18px 0 4px; }
  .title h2 { margin: 0; font-size: 17px; letter-spacing: 2px; text-transform: uppercase; color: #0E2A4E; }
  .title p { margin: 4px 0 0; color: #5A6A7A; font-style: italic; }
  .currency { text-align: right; font-size: 10px; color: #5A6A7A; margin: 10px 0 2px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3.5px 6px; vertical-align: bottom; }
  td.amt { text-align: right; width: 150px; font-variant-numeric: tabular-nums; font-family: "Segoe UI", Arial, sans-serif; }
  td.note { width: 40px; text-align: center; color: #5A6A7A; font-size: 10px; }
  tr.section td { padding-top: 14px; font-weight: bold; font-size: 12.5px; color: #0E2A4E; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #0E2A4E; }
  tr.group td { padding-top: 8px; font-weight: bold; font-style: italic; }
  tr.item td.lbl { padding-left: 16px; }
  tr.sub td.lbl { padding-left: 32px; color: #3c4a5c; }
  tr.sub td.amt { color: #3c4a5c; }
  tr.subtotal td { font-weight: 600; }
  tr.subtotal td.lbl { padding-left: 16px; }
  tr.subtotal td.amt { border-top: 1px solid #9aa8b8; }
  tr.total td { font-weight: bold; background: #F6F8FB; }
  tr.total td.amt { border-top: 1px solid #1a2433; }
  tr.grand td { font-weight: bold; font-size: 12.5px; color: #0E2A4E; background: #EEF2F8; }
  tr.grand td.amt { border-top: 1px solid #1a2433; border-bottom: 3px double #1a2433; }
  .check { margin: 10px 0 0; padding: 6px 10px; font-size: 10px; border-radius: 3px; }
  .check.ok { background: #ecfdf3; color: #0f6b3f; border: 1px solid #b7ebcd; }
  .check.bad { background: #fef2f2; color: #a11d1d; border: 1px solid #f5c2c2; }
  .page-break { page-break-before: always; }
  .notes { margin-top: 18px; font-size: 10px; color: #3c4a5c; }
  .notes h4 { margin: 0 0 4px; font-size: 11px; color: #0E2A4E; text-transform: uppercase; letter-spacing: 1px; }
  .notes ol { margin: 0; padding-left: 18px; }
  .sign { display: flex; justify-content: space-between; gap: 30px; margin-top: 54px; }
  .sign div { flex: 1; text-align: center; border-top: 1px solid #1a2433; padding-top: 5px; font-size: 10.5px; }
  .sign small { display: block; color: #5A6A7A; }
  footer { position: fixed; bottom: -10mm; left: 0; right: 0; text-align: center; font-size: 9px; color: #8a97a8; }
</style></head>
<body>
  <header>
    <img src="${logo}" alt="" onerror="this.style.display='none'">
    <div class="org">
      <h1>${e(brand.name)}</h1>
      <p>${e(brand.legalName)} · ${e(brand.address)}</p>
      <p class="sans">${e(brand.phones.join(" / "))} · ${e(brand.email)}</p>
    </div>
    <div class="meta sans">Generated ${e(generated)}${preparedBy ? `<br>Prepared by ${e(preparedBy)}` : ""}</div>
  </header>

  <div class="title">
    <h2>Balance Sheet</h2>
    <p>Statement of Financial Position as at ${e(longDate(range.to))}</p>
  </div>
  <div class="currency sans">Amounts in Pakistani Rupees (PKR)</div>

  <table>
    <tr class="section"><td class="lbl">Assets</td><td class="note">Note</td><td class="amt">PKR</td></tr>
    <tr class="group"><td colspan="3">Current assets</td></tr>
    ${lineRows(assets.current)}
    ${row("Total assets", assets.total, "grand")}

    <tr class="section"><td class="lbl">Liabilities &amp; Accumulated Fund</td><td class="note"></td><td class="amt"></td></tr>
    <tr class="group"><td colspan="3">Current liabilities</td></tr>
    ${lineRows(liabilities.current)}
    ${row("Total liabilities", liabilities.total, "total")}
    <tr class="group"><td colspan="3">Accumulated fund</td></tr>
    ${row(`Balance as at ${longDate(range.from)}`, fund.opening, "item")}
    ${row(`${fund.surplus >= 0 ? "Surplus" : "Deficit"} for the period`, fund.surplus, "item", "1")}
    ${row("Total accumulated fund", fund.closing, "total")}
    ${row("Total liabilities & accumulated fund", bs.totalLiabilitiesAndFund, "grand")}
  </table>
  <div class="check sans ${bs.balanced ? "ok" : "bad"}">
    ${bs.balanced ? "✓ Statement is balanced — total assets equal total liabilities and accumulated fund." : "⚠ Statement does not balance. Please review the underlying records."}
  </div>

  <div class="sign">
    <div>Prepared by<small>Accountant</small></div>
    <div>Reviewed by<small>Finance Officer</small></div>
    <div>Approved by<small>Principal / Director</small></div>
  </div>

  <div class="page-break"></div>
  <div class="title">
    <h2>Note 1 · Income &amp; Expenditure</h2>
    <p>For the period ${e(period)}</p>
  </div>
  <div class="currency sans">Amounts in Pakistani Rupees (PKR)</div>
  <table>
    <tr class="section"><td class="lbl">Income</td><td class="note"></td><td class="amt">PKR</td></tr>
    ${is.income.length ? lineRows(is.income) : row("No income recorded", 0, "item")}
    ${row("Total income", is.totalIncome, "total")}
    <tr class="section"><td class="lbl">Expenditure</td><td class="note"></td><td class="amt"></td></tr>
    ${is.expenditure.length ? lineRows(is.expenditure) : row("No expenditure recorded", 0, "item")}
    ${row("Total expenditure", is.totalExpenditure, "total")}
    ${row(`Net ${is.surplus >= 0 ? "surplus" : "deficit"} for the period`, is.surplus, "grand")}
  </table>

  <div class="title" style="margin-top:26px">
    <h2>Note 2 · Cash Summary</h2>
    <p>For the period ${e(period)}</p>
  </div>
  <table>
    ${row(`Opening cash balance (${longDate(range.from)})`, cf.opening, "item")}
    ${row("Add: fees received", cf.receipts, "item")}
    ${row("Less: salaries paid", -cf.salaryPayments, "item")}
    ${row("Less: expenses paid", -cf.expensePayments, "item")}
    ${row(`Closing cash balance (${longDate(range.to)})`, cf.closing, "grand")}
  </table>

  <div class="notes">
    <h4>Basis of preparation</h4>
    <ol>
      <li>Prepared on an accrual basis from the school's fee, payroll and expense records. Fee income is recognised in the month billed; salaries in the payroll month; expenses on the expense date.</li>
      <li>Fees billed but unpaid at the reporting date are shown as receivables; salaries due but unpaid as payables.</li>
      <li>Fee waivers/concessions in the period (${notes.waivedFees.count} record(s), PKR ${acct(notes.waivedFees.amount)}) are excluded from income.</li>
      <li>Planned expenses not yet incurred (${notes.plannedExpenses.count} record(s), PKR ${acct(notes.plannedExpenses.amount)}) are commitments and are not recognised.</li>
      <li>Fixed assets, long-term liabilities and bank reconciliations are not recorded in this system and are therefore not included.</li>
    </ol>
  </div>

  <footer class="sans">${e(brand.name)} · Balance Sheet as at ${e(longDate(range.to))} · System-generated report</footer>
  <script>
    window.addEventListener("load", function () { setTimeout(function () { window.focus(); window.print(); }, 250); });
  </script>
</body></html>`;
}

/* ---------------------------- screen view ---------------------------- */

function Row({
  label,
  amount,
  variant = "item",
}: {
  label: ReactNode;
  amount?: number | null;
  variant?: "item" | "sub" | "subtotal" | "total" | "grand";
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-1 text-xs",
        variant === "item" && "pl-3 text-slate-700",
        variant === "sub" && "pl-7 text-slate-500",
        variant === "subtotal" && "pl-3 font-semibold text-slate-700",
        variant === "total" && "mt-1 rounded bg-slate-50 px-2 font-semibold text-[#10264D]",
        variant === "grand" && "mt-1 rounded bg-[#EEF2F8] px-2 py-1.5 text-sm font-bold text-[#0E2A4E]",
      )}
    >
      <span className="min-w-0">{label}</span>
      {amount !== null && amount !== undefined && (
        <span
          className={cn(
            "shrink-0 tabular-nums",
            variant === "subtotal" && "border-t border-slate-300 pt-0.5",
            variant === "grand" && "border-b-[3px] border-double border-[#0E2A4E]",
            amount < 0 && "text-red-600",
          )}
        >
          {acct(amount)}
        </span>
      )}
    </div>
  );
}

function Lines({ lines }: { lines: BalanceSheetLine[] }) {
  return (
    <>
      {lines.map((l) =>
        l.children?.length ? (
          <div key={l.label}>
            <Row label={l.label} />
            {l.children.map((c) => (
              <Row key={c.label} label={c.label} amount={c.amount} variant="sub" />
            ))}
            <Row label={`Total ${l.label.toLowerCase()}`} amount={l.amount} variant="subtotal" />
          </div>
        ) : (
          <Row key={l.label} label={l.label} amount={l.amount} />
        ),
      )}
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-1 border-b border-[#0E2A4E] pb-1 text-[11px] font-bold uppercase tracking-wider text-[#0E2A4E]">
      {children}
    </h4>
  );
}

export default function BalanceSheetCard({ className, preparedBy }: { className?: string; preparedBy?: string }) {
  const [initialFrom, initialTo] = PRESETS[2].range();
  const [from, setFrom] = useState(toYmd(initialFrom));
  const [to, setTo] = useState(toYmd(initialTo));
  const [preset, setPreset] = useState("year");

  const rangeError = from && to && from > to ? "Start date must be before end date." : "";
  const enabled = Boolean(from && to && !rangeError);

  const { data: bs, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["finance-balance-sheet", from, to],
    queryFn: () => fetchBalanceSheet(from, to),
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const applyPreset = (p: Preset) => {
    const [f, t] = p.range();
    setFrom(toYmd(f));
    setTo(toYmd(t));
    setPreset(p.key);
  };

  const print = () => {
    if (!bs) return;
    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) {
      window.alert("Please allow pop-ups for this site to print the balance sheet.");
      return;
    }
    win.document.open();
    win.document.write(buildPrintHtml(bs, preparedBy));
    win.document.close();
  };

  const periodText = useMemo(() => (bs ? `${longDate(bs.range.from)} – ${longDate(bs.range.to)}` : ""), [bs]);

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(16,38,77,0.06)] p-4 sm:p-5",
        className,
      )}
    >
      {/* Header + controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#10264D]">Balance Sheet</h3>
          <p className="text-xs text-slate-500">
            Statement of financial position{bs ? ` as at ${longDate(bs.range.to)}` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                type="button"
                size="sm"
                variant={preset === p.key ? "default" : "outline"}
                className="h-8 px-2.5 text-[11px]"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarRange className="hidden h-4 w-4 text-slate-400 sm:block" />
            <Input
              type="date"
              aria-label="From date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset("custom");
              }}
              className="h-8 w-[140px] text-xs"
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              aria-label="To date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset("custom");
              }}
              className="h-8 w-[140px] text-xs"
            />
          </div>
          <Button type="button" size="sm" className="h-8 text-xs" onClick={print} disabled={!bs || isFetching}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      {rangeError && <p className="mt-2 text-xs text-red-600">{rangeError}</p>}

      {/* Body */}
      {isLoading && enabled ? (
        <div className="grid h-40 place-items-center text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing balance sheet…
          </span>
        </div>
      ) : isError ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {error instanceof Error ? error.message : "Could not load the balance sheet."}
        </div>
      ) : bs ? (
        <div className={cn("mt-4 transition-opacity", isFetching && "opacity-60")}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>Period: {periodText}</span>
            <span>Amounts in PKR</span>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <SectionTitle>Assets</SectionTitle>
              <p className="mt-1 text-[11px] font-semibold italic text-slate-600">Current assets</p>
              <Lines lines={bs.assets.current} />
              <Row label="Total assets" amount={bs.assets.total} variant="grand" />
            </div>

            <div>
              <SectionTitle>Liabilities &amp; accumulated fund</SectionTitle>
              <p className="mt-1 text-[11px] font-semibold italic text-slate-600">Current liabilities</p>
              <Lines lines={bs.liabilities.current} />
              <Row label="Total liabilities" amount={bs.liabilities.total} variant="total" />
              <p className="mt-2 text-[11px] font-semibold italic text-slate-600">Accumulated fund</p>
              <Row label={`Balance as at ${longDate(bs.range.from)}`} amount={bs.fund.opening} />
              <Row
                label={`${bs.fund.surplus >= 0 ? "Surplus" : "Deficit"} for the period`}
                amount={bs.fund.surplus}
              />
              <Row label="Total accumulated fund" amount={bs.fund.closing} variant="total" />
              <Row label="Total liabilities & fund" amount={bs.totalLiabilitiesAndFund} variant="grand" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
            <div>
              <SectionTitle>Income &amp; expenditure</SectionTitle>
              <Lines lines={bs.incomeStatement.income} />
              <Row label="Total income" amount={bs.incomeStatement.totalIncome} variant="total" />
              <Lines lines={bs.incomeStatement.expenditure} />
              <Row label="Total expenditure" amount={bs.incomeStatement.totalExpenditure} variant="total" />
              <Row
                label={`Net ${bs.incomeStatement.surplus >= 0 ? "surplus" : "deficit"}`}
                amount={bs.incomeStatement.surplus}
                variant="grand"
              />
            </div>
            <div>
              <SectionTitle>Cash summary</SectionTitle>
              <Row label="Opening cash balance" amount={bs.cashFlow.opening} />
              <Row label="Add: fees received" amount={bs.cashFlow.receipts} />
              <Row label="Less: salaries paid" amount={-bs.cashFlow.salaryPayments} />
              <Row label="Less: expenses paid" amount={-bs.cashFlow.expensePayments} />
              <Row label="Closing cash balance" amount={bs.cashFlow.closing} variant="grand" />
            </div>
          </div>

          <div
            className={cn(
              "mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]",
              bs.balanced ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
            )}
          >
            {bs.balanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {bs.balanced
              ? "Balanced — total assets equal total liabilities and accumulated fund."
              : "Not balanced — please review the underlying records."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
