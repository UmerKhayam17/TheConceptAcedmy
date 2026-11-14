import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ParentOption = { value: string; label: string };

export function ParentOptionSheet({
  open,
  title,
  options,
  value,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  options: ParentOption[];
  value: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end bg-[#4B5563]/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[72vh] w-full overflow-y-auto rounded-t-[28px] bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,23,42,0.12)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center pt-3">
          <span className="h-1 w-10 rounded-full bg-[#E5E7EB]" />
        </div>
        <h2 className="px-5 pb-3 pt-4 text-[20px] font-bold text-[#111827]">{title}</h2>
        <ul>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value} className="border-t border-[#EEF2F6]">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  className={cn(
                    "w-full px-5 py-4 text-left text-[16px]",
                    selected ? "font-medium text-[#22C5D6]" : "font-medium text-[#1F2937]",
                  )}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

export function ParentOptionField({
  label,
  sheetTitle,
  options,
  value,
  onChange,
  placeholder = "Select",
  valueClassName,
  accent,
}: {
  label?: string;
  sheetTitle: string;
  options: ParentOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  valueClassName?: string;
  accent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <>
      <button
        type="button"
        onClick={() => options.length && setOpen(true)}
        disabled={!options.length}
        className="block w-full min-w-0 text-left disabled:opacity-60"
      >
        {label ? (
          <span className="text-[11px] font-semibold tracking-wide text-[#A8B3C0]">{label}</span>
        ) : null}
        <span className="relative mt-1 flex items-center">
          <span className={cn("truncate pr-6 text-[15px] font-bold text-[#111827]", valueClassName)}>
            {current?.label || placeholder}
          </span>
          <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111827]" />
        </span>
        {accent ? <span className="mt-1 block h-0.5 w-14 rounded-full bg-[#22C5D6]" /> : null}
      </button>
      <ParentOptionSheet
        open={open}
        title={sheetTitle}
        options={options}
        value={value}
        onClose={() => setOpen(false)}
        onSelect={onChange}
      />
    </>
  );
}
