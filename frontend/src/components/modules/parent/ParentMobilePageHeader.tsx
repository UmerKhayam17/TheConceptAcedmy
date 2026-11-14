import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sticky parent mobile title bar — stays under the status bar while content scrolls. */
export default function ParentMobilePageHeader({
  title,
  onBack,
  trailing,
  titleExtra,
  className,
}: {
  title: string;
  onBack?: () => void;
  trailing?: ReactNode;
  titleExtra?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 shrink-0 bg-white px-4 pb-2.5 pt-[calc(var(--safe-top)+0.5rem)]",
        className,
      )}
    >
      <div className="relative flex h-10 items-center">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="relative z-10 grid h-9 w-9 place-items-center rounded-full bg-[#DBEAFE] text-[#1F2937]"
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
        ) : (
          <span className="w-9 shrink-0" aria-hidden />
        )}
        <h1 className="absolute inset-x-12 flex items-center justify-center gap-2 truncate text-center text-[22px] font-extrabold tracking-tight text-[#111827]">
          <span className="truncate">{title}</span>
          {titleExtra}
        </h1>
        <div className="relative z-10 ml-auto flex min-w-9 shrink-0 items-center justify-end">
          {trailing || <span className="w-9" aria-hidden />}
        </div>
      </div>
    </header>
  );
}
