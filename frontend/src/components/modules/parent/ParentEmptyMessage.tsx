import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Full remaining-area centered empty / status message for parent mobile screens. */
export default function ParentEmptyMessage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[52vh] flex-1 flex-col items-center justify-center px-6 text-center",
        className,
      )}
    >
      <div className="max-w-[300px] text-[16px] font-semibold leading-snug text-[#334155]">{children}</div>
    </div>
  );
}
