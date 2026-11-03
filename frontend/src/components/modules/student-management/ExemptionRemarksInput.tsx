import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { EXEMPTION_REMARKS } from "./registerStudentForm";

const OTHER = "__other__";

const isPreset = (v: string) => EXEMPTION_REMARKS.includes(v);

/**
 * Exemption reason: choose a standard reason from the dropdown, or pick
 * "Other" to type a custom one.
 */
export function ExemptionRemarksInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  // A saved value that isn't one of the presets is a custom ("Other") remark.
  const [custom, setCustom] = useState(() => !!value && !isPreset(value));

  useEffect(() => {
    if (value && isPreset(value)) setCustom(false);
    else if (value && !isPreset(value)) setCustom(true);
  }, [value]);

  const fieldCls = cn(
    "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70",
    className,
  );

  return (
    <div className="flex items-start gap-2">
      <select
        className={cn(fieldCls, custom && "flex-1")}
        disabled={disabled}
        value={custom ? OTHER : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(v);
          }
        }}
      >
        <option value="">Select a reason</option>
        {EXEMPTION_REMARKS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
        <option value={OTHER}>Other (custom)</option>
      </select>
      {custom && (
        <textarea
          autoFocus
          rows={2}
          maxLength={200}
          placeholder="Write custom remarks"
          className={cn(
            fieldCls,
            "h-auto min-h-10 flex-[1.5] resize-y py-2 leading-snug",
          )}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
