import type { AdditionalCharge } from "@/lib/studentManagementApi";
import { formatPkr } from "./studentDisplayUtils";

export function AdditionalChargesChecklist({
  charges,
  selectedIds,
  onChange,
  emptyLabel = "No additional charges available for this student.",
}: {
  charges: AdditionalCharge[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel?: string;
}) {
  if (!charges.length) {
    return <p className="text-xs text-muted-foreground px-3 py-2">{emptyLabel}</p>;
  }

  return (
    <ul className="divide-y max-h-44 overflow-y-auto">
      {charges.map((charge) => {
        const checked = selectedIds.includes(charge._id);
        return (
          <li key={charge._id}>
            <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selectedIds.filter((id) => id !== charge._id)
                      : [...selectedIds, charge._id]
                  )
                }
              />
              <span className="flex-1 min-w-0 font-medium">{charge.name}</span>
              <span className="font-semibold tabular-nums">{formatPkr(charge.amount)}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
